// ===========================================
// 题库系统 - 核心类型定义
// ===========================================

// ---------- 题目类型 ----------
export enum QuestionType {
  /** 单选题 */
  SINGLE = 'SINGLE',
  /** 多选题 */
  MULTIPLE = 'MULTIPLE',
  /** 判断题 */
  JUDGE = 'JUDGE',
  /** 填空题 */
  FILL = 'FILL',
  /** 简答题 */
  SHORT_ANSWER = 'SHORT_ANSWER',
}

// ---------- 题目状态 ----------
export enum QuestionStatus {
  /** 待收录 - 搜题未命中，自动记录 */
  PENDING = 'PENDING',
  /** 已解答 - 管理员已标注答案 */
  ANSWERED = 'ANSWERED',
  /** 已验证 - 答案经确认无误 */
  VERIFIED = 'VERIFIED',
  /** 已拒绝 - 无效/重复题目 */
  REJECTED = 'REJECTED',
}

// ---------- 权限组 ----------
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
}

// ---------- 权限节点 ----------
export enum Permission {
  // 题目相关
  QUESTION_VIEW = 'question:view',
  QUESTION_CREATE = 'question:create',
  QUESTION_UPDATE = 'question:update',
  QUESTION_DELETE = 'question:delete',
  QUESTION_ANSWER = 'question:answer',
  QUESTION_VERIFY = 'question:verify',

  // 用户相关
  USER_VIEW = 'user:view',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_MANAGE = 'user:manage',

  // 系统相关
  SYSTEM_CONFIG = 'system:config',
  SYSTEM_STATS = 'system:stats',
}

// ---------- 权限组 → 权限节点映射 ----------
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // 权限收紧：USER 仅保留搜题能力（搜题走 API Key 鉴权，不需要权限节点）；
  // ADMIN 保留题库维护全套（题目管理页面 + 标注/编辑/验证/拒绝），
  // 但不含用户管理与系统配置（仅 OWNER）；OWNER 恒为全部权限
  [Role.USER]: [],
  [Role.ADMIN]: [
    Permission.QUESTION_VIEW,
    Permission.QUESTION_CREATE,
    Permission.QUESTION_UPDATE,
    Permission.QUESTION_ANSWER,
    Permission.QUESTION_DELETE,
    Permission.QUESTION_VERIFY,
  ],
  [Role.OWNER]: [
    Permission.QUESTION_VIEW,
    Permission.QUESTION_CREATE,
    Permission.QUESTION_UPDATE,
    Permission.QUESTION_DELETE,
    Permission.QUESTION_ANSWER,
    Permission.QUESTION_VERIFY,
    Permission.USER_VIEW,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    Permission.USER_MANAGE,
    Permission.SYSTEM_CONFIG,
    Permission.SYSTEM_STATS,
  ],
};

// ---------- 核心接口 ----------

/** 题目选项 */
export interface IQuestionOption {
  /** 选项标识，如 A, B, C, D */
  label: string;
  /** 选项内容 */
  content: string;
}

