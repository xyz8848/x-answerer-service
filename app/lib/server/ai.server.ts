import type { IAiModelChainItem, IAiProvider } from '@/lib/types';
import { DEFAULT_AI_ANSWER_TYPES } from '@/lib/types';
import { prisma } from './db.server';

/**
 * AI 搜题配置模块：供应商列表 / 作答模型链 / 全局参数（均存于 SystemConfig）。
 * 供 question.service.server.ts（搜题链路）与 api.ai.models 路由（模型拉取）共用。
 */

/** AI 搜题相关 SystemConfig 键 */
export const AI_CONFIG_KEYS = {
  enabled: 'AI_SEARCH_ENABLED',
  providers: 'AI_PROVIDERS',
  modelChain: 'AI_MODEL_CHAIN',
  timeoutMs: 'AI_TIMEOUT_MS',
  temperature: 'AI_TEMPERATURE',
  customPrompt: 'AI_CUSTOM_PROMPT',
  /** AI 答题范围：JSON 字符串数组，题型白名单（未标注题型视为 OTHER） */
  answerTypes: 'AI_ANSWER_TYPES',
  /** 旧版单配置键（仅用于一次性惰性迁移） */
  legacyBaseUrl: 'AI_BASE_URL',
  legacyApiKey: 'AI_API_KEY',
  legacyModel: 'AI_MODEL',
} as const;

/** 解析后的 AI 搜题配置（供应商已过滤启用项、模型链已关联供应商实体） */
export interface ResolvedAiSearch {
  /** 按优先级排序的作答链（失败自动降级下一项） */
  chain: { provider: IAiProvider; modelId: string }[];
  timeoutMs: number;
  temperature: number;
  customPrompt: string;
  /** AI 答题范围（题型白名单，未标注题型对应 'OTHER'） */
  answerTypes: string[];
}

/** 解析答题范围（容错：非法 JSON / 非数组 / 空白项过滤，空值回落默认） */
export function parseAnswerTypes(raw: string | undefined): string[] {
  if (!raw) return [...DEFAULT_AI_ANSWER_TYPES];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_AI_ANSWER_TYPES];
    const values = parsed
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((v) => v.trim());
    return [...new Set(values)];
  } catch {
    return [...DEFAULT_AI_ANSWER_TYPES];
  }
}

/** 批量读取 AI 相关 SystemConfig（key -> value） */
async function loadAiConfigMap(): Promise<Map<string, string>> {
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: Object.values(AI_CONFIG_KEYS) } },
  });
  return new Map(rows.map((r) => [r.key, r.value]));
}

/** 解析供应商列表（容错：非法 JSON / 非数组 / 缺字段 / 无效 URL 均过滤，baseUrl 去尾斜杠） */
export async function getAiProviders(): Promise<IAiProvider[]> {
  const map = await loadAiConfigMap();
  return parseProviders(map.get(AI_CONFIG_KEYS.providers));
}

/** 解析作答模型链（容错：过滤缺 providerId / modelId 的项，保持优先级顺序） */
export async function getAiModelChain(): Promise<IAiModelChainItem[]> {
  const map = await loadAiConfigMap();
  return parseModelChain(map.get(AI_CONFIG_KEYS.modelChain));
}

function parseProviders(raw: string | undefined): IAiProvider[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p: any) => {
        if (!p || typeof p.baseUrl !== 'string' || !p.baseUrl.trim()) return false;
        try {
          new URL(p.baseUrl.trim());
          return true;
        } catch {
          return false;
        }
      })
      .map((p: any) => ({
        id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : crypto.randomUUID(),
        name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : '未命名供应商',
        baseUrl: p.baseUrl.trim().replace(/\/+$/, ''),
        apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
        enabled: p.enabled !== false,
      }));
  } catch {
    return [];
  }
}

function parseModelChain(raw: string | undefined): IAiModelChainItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item: any) =>
          item &&
          typeof item.providerId === 'string' &&
          item.providerId.trim() &&
          typeof item.modelId === 'string' &&
          item.modelId.trim(),
      )
      .map((item: any) => ({
        providerId: item.providerId.trim(),
        modelId: item.modelId.trim(),
        ...(item.disabled === true ? { disabled: true } : {}),
      }));
  } catch {
    return [];
  }
}

