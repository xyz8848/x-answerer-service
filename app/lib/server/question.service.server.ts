import type {
  IUnifiedSearchRequest,
  IUnifiedSearchResponse,
  ITikuAdapterAnswer,
  TikuAdapterQuestionType,
  OCSJSQuestionType,
  IAiProvider,
} from '@/lib/types';
import { QuestionType, QuestionStatus } from '@/lib/types';
import { prisma } from './db.server';
import { httpError } from './http.server';
import { resolveAiSearch, type ResolvedAiSearch } from './ai.server';

/**
 * Levenshtein 编辑距离（两行滚动数组实现）。
 * 自带实现以避免 fast-levenshtein（CJS 包）在 Vite SSR 下的互操作问题。
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 其它题库列表配置键（SystemConfig，JSON 数组：[{name, url, token, enabled}]） */
const UPSTREAM_BANKS_KEY = 'UPSTREAM_BANKS';
/** 其它题库总开关（'true'/'false'，缺失视为开启） */
const UPSTREAM_ENABLED_KEY = 'UPSTREAM_ENABLED';

/** 读取其它题库总开关 */
async function isUpstreamEnabled(): Promise<boolean> {
  const raw = await prisma.systemConfig.findUnique({ where: { key: UPSTREAM_ENABLED_KEY } });
  return raw?.value !== 'false';
}

/** 其它题库配置项 */
interface UpstreamBank {
  name: string;
  url: string;
  token: string;
  enabled: boolean;
}

/** 读取并解析其它题库列表（容错：非法 JSON / 非数组 / 缺字段 / 无效 URL 均过滤） */
async function getUpstreamBanks(): Promise<UpstreamBank[]> {
  const raw = await prisma.systemConfig.findUnique({ where: { key: UPSTREAM_BANKS_KEY } });
  if (!raw?.value) return [];
  try {
    const parsed: unknown = JSON.parse(raw.value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b: any) => {
        if (!b || typeof b.url !== 'string' || !b.url.trim()) return false;
        try {
          new URL(b.url);
          return true;
        } catch {
          return false;
        }
      })
      .map((b: any) => ({
        name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : '未命名题库',
        url: b.url.trim(),
        token: typeof b.token === 'string' ? b.token : '',
        enabled: b.enabled !== false,
      }));
  } catch {
    return [];
  }
}

// ==================== 统一查题 ====================

/** 查题流水线结果（与请求/响应格式无关） */
export interface SearchPipelineResult {
  /** 是否命中 */
  hit: boolean;
  /** 命中的题目标题（可能来自其它题库返回的原文） */
  title: string;
  answerParts: string[];
  msg: string;
}

/**
 * 查题流水线：本地精确 -> 本地模糊(0.8) -> 上游 OCSJS API -> AI 搜题兜底 -> 未命中记录 PENDING。
 * AI 作答按「供应商+模型」优先级链降级尝试，答案直接入库为「已解答」
 * （source='auto_record' 仅表示题目来源，answeredBy 记录 `ai:供应商id/模型id`），走人工验证流程。
 * 格式无关，统一 / OCSJS / TikuAdapter 三种入口共用。
 */
async function runSearchPipeline(
  question: string,
  options: string[],
  internalType: QuestionType | undefined,
): Promise<SearchPipelineResult> {
  if (!question) {
    return { hit: false, title: '', answerParts: [], msg: '题目不能为空' };
  }

  // 1. 精确匹配本地题库
  const exactMatch = await findExact(question, internalType);
  if (exactMatch) {
    return {
      hit: true,
      title: exactMatch.title,
      answerParts: answerFromStored(exactMatch.answer),
      msg: '成功',
    };
  }

  // 2. Levenshtein 模糊匹配（相似度 > 0.8）
  const fuzzyMatch = await findFuzzy(question, internalType, 0.8);
  if (fuzzyMatch) {
    return {
      hit: true,
      title: fuzzyMatch.title,
      answerParts: answerFromStored(fuzzyMatch.answer),
      msg: '成功（模糊匹配）',
    };
  }

  // 3. 调用上游 OCSJS API（命中的答案同样入库为「已解答」，answeredBy 标记来源题库）
  const upstream = await searchFromOCSJS(question, options, internalType);
  if (upstream) {
    await recordAutoAnswered(
      upstream.title || question,
      upstream.answerParts,
      options,
      internalType,
      upstream.bank ? `qb:${upstream.bank}` : 'qb:未知',
    );
    return {
      hit: true,
      title: upstream.title || question,
      answerParts: upstream.answerParts,
      msg: '成功',
    };
  }

  // 4. AI 搜题兜底（本地与上游均未命中时按「供应商+模型」优先级链作答，答案入库等待人工验证）
  const aiSearch = await resolveAiSearch();
  // 答题范围白名单：未标注题型视为「其它」（OTHER），不在范围内则跳过 AI 环节
  const effectiveType = internalType ?? 'OTHER';
  if (aiSearch && aiSearch.answerTypes.includes(effectiveType)) {
    const aiResult = await searchFromLLM(aiSearch, question, options, internalType);
    if (aiResult) {
      await recordAutoAnswered(
        question,
        aiResult.answerParts,
        options,
        internalType,
        aiResult.answeredBy,
      );
      return {
        hit: true,
        title: question,
        answerParts: aiResult.answerParts,
        msg: '成功（AI 生成，待验证）',
      };
    }
  }

  // 5. 未命中，记录待收录题目
  await recordPending(question, options, internalType);

  return { hit: false, title: question, answerParts: [], msg: '未查询到答案' };
}