/** 题目核心接口 */
export interface IQuestion {
  /** 题目唯一标识 */
  id: string;
  /** 题目类型 */
  type: QuestionType;
  /** 题目标题/题干 */
  title: string;
  /** 选项（单选/多选/判断题） */
  options: IQuestionOption[];
  /** 正确答案 */
  answer: string;
  /** 题目状态 */
  status: QuestionStatus;
  /** 题目来源 */
  source?: string;
  /** 标签 */
  tags?: string[];
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

// ---------- API 通用响应 ----------

export interface IApiResponse<T = unknown> {
  code: number;
  data: T;
  msg: string;
}

export interface IPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------- 搜题相关 ----------

export interface ISearchResult {
  title: string;
  answer: string;
}

/** AI 供应商（OpenAI 兼容接口，存于 SystemConfig AI_PROVIDERS，JSON 数组） */
export interface IAiProvider {
  /** crypto.randomUUID() 生成 */
  id: string;
  /** 显示名，如 "OpenAI" */
  name: string;
  /** 接口地址，如 https://api.openai.com/v1 */
  baseUrl: string;
  /** Bearer 密钥，仅存服务端 */
  apiKey: string;
  enabled: boolean;
  /** 可用模型列表（弹窗内手动添加或拉取后勾选，供作答模型链下拉选择） */
  models?: string[];
}

/** AI 作答模型链条目（存于 SystemConfig AI_MODEL_CHAIN，JSON 数组，按优先级排序，失败自动降级下一项） */
export interface IAiModelChainItem {
  providerId: string;
  modelId: string;
  /** 单项禁用：搜题时跳过该模型（批量补全同样遵守；仅总开关可被批量补全绕过） */
  disabled?: boolean;
}

/** 供应商下模型列表项（/api/ai/models 响应项） */
export interface IAiProviderModel {
  /** 模型名，如 gpt-4o-mini */
  id: string;
}

/** AI 答题范围默认值（存于 SystemConfig AI_ANSWER_TYPES，JSON 字符串数组）：简答题与未标注题型默认不作答 */
export const DEFAULT_AI_ANSWER_TYPES = ['SINGLE', 'MULTIPLE', 'JUDGE', 'FILL'];

/** AI 答题范围可选的全部题型（未标注题型视为 OTHER） */
export const AI_ANSWER_TYPE_OPTIONS = [
  { value: 'SINGLE', label: '单选题' },
  { value: 'MULTIPLE', label: '多选题' },
  { value: 'JUDGE', label: '判断题' },
  { value: 'FILL', label: '填空题' },
  { value: 'SHORT_ANSWER', label: '简答题' },
  { value: 'OTHER', label: '其它（未标注题型）' },
] as const;

// ---------- 统一查题接口（单接口兼容 OCSJS / TikuAdapter 两种格式） ----------

/** OCSJS 原生题型字符串（见 OCSJS answer-wrapper 约定） */
export type OCSJSQuestionType = 'single' | 'multiple' | 'completion' | 'judgement';

/** TikuAdapter 题型数值（0=单选 1=多选 2=填空 3=判断 4=问答） */
export type TikuAdapterQuestionType = 0 | 1 | 2 | 3 | 4;

/**
 * 统一查题请求体
 *
 * 自动识别格式：
 * - OCSJS 格式：携带 title 字段，options 为 '\n' 分隔字符串（也兼容数组）
 * - TikuAdapter 格式：携带 question 字段（或 type 为数值），options 为字符串数组
 */
export interface IUnifiedSearchRequest {
  // ----- OCSJS 格式 -----
  title?: string;
  /** OCSJS 格式为 '\n' 分隔字符串；TikuAdapter 格式为字符串数组 */
  options?: string | string[];
  /** OCSJS 题型字符串或 TikuAdapter 题型数值 */
  type?: OCSJSQuestionType | TikuAdapterQuestionType;

  // ----- TikuAdapter 格式 -----
  question?: string;
  plat?: number;
  qid?: string;
  courseName?: string;
  extra?: string;
}

/** TikuAdapter 答案结构（多答案 '#' 分隔） */
export interface ITikuAdapterAnswer {
  /** 字母角标数组，如 ['A','C']，依据传入 options 匹配计算 */
  answerKey: string[];
  /** 字母角标文本，多答案 '#' 分隔 */
  answerKeyText: string;
  /** 选项下标数组 */
  answerIndex: number[];
  /** 答案文本，多答案 '#' 分隔 */
  answerText: string;
  /** 最可能的答案 */
  bestAnswer: string[];
  /** 所有来源聚合的答案 */
  allAnswer: string[][];
}

/**
 * 统一查题响应体 —— OCSJS 与 TikuAdapter 字段超集
 *
 * OCSJS 客户端 handler 取 res.code / res.data；
 * TikuAdapter 客户端取 res.answer.* / res.question。
 */
export interface IUnifiedSearchResponse {
  /** OCSJS 约定：1=命中 0=未命中 */
  code: number;
  msg: string;
  /** OCSJS 约定字段 */
  data: ISearchResult | null;

  // ----- TikuAdapter 约定字段 -----
  question: string;
  options: string[];
  /** 回显为 TikuAdapter 数值题型 */
  type: TikuAdapterQuestionType;
  plat: number;
  answer: ITikuAdapterAnswer;
}

// ---------- 认证相关 ----------

export interface ILoginRequest {
  email: string;
  password: string;
}

export interface IRegisterRequest {
  email: string;
  password: string;
  code: string;
}

export interface IEmailCodeRequest {
  email: string;
  type: 'register' | 'login';
}

export interface IAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ICurrentUser {
  id: string;
  email: string;
  role: Role;
  permissions: Permission[];
}

// ---------- 用户相关 ----------

export interface IUser {
  id: number;
  email: string;
  role: Role;
  permissions: Permission[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