/**
 * 解析 AI 搜题配置：
 * - 总开关未开启（opts.ignoreEnabled 为 true 时跳过该检查），或过滤后模型链为空 -> null（跳过 AI 环节，零开销）
 * - 链中引用的供应商已删除/禁用、或单项 disabled -> 静默跳过该项，不阻断后续项
 */
export async function resolveAiSearch(
  opts?: { ignoreEnabled?: boolean },
): Promise<ResolvedAiSearch | null> {
  const map = await loadAiConfigMap();

  if (!opts?.ignoreEnabled && (map.get(AI_CONFIG_KEYS.enabled) ?? 'false') !== 'true') return null;

  let providers = parseProviders(map.get(AI_CONFIG_KEYS.providers));

  // 旧版单配置惰性迁移：供应商为空且旧键齐全时，构造单供应商 + 单项链并落库（幂等）
  if (providers.length === 0) {
    providers = await migrateLegacyConfig(map);
    if (providers.length === 0) return null;
  }

  const chain = parseModelChain(map.get(AI_CONFIG_KEYS.modelChain));
  const providersById = new Map(providers.map((p) => [p.id, p]));
  const resolvedChain = chain
    .map((item) => {
      const provider = providersById.get(item.providerId);
      return !item.disabled && provider && provider.enabled
        ? { provider, modelId: item.modelId }
        : null;
    })
    .filter((item): item is { provider: IAiProvider; modelId: string } => item !== null);

  if (resolvedChain.length === 0) return null;

  const timeoutRaw = Number(map.get(AI_CONFIG_KEYS.timeoutMs));
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.min(Math.max(timeoutRaw, 1000), 60000) : 30000;
  const temperatureRaw = Number(map.get(AI_CONFIG_KEYS.temperature));
  const temperature = Number.isFinite(temperatureRaw) ? Math.min(Math.max(temperatureRaw, 0), 2) : 0.2;

  return {
    chain: resolvedChain,
    timeoutMs,
    temperature,
    customPrompt: (map.get(AI_CONFIG_KEYS.customPrompt) ?? '').trim(),
    answerTypes: parseAnswerTypes(map.get(AI_CONFIG_KEYS.answerTypes)),
  };
}

/** 旧版单配置（AI_BASE_URL/AI_API_KEY/AI_MODEL）一次性迁移为供应商 + 模型链 */
async function migrateLegacyConfig(map: Map<string, string>): Promise<IAiProvider[]> {
  const baseUrl = (map.get(AI_CONFIG_KEYS.legacyBaseUrl) ?? '').trim();
  const apiKey = (map.get(AI_CONFIG_KEYS.legacyApiKey) ?? '').trim();
  const modelId = (map.get(AI_CONFIG_KEYS.legacyModel) ?? '').trim();
  if (!baseUrl || !apiKey || !modelId) return [];

  const provider: IAiProvider = {
    id: crypto.randomUUID(),
    name: '默认供应商（迁移）',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    enabled: true,
  };
  try {
    await prisma.systemConfig.upsert({
      where: { key: AI_CONFIG_KEYS.providers },
      create: { key: AI_CONFIG_KEYS.providers, value: JSON.stringify([provider]) },
      update: { value: JSON.stringify([provider]) },
    });
    await prisma.systemConfig.upsert({
      where: { key: AI_CONFIG_KEYS.modelChain },
      create: { key: AI_CONFIG_KEYS.modelChain, value: JSON.stringify([{ providerId: provider.id, modelId }]) },
      update: { value: JSON.stringify([{ providerId: provider.id, modelId }]) },
    });
    console.log('已迁移旧版 AI 配置为供应商模式');
  } catch (error) {
    // 迁移失败不阻断主流程，本次按未启用处理
    console.error('旧版 AI 配置迁移失败', error instanceof Error ? error.message : error);
    return [];
  }
  return [provider];
}