/** OCSJS 格式查题入口：仅接受 OCSJS 请求字段，返回 OCSJS 约定响应（code/data） */
export async function searchOcsjs(body: {
  title?: string;
  options?: string | string[];
  type?: OCSJSQuestionType;
}): Promise<{
  code: number;
  msg: string;
  data: { question: string; answer: string; times: number } | null;
}> {
  const question = String(body.title ?? '').trim();
  const options = normalizeOptions(body.options);
  const internalType = toInternalType(body.type);

  const result = await runSearchPipeline(question, options, internalType);
  if (result.hit) {
    return {
      code: 1,
      msg: result.msg,
      data: { question: result.title, answer: result.answerParts.join('#'), times: 1 },
    };
  }
  return { code: 0, msg: result.msg, data: null };
}

/** TikuAdapter 格式查题入口：仅接受 TikuAdapter 请求字段，返回 TikuAdapter 约定响应（answer.*） */
export async function searchTikuAdapter(body: {
  question?: string;
  options?: string | string[];
  type?: TikuAdapterQuestionType;
  plat?: number;
}): Promise<IUnifiedSearchResponse> {
  const question = String(body.question ?? '').trim();
  const options = normalizeOptions(body.options);
  const internalType = toInternalType(body.type);
  const plat = typeof body.plat === 'number' ? body.plat : 0;

  const result = await runSearchPipeline(question, options, internalType);
  if (result.hit) {
    return {
      code: 1,
      msg: result.msg,
      data: { title: result.title, answer: result.answerParts.join('#') },
      question,
      options,
      type: toTikuAdapterType(internalType),
      plat,
      answer: computeAnswer(result.answerParts, options),
    };
  }
  return buildMissResponse(question, options, plat);
}

/** 归一化选项：OCSJS 为 '\n' 分隔字符串，TikuAdapter 为字符串数组（兼容 {key,value} 对象数组） */
function normalizeOptions(options?: unknown): string[] {
  if (!options) return [];
  const list =
    typeof options === 'string' ? options.split('\n') : Array.isArray(options) ? options : [options];
  return list
    .map((o): string => {
      if (typeof o === 'string') return o.trim();
      if (o && typeof o === 'object') {
        const obj = o as Record<string, unknown>;
        for (const key of ['value', 'text', 'content', 'key']) {
          const v = obj[key];
          if (typeof v === 'string' && v.trim()) return v.trim();
        }
      }
      return '';
    })
    .filter(Boolean);
}

/** 外部题型 -> 内部 QuestionType（OCSJS 字符串 / TikuAdapter 数值） */
function toInternalType(
  type?: IUnifiedSearchRequest['type'],
): QuestionType | undefined {
  if (type === undefined) return undefined;
  if (typeof type === 'number') {
    switch (type) {
      case 0:
        return QuestionType.SINGLE;
      case 1:
        return QuestionType.MULTIPLE;
      case 2:
        return QuestionType.FILL;
      case 3:
        return QuestionType.JUDGE;
      case 4:
        return QuestionType.SHORT_ANSWER;
      default:
        return undefined;
    }
  }
  switch (type) {
    case 'single':
      return QuestionType.SINGLE;
    case 'multiple':
      return QuestionType.MULTIPLE;
    case 'completion':
      return QuestionType.FILL;
    case 'judgement':
      return QuestionType.JUDGE;
    default:
      return undefined;
  }
}

/** 内部 QuestionType -> TikuAdapter 数值题型 */
function toTikuAdapterType(type?: QuestionType): TikuAdapterQuestionType {
  switch (type) {
    case QuestionType.SINGLE:
      return 0;
    case QuestionType.MULTIPLE:
      return 1;
    case QuestionType.FILL:
      return 2;
    case QuestionType.JUDGE:
      return 3;
    case QuestionType.SHORT_ANSWER:
      return 4;
    default:
      return 0;
  }
}

/** 内部 QuestionType -> OCSJS 题型字符串（简答无对应，返回 undefined） */
function toOCSJSType(type?: QuestionType): string | undefined {
  switch (type) {
    case QuestionType.SINGLE:
      return 'single';
    case QuestionType.MULTIPLE:
      return 'multiple';
    case QuestionType.FILL:
      return 'completion';
    case QuestionType.JUDGE:
      return 'judgement';
    default:
      return undefined;
  }
}

/** 选项下标 -> 字母角标（0->A，26 及以上回退为数字） */
function indexToLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** 去掉选项文本前的 "A." / "A、" / "(A)" 角标，便于答案比对 */
function stripOptionLabel(option: string): string {
  return option.replace(/^\(?[A-Za-z0-9]{1,2}\s*[.、．)）]\s*/, '').trim();
}

/** 答案输入文本解析：'#' 分隔多选/多空，拆为答案数组 */
function parseAnswerInput(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split('#')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 题库 answer（jsonb 数组）安全读取为字符串数组（兼容历史文本遗留数据） */
function answerFromStored(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split('#')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** 依据答案数组与选项，计算 TikuAdapter 风格的角标/下标信息（协议层文本仍以 '#' 拼接） */
function computeAnswer(answerParts: string[], options: string[]): ITikuAdapterAnswer {
  const parts = answerParts.map((s) => s.trim()).filter(Boolean);
  const answerText = parts.join('#');

  const normalizedOptions = options.map((o) => stripOptionLabel(o));
  const answerIndex: number[] = [];
  for (const part of parts) {
    let idx = normalizedOptions.findIndex((o) => o === part);
    if (idx < 0) idx = normalizedOptions.findIndex((o) => o.includes(part) || part.includes(o));
    if (idx >= 0 && !answerIndex.includes(idx)) answerIndex.push(idx);
  }
  // 下标按选项顺序排序，保证 answerKey 有序
  answerIndex.sort((a, b) => a - b);
  const answerKey = answerIndex.map((i) => indexToLetter(i));

  return {
    answerKey,
    answerKeyText: answerKey.join('#'),
    answerIndex,
    answerText,
    bestAnswer: parts,
    allAnswer: parts.length ? [parts] : [],
  };
}

/** 未命中响应 */
function buildMissResponse(
  question: string,
  options: string[],
  plat: number,
): IUnifiedSearchResponse {
  return {
    code: 0,
    msg: '未查询到答案',
    data: null,
    question,
    options,
    type: 0,
    plat,
    answer: {
      answerKey: [],
      answerKeyText: '',
      answerIndex: [],
      answerText: '',
      bestAnswer: [],
      allAnswer: [],
    },
  };
}

// ==================== 本地题库匹配 ====================

/** 精确匹配题目 */
export async function findExact(title: string, type?: QuestionType) {
  const where: any = {
    title,
    status: { in: [QuestionStatus.ANSWERED, QuestionStatus.VERIFIED] },
  };
  if (type) where.type = type;

  return prisma.question.findFirst({ where });
}

/**
 * Levenshtein 模糊匹配
 * 返回相似度 > threshold 的最佳匹配结果
 */
export async function findFuzzy(
  title: string,
  type?: QuestionType,
  threshold = 0.8,
) {
  const where: any = {
    status: { in: [QuestionStatus.ANSWERED, QuestionStatus.VERIFIED] },
  };
  if (type) where.type = type;

  const questions = await prisma.question.findMany({ where });

  let bestMatch: any = null;
  let bestSimilarity = 0;

  for (const q of questions) {
    const distance = levenshtein(title, q.title);
    const maxLen = Math.max(title.length, q.title.length);
    const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = q;
    }
  }

  if (bestSimilarity >= threshold && bestMatch) {
    console.log(
      `模糊匹配命中: similarity=${bestSimilarity.toFixed(4)}, id=${bestMatch.id}`,
    );
    return bestMatch;
  }

  return null;
}

// ==================== 上游 OCSJS API ====================

/**
 * 调用其它题库搜题：并发查询 SystemConfig 中配置的所有启用题库，按配置顺序取第一个命中。
 * 单个题库请求体对齐 OCSJS 官方题库格式：
 * 请求：{ token?, title, options('\n' 分隔), type, images, v, suggestion_title, suggestion_options }
 * 响应：{ code: 1, data: { question, answer, times, ai }, message }，code !== 1 = 未命中
 */
export async function searchFromOCSJS(
  title: string,
  options: string[],
  type?: QuestionType,
  opts?: { ignoreMasterSwitch?: boolean },
): Promise<{ title: string; answerParts: string[]; bank?: string } | null> {
  try {
    // 总开关可被批量补全绕过；单个题库的 enabled 不受影响，禁用的题库始终跳过
    if (!opts?.ignoreMasterSwitch && !(await isUpstreamEnabled())) return null;
    const banks = (await getUpstreamBanks()).filter((b) => b.enabled);
    if (banks.length === 0) return null;

    // 并发查询所有启用的其它题库，按配置顺序取第一个命中
    const results = await Promise.allSettled(
      banks.map((bank) => queryUpstreamBank(bank, title, options, type)),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        if (banks.length > 1) console.log(`其它题库命中: ${banks[i].name}`);
        return { ...r.value, bank: banks[i].name };
      }
      if (r.status === 'rejected') {
        console.error(`其它题库调用异常: ${banks[i].name}`, r.reason);
      }
    }
    return null;
  } catch (error) {
    console.error('其它题库调用异常', error);
    return null;
  }
}

/** 查询单个其它题库（OCSJS 官方题库格式） */
async function queryUpstreamBank(
  bank: UpstreamBank,
  title: string,
  options: string[],
  type?: QuestionType,
): Promise<{ title: string; answerParts: string[] } | null> {
  // 请求体对齐 OCSJS 官方题库格式：token/title/options/type/images/v/suggestion_*
  const payload: Record<string, unknown> = {
    title,
    options: options.join('\n'),
    type: toOCSJSType(type) ?? 'unknown',
    images: [],
    v: '2',
    suggestion_title: '',
    suggestion_options: '',
  };
  if (bank.token) payload.token = bank.token;

  const response = await fetch(bank.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    console.warn(`其它题库请求失败: ${bank.name} -> ${response.status}`);
    return null;
  }

  // 官方题库响应格式：{ code: 1, data: { question, answer, times, ai }, message }
  const data: any = await response.json().catch(() => null);
  if (!data || data.code !== 1) return null;

  const answer = data.data?.answer ?? data.answer;
  if (!answer) return null;

  const matchedTitle = data.data?.question ?? data.question ?? data.data?.title ?? '';
  const answerParts = String(answer)
    .split('#')
    .map((s) => s.trim())
    .filter(Boolean);
  if (answerParts.length === 0) return null;
  return { title: matchedTitle, answerParts };
}

// ==================== AI 搜题 ====================

/** 题型中文名（用于 LLM prompt） */
const AI_TYPE_LABELS: Record<QuestionType, string> = {
  [QuestionType.SINGLE]: '单选题',
  [QuestionType.MULTIPLE]: '多选题',
  [QuestionType.JUDGE]: '判断题',
  [QuestionType.FILL]: '填空题',
  [QuestionType.SHORT_ANSWER]: '简答题',
};

/** 构建 LLM system prompt */
function buildAiSystemPrompt(customPrompt: string): string {
  const lines = [
    '你是一名严谨的答题助手。请根据题目与选项给出正确答案。',
    '',
    '要求：',
    '1. 只输出一个 JSON 对象，不要输出任何其他文字、解释或 markdown 代码块。',
    '2. JSON 格式：{"answer": "<答案>", "confidence": "high|medium|low"}',
    '3. 按题型输出 answer：',
    '   - 单选题：只输出选项字母，如 "B"',
    '   - 多选题：输出多个选项字母，用英文逗号分隔，如 "A,C"，按字母顺序',
    '   - 判断题：只输出 "正确" 或 "错误"',
    '   - 填空题：每个空的答案用 "#" 分隔，按空顺序，如 "3#5"',
    '   - 简答题：输出完整答案文本，简洁准确',
    '4. 选择题必须从给定选项中选择，禁止编造选项中不存在的答案。',
    '5. 若无法确定，给出最可能的答案并将 confidence 设为 "low"。',
  ];
  if (customPrompt) lines.push(`6. 补充要求：${customPrompt}`);
  return lines.join('\n');
}

/** 构建 LLM user prompt */
function buildAiUserPrompt(
  question: string,
  options: string[],
  type?: QuestionType,
): string {
  const lines: string[] = [];
  lines.push(`题型：${type ? AI_TYPE_LABELS[type] : '简答题'}（未知题型按简答处理）`);
  lines.push(`题目：${question}`);

  if (type === QuestionType.SINGLE || type === QuestionType.MULTIPLE) {
    lines.push('选项：');
    options.forEach((o, i) => lines.push(`${indexToLetter(i)}. ${o}`));
  } else if (type === QuestionType.JUDGE) {
    lines.push('（判断题：请依据题意判断正误）');
  }

  return lines.join('\n');
}

/** 从 LLM 回复中容错提取 JSON 对象（直接解析 -> 剥围栏 -> 首尾大括号截取），全部失败返回 null */
function extractJson(text: string): Record<string, unknown> | null {
  const attempts: string[] = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1]);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(text.slice(first, last + 1));

  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt.trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // 继续尝试下一种解析方式
    }
  }
  return null;
}

/** 判断题答案归一化：优先回匹配给定选项文本，否则返回「正确/错误」（单元素数组） */
function normalizeJudgeAnswer(raw: string, options: string[]): string[] | null {
  const s = raw.trim();
  const isPositive = /^(正确|对|是的?|√|✓|true|t|yes|y|a)$/i.test(s);
  const isNegative = /^(错误|不对|不正确|错|×|✗|false|f|no|n|b)$/i.test(s);
  if (!isPositive && !isNegative) return null;

  const normalizedOptions = options.map((o) => stripOptionLabel(o));
  const keywords = isPositive ? ['正确', '对', '是', 'true'] : ['错误', '不对', '不正确', '错', '否', 'false'];
  for (const keyword of keywords) {
    const idx = normalizedOptions.findIndex((o) => o === keyword || o.startsWith(keyword));
    if (idx >= 0) return [normalizedOptions[idx]];
  }
  return [isPositive ? '正确' : '错误'];
}

/**
 * 选择题答案归一化：把 LLM 返回的选项字母（"B" / "A,C" / "AC" / "(A)"）或选项文本
 * 映射回选项原文数组（存储为 JSON 数组；协议输出时以 '#' 拼接）。
 * 纯字母输出若无法映射到选项（如超出选项范围）视为失败返回 null。
 */
function normalizeChoiceAnswer(raw: string, options: string[]): string[] | null {
  if (!raw.trim() || options.length === 0) return null;

  // 去除首尾包裹性标点（如 "(A)"、"【A】"、引号、句点），便于识别纯角标输出
  const cleaned = raw
    .trim()
    .replace(/^[\s（(【\["']*/, '')
    .replace(/[\s）)】\]"'。.]*$/, '')
    .trim();
  if (!cleaned) return null;

  // 1) 字母角标形式：如 "B"、"A,C"、"AC"（连续字母自动按选项顺序排序去重）
  const letterStr = cleaned.toUpperCase().replace(/[^A-Z]/g, '');
  const isLetterish = /^[A-Za-z][A-Za-z\s,，、;；#]*$/.test(cleaned);
  if (isLetterish && letterStr.length >= 1 && letterStr.length <= 10) {
    // 纯字母输出但数量超过选项数，无法映射，视为失败
    if (letterStr.length > options.length) return null;
    const indexes = [...letterStr]
      .map((ch) => ch.charCodeAt(0) - 65)
      .sort((a, b) => a - b);
    if (indexes.some((i) => i < 0 || i >= options.length)) return null;
    const unique = [...new Set(indexes)];
    return unique.map((i) => stripOptionLabel(options[i]));
  }

  // 2) 文本形式：精确匹配 -> 双向包含匹配，未匹配片段原样保留
  const parts = cleaned
    .split(/[,，、;；#]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const normalizedOptions = options.map((o) => stripOptionLabel(o));
  const result: string[] = [];
  for (const part of parts) {
    let idx = normalizedOptions.findIndex((o) => o === part);
    if (idx < 0) idx = normalizedOptions.findIndex((o) => o.includes(part) || part.includes(o));
    if (idx >= 0) {
      if (!result.includes(normalizedOptions[idx])) result.push(normalizedOptions[idx]);
    } else {
      result.push(part);
    }
  }
  return result.length ? result : null;
}

/** 按题型把 LLM 原始答案归一化为答案数组；无法归一化返回 null */
function normalizeAiAnswer(raw: string, options: string[], type?: QuestionType): string[] | null {
  switch (type) {
    case QuestionType.JUDGE:
      return normalizeJudgeAnswer(raw, options);
    case QuestionType.SINGLE:
    case QuestionType.MULTIPLE:
      return normalizeChoiceAnswer(raw, options);
    case QuestionType.FILL:
    case QuestionType.SHORT_ANSWER:
    default: {
      const text = raw.replace(/\s+/g, ' ').trim();
      if (!text) return null;
      // 填空题多空以 '#' 分隔，按空拆成数组存储
      return text
        .split('#')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
}

/** AI 搜题在飞请求去重（key: type:title），防止并发同题重复消耗 token（整链只跑一次） */
const aiInflight = new Map<string, Promise<{ answerParts: string[]; answeredBy: string } | null>>();

/**
 * 按模型优先级链依次调用 OpenAI 兼容 chat/completions 作答，失败自动降级下一级。
 * 返回归一化后的答案数组及 `供应商id/模型id`；全部失败（超时/异常/解析失败/答案为空）返回 null，由调用方降级原流程。
 */
async function searchFromLLM(
  search: ResolvedAiSearch,
  title: string,
  options: string[],
  type?: QuestionType,
): Promise<{ answerParts: string[]; answeredBy: string } | null> {
  // 选择题必须带选项，否则无法把答案映射回选项
  const isChoice = type === QuestionType.SINGLE || type === QuestionType.MULTIPLE;
  if (isChoice && options.length === 0) return null;

  const key = `${type ?? 'any'}:${title}`;
  const inflight = aiInflight.get(key);
  if (inflight) return inflight;

  const task = (async (): Promise<{ answerParts: string[]; answeredBy: string } | null> => {
    for (const { provider, modelId } of search.chain) {
      try {
        const answerParts = await callChatCompletions(provider, modelId, search, title, options, type);
        if (answerParts) {
          return { answerParts, answeredBy: `ai:${provider.id}/${modelId}` };
        }
        console.warn(`AI 作答失败，降级下一模型: ${provider.name}/${modelId}`);
      } catch (error) {
        // 每级独立容错：超时/网络异常/解析失败均只记日志，继续下一级（严禁打印 apiKey）
        console.warn(
          `AI 作答异常，降级下一模型: ${provider.name}/${modelId}`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    return null;
  })();

  aiInflight.set(key, task);
  try {
    return await task;
  } finally {
    aiInflight.delete(key);
  }
}

/**
 * 调用单个「供应商+模型」作答：请求 OpenAI 兼容 chat/completions，容错解析并归一化答案。
 * 返回 null 表示该级失败（HTTP 非 ok / 无 content / 解析失败 / 归一化失败），由上层降级。
 */
async function callChatCompletions(
  provider: IAiProvider,
  modelId: string,
  search: ResolvedAiSearch,
  title: string,
  options: string[],
  type?: QuestionType,
): Promise<string[] | null> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      temperature: search.temperature,
      messages: [
        { role: 'system', content: buildAiSystemPrompt(search.customPrompt) },
        { role: 'user', content: buildAiUserPrompt(title, options, type) },
      ],
      // 不兼容 response_format 的网关会忽略该字段，解析端有容错兜底
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(search.timeoutMs),
  });

  if (!response.ok) {
    console.error(`AI 搜题请求失败: ${provider.name}/${modelId} -> HTTP ${response.status}`);
    return null;
  }

  const data: any = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    console.error(`AI 搜题响应缺少 content: ${provider.name}/${modelId}`);
    return null;
  }

  const parsed = extractJson(content);
  const rawAnswer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : '';
  if (!rawAnswer) {
    console.error(`AI 搜题输出解析失败（answer 为空）: ${provider.name}/${modelId}`);
    return null;
  }

  return normalizeAiAnswer(rawAnswer, options, type);
}

/** 解析选项文本前的 "A." / "A、" 式角标（recordPending / recordAutoAnswered 共用） */
function parseOptionLabels(options?: string[]): { label?: string; content: string }[] {
  if (!options?.length) return [];
  return options
    .map((opt) => {
      const trimmed = opt.trim();
      const match = trimmed.match(/^([A-Z])\s*[.、．)）]\s*(.+)$/);
      return match ? { label: match[1], content: match[2] } : { content: trimmed };
    })
    .filter((o) => o.content);
}

/**
 * 记录自动获取的答案（其它题库命中 / AI 兜底），直接入库为「已解答」，走人工验证流程。
 * source 仅表示题目来源（沿用 auto_record）；answeredBy 记录来源标识
 * （其它题库为 `qb:<题库名>`，AI 为 `ai:供应商id/模型id`，人工标注为 `user:<用户id>`）。
 * 已存在同题「已解答」记录时跳过；存在「待收录」记录时原地升级为已解答，避免产生重复行。
 */
async function recordAutoAnswered(
  title: string,
  answerParts: string[],
  options: string[],
  type: QuestionType | undefined,
  answeredBy: string,
) {
  try {
    const existingAnswered = await prisma.question.findFirst({
      where: { title, status: QuestionStatus.ANSWERED },
    });
    if (existingAnswered) return;

    // 同题已有「待收录」记录时原地升级，而不是新建一行
    const existingPending = await prisma.question.findFirst({
      where: { title, status: QuestionStatus.PENDING },
    });
    if (existingPending) {
      await prisma.question.update({
        where: { id: existingPending.id },
        data: {
          answer: answerParts,
          status: QuestionStatus.ANSWERED,
          answeredBy,
          answeredAt: new Date(),
        },
      });
      console.log(`待收录题目已由自动作答补全: ${title.substring(0, 50)}...`);
      return;
    }

    await prisma.question.create({
      data: {
        title,
        type: type || QuestionType.SINGLE,
        options: parseOptionLabels(options),
        answer: answerParts,
        status: QuestionStatus.ANSWERED,
        source: 'auto_record',
        answeredBy,
        answeredAt: new Date(),
      },
    });
    console.log(`已记录自动作答答案（待验证）: ${title.substring(0, 50)}...`);
  } catch (error) {
    // 入库失败不影响本次响应
    console.error('自动作答答案入库失败', error instanceof Error ? error.message : error);
  }
}

// ==================== 题目管理 ====================

/** 记录待收录题目 */
export async function recordPending(
  title: string,
  options?: string[],
  type?: QuestionType,
) {
  // 检查是否已存在相同标题的待收录题目
  const existing = await prisma.question.findFirst({
    where: { title, status: QuestionStatus.PENDING },
  });
  if (existing) return;

  // 解析选项：优先提取 "A." 式角标
  const parsedOptions = parseOptionLabels(options);

  await prisma.question.create({
    data: {
      title,
      type: type || QuestionType.SINGLE,
      options: parsedOptions,
      status: QuestionStatus.PENDING,
      source: 'auto_record',
    },
  });

  console.log(`已记录待收录题目: ${title.substring(0, 50)}...`);
}

/** 获取题目列表（支持按状态筛选与关键词搜索） */
export async function getPendingQuestions(page: number, pageSize: number, status?: string, search?: string) {
  const where: any = {};
  // 不传 status 时返回所有状态的题目
  if (status && Object.values(QuestionStatus).includes(status as QuestionStatus)) {
    where.status = status;
  }
  if (search && search.trim()) {
    where.title = { contains: search.trim() };
  }
  const [items, total] = await Promise.all([
    prisma.question.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.question.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** 手动创建题目（答案支持 '#' 分隔多选/多空，存储为 JSON 数组） */
export async function createQuestion(data: { title: string; type: string; answer?: string; options?: any; tags?: string[] }) {
  const answerParts = parseAnswerInput(data.answer);
  return prisma.question.create({
    data: {
      title: data.title,
      type: (data.type as QuestionType) || QuestionType.SINGLE,
      options: data.options || [],
      answer: answerParts,
      status: answerParts.length ? QuestionStatus.ANSWERED : QuestionStatus.PENDING,
      source: 'manual',
      tags: data.tags || [],
    },
  });
}

/** 给题目标注答案（输入支持 '#' 分隔多选/多空，存储为 JSON 数组） */
export async function answerQuestion(
  id: string,
  answer: string,
  options?: any,
  userId?: string,
) {
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) httpError(404, '题目不存在');

  const answerParts = parseAnswerInput(answer);
  const updateData: any = {
    answer: answerParts,
    status: QuestionStatus.ANSWERED,
    // 人工标注来源标记：user:<用户数字id>
    answeredBy: userId ? `user:${userId}` : null,
    answeredAt: new Date(),
  };
  if (options) updateData.options = options;

  await prisma.question.update({
    where: { id },
    data: updateData,
  });
}

/** 验证题目 */
export async function verifyQuestion(id: string) {
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) httpError(404, '题目不存在');
  if (question.status !== QuestionStatus.ANSWERED) {
    httpError(400, '只能验证已解答的题目');
  }

  await prisma.question.update({
    where: { id },
    data: { status: QuestionStatus.VERIFIED },
  });
}

/** 拒绝题目（仅改状态，保留已标注的答案内容） */
export async function rejectQuestion(id: string) {
  await prisma.question.update({
    where: { id },
    data: {
      status: QuestionStatus.REJECTED,
      answeredBy: null,
      answeredAt: null,
    },
  });
}

/** 批量操作题目（verify：验证已解答题目；reject：拒绝题目；delete：物理删除已拒绝题目） */
export async function batchOperateQuestions(action: 'verify' | 'reject' | 'delete', ids: string[]) {
  if (action === 'verify') {
    // 仅已解答状态可验证，其余自动跳过
    const result = await prisma.question.updateMany({
      where: { id: { in: ids }, status: QuestionStatus.ANSWERED },
      data: { status: QuestionStatus.VERIFIED },
    });
    return { matched: result.count };
  }

  if (action === 'delete') {
    // 仅已拒绝状态的题目可物理删除，其余自动跳过
    const result = await prisma.question.deleteMany({
      where: { id: { in: ids }, status: QuestionStatus.REJECTED },
    });
    return { matched: result.count };
  }

  const result = await prisma.question.updateMany({
    where: { id: { in: ids } },
    // 拒绝仅改状态，保留已标注的答案内容
    data: { status: QuestionStatus.REJECTED, answeredBy: null, answeredAt: null },
  });
  return { matched: result.count };
}

/** 批量补全答案的来源模式：upstream = 从其它题库拉取，ai = AI 作答 */
export type BatchAnswerMode = 'upstream' | 'ai';

export interface BatchAnswerResult {
  /** 选中总数 */
  total: number;
  /** 跳过数（非待收录状态的题目，含已拒绝/已解答/已验证） */
  skipped: number;
  /** 成功补全答案数 */
  succeeded: number;
  /** 查询未命中/失败数 */
  failed: number;
  /** 失败/未命中的题目标题（最多 10 条） */
  failedTitles: string[];
}

/** 从题目存储的选项 JSON（{label?, content}[]）还原为字符串数组（还原 "A. 内容" 角标格式） */
function optionsFromStored(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o: unknown) => {
      if (typeof o === 'string') return o.trim();
      if (!o || typeof o !== 'object') return '';
      const content = typeof (o as any).content === 'string' ? (o as any).content.trim() : '';
      if (!content) return '';
      const label = typeof (o as any).label === 'string' ? (o as any).label.trim() : '';
      return label ? `${label}. ${content}` : content;
    })
    .filter(Boolean);
}

/**
 * 批量补全答案：仅处理「待收录」（PENDING）状态的题目，
 * 已拒绝/已解答/已验证一律跳过。逐题串行处理，避免并发冲击其它题库/LLM。
 * - upstream：并发查询启用的其它题库，命中即入库（answeredBy = qb:题库名）
 * - ai：按作答模型链优先级作答（手动批量操作不受「AI 答题范围」白名单限制，
 *   answeredBy = ai:供应商id/模型id），AI 未启用时整体报错
 */
export async function batchAnswerQuestions(
  mode: BatchAnswerMode,
  ids: string[],
): Promise<BatchAnswerResult> {
  const questions = await prisma.question.findMany({
    where: { id: { in: ids }, status: QuestionStatus.PENDING },
  });
  const skipped = ids.length - questions.length;

  const result: BatchAnswerResult = {
    total: ids.length,
    skipped,
    succeeded: 0,
    failed: 0,
    failedTitles: [],
  };

  if (questions.length === 0) return result;

  // AI 模式提前校验配置，避免逐题空跑
  // 批量补全绕过 AI 搜题总开关，但单项禁用的模型/供应商仍会被跳过
  let aiSearch: ResolvedAiSearch | null = null;
  if (mode === 'ai') {
    aiSearch = await resolveAiSearch({ ignoreEnabled: true });
    if (!aiSearch) httpError(400, 'AI 供应商/模型链未配置，或所有模型均已禁用');
  }

  for (const q of questions) {
    const options = optionsFromStored(q.options);
    try {
      if (mode === 'upstream') {
        // 批量补全绕过其它题库总开关，但单项禁用的题库仍会被跳过
        const hit = await searchFromOCSJS(q.title, options, q.type as QuestionType, {
          ignoreMasterSwitch: true,
        });
        if (!hit) {
          result.failed += 1;
          result.failedTitles.push(q.title);
          continue;
        }
        await prisma.question.update({
          where: { id: q.id },
          data: {
            answer: hit.answerParts,
            status: QuestionStatus.ANSWERED,
            answeredBy: hit.bank ? `qb:${hit.bank}` : 'qb:未知',
            answeredAt: new Date(),
          },
        });
        result.succeeded += 1;
      } else {
        const aiResult = await searchFromLLM(aiSearch!, q.title, options, q.type as QuestionType);
        if (!aiResult) {
          result.failed += 1;
          result.failedTitles.push(q.title);
          continue;
        }
        await prisma.question.update({
          where: { id: q.id },
          data: {
            answer: aiResult.answerParts,
            status: QuestionStatus.ANSWERED,
            answeredBy: aiResult.answeredBy,
            answeredAt: new Date(),
          },
        });
        result.succeeded += 1;
      }
    } catch (error) {
      // 单题失败不阻断批量流程
      console.error('批量补全答案单题失败', q.title.substring(0, 50), error instanceof Error ? error.message : error);
      result.failed += 1;
      result.failedTitles.push(q.title);
    }
  }

  // 失败明细最多保留 10 条，避免响应过大
  result.failedTitles = result.failedTitles.slice(0, 10);
  return result;
}

/** 恢复题目状态（已拒绝 → 待收录；已验证 → 已解答；已解答 → 待收录） */
export async function restoreQuestion(id: string) {
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) httpError(404, '题目不存在');

  const next =
    question.status === QuestionStatus.REJECTED
      ? QuestionStatus.PENDING
      : question.status === QuestionStatus.VERIFIED
        ? QuestionStatus.ANSWERED
        : question.status === QuestionStatus.ANSWERED
          ? QuestionStatus.PENDING
          : null;
  if (!next) httpError(400, '"待收录"状态的题目无需恢复');

  // 状态设为待收录时同步清空答案
  const clearAnswer = next === QuestionStatus.PENDING;
  await prisma.question.update({
    where: { id },
    data: clearAnswer
      ? { status: next, answer: [], answeredBy: null, answeredAt: null }
      : { status: next },
  });
  return { status: next };
}

/** 获取题目统计（按状态分组） */
export async function getStats() {
  const [total, pending, answered, verified, rejected] = await Promise.all([
    prisma.question.count(),
    prisma.question.count({ where: { status: QuestionStatus.PENDING } }),
    prisma.question.count({ where: { status: QuestionStatus.ANSWERED } }),
    prisma.question.count({ where: { status: QuestionStatus.VERIFIED } }),
    prisma.question.count({ where: { status: QuestionStatus.REJECTED } }),
  ]);

  return { total, pending, answered, verified, rejected };
}
