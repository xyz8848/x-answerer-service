import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { ExternalLink, Eye, EyeOff, Github, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import api from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IAiModelChainItem, IAiProvider } from '@/lib/types';
import { AI_ANSWER_TYPE_OPTIONS } from '@/lib/types';
import { SaveButton } from '@/components/save-button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  OWNER: '拥有者',
  ADMIN: '管理员',
  USER: '用户',
};

const ROLE_CLASSES: Record<string, string> = {
  OWNER: 'bg-red-100 text-red-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  USER: 'bg-muted text-muted-foreground',
};

interface RoleItem {
  name: string;
  permissions: string[];
  [key: string]: any;
}

interface PermissionNode {
  name: string;
  [key: string]: any;
}

/** 其它题库配置项 */
interface UpstreamBank {
  /** 稳定标识（旧数据缺失时自动补齐，仅用于前端编辑定位，服务端忽略） */
  id: string;
  name: string;
  url: string;
  token: string;
  enabled: boolean;
}

/** 解析 SystemConfig 中的其它题库 JSON（容错，缺失 id 自动补齐） */
function parseUpstreamBanks(raw: unknown): UpstreamBank[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((b: any) => ({
      id: typeof b?.id === 'string' && b.id.trim() ? b.id : crypto.randomUUID(),
      name: typeof b?.name === 'string' ? b.name : '',
      url: typeof b?.url === 'string' ? b.url : '',
      token: typeof b?.token === 'string' ? b.token : '',
      enabled: b?.enabled !== false,
    }));
  } catch {
    return [];
  }
}

/** 数据库系统配置项及默认值（存于 SystemConfig 表，系统设置页可编辑） */
const CONFIG_DEFAULTS: Record<string, string> = {
  SMTP_HOST: 'localhost',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: '',
  SMTP_PASS: '',
  EMAIL_FROM: 'noreply@example.com',
  SITE_NAME: 'X Answerer Service',
  JWT_EXPIRES_IN: '7d',
  RP_ID: 'localhost',
  RP_NAME: 'X Answerer Service',
  AI_SEARCH_ENABLED: 'false',
  AI_TIMEOUT_MS: '30000',
  AI_TEMPERATURE: '0.2',
  AI_CUSTOM_PROMPT: '',
  AI_ANSWER_TYPES: '["SINGLE","MULTIPLE","JUDGE","FILL"]',
};

/** 并发读取一批配置（未配置的键回落默认值） */
async function loadConfigValues(keys: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    keys.map(async (key) => {
      const res = await api.get(`/permissions/config/${key}`);
      const value = res.data.code === 1 && res.data.data ? res.data.data.value : null;
      return [key, value ?? CONFIG_DEFAULTS[key]] as const;
    })
  );
  return Object.fromEntries(entries);
}

function shortPermission(p: string) {
  return p.split(':').pop() || p;
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [allowRegistration, setAllowRegistration] = useState(true);
  // 注册设置卡编辑模式（两态：只读 Switch 禁用，编辑后可改，保存/取消退出）
  const [regEditing, setRegEditing] = useState(false);
  const [regSnapshot, setRegSnapshot] = useState(false);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  /** 服务端权限组快照（编辑取消时本地恢复，避免整页重载） */
  const [rolesServer, setRolesServer] = useState<RoleItem[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionNode[]>([]);
  const [editingRoles, setEditingRoles] = useState<Record<string, boolean>>({});

  // 其它题库列表（存于数据库 SystemConfig，JSON 数组，弹窗创建/修改，即时持久化）
  const [upstreams, setUpstreams] = useState<UpstreamBank[]>([]);
  // 其它题库总开关（关掉后搜题与批量补全都跳过其它题库，仅用本地题库 + AI）
  const [upstreamEnabled, setUpstreamEnabled] = useState(true);
  const [savingUpstreamEnabled, setSavingUpstreamEnabled] = useState(false);
  const [upstreamEnabledError, setUpstreamEnabledError] = useState('');
  const [upstreamDialogOpen, setUpstreamDialogOpen] = useState(false);
  const [editingUpstreamId, setEditingUpstreamId] = useState<string | null>(null);
  const [upstreamForm, setUpstreamForm] = useState({ name: '', url: '', token: '', enabled: true });
  const [savingUpstream, setSavingUpstream] = useState(false);
  const [upstreamDialogError, setUpstreamDialogError] = useState('');
  /** Token 输入框明文显示 */
  const [showUpstreamToken, setShowUpstreamToken] = useState(false);
  /** 供应商 API Key 输入框明文显示 */
  const [showProviderKey, setShowProviderKey] = useState(false);
  // 删除其它题库确认弹窗
  const [deleteUpstreamTarget, setDeleteUpstreamTarget] = useState<UpstreamBank | null>(null);
  const [deletingUpstream, setDeletingUpstream] = useState(false);
  const [deleteUpstreamError, setDeleteUpstreamError] = useState('');

  // 数据库系统配置（SMTP / 站点 / 登录有效期 / Passkey）
  const [smtpConfig, setSmtpConfig] = useState(() => ({
    SMTP_HOST: CONFIG_DEFAULTS.SMTP_HOST,
    SMTP_PORT: CONFIG_DEFAULTS.SMTP_PORT,
    SMTP_SECURE: CONFIG_DEFAULTS.SMTP_SECURE,
    SMTP_USER: CONFIG_DEFAULTS.SMTP_USER,
    SMTP_PASS: CONFIG_DEFAULTS.SMTP_PASS,
    EMAIL_FROM: CONFIG_DEFAULTS.EMAIL_FROM,
  }));
  const [siteConfig, setSiteConfig] = useState(() => ({
    SITE_NAME: CONFIG_DEFAULTS.SITE_NAME,
    JWT_EXPIRES_IN: CONFIG_DEFAULTS.JWT_EXPIRES_IN,
    RP_ID: CONFIG_DEFAULTS.RP_ID,
    RP_NAME: CONFIG_DEFAULTS.RP_NAME,
  }));

  // AI 搜题配置（存于数据库 SystemConfig）
  const [aiConfig, setAiConfig] = useState(() => ({
    AI_SEARCH_ENABLED: CONFIG_DEFAULTS.AI_SEARCH_ENABLED,
    AI_TIMEOUT_MS: CONFIG_DEFAULTS.AI_TIMEOUT_MS,
    AI_TEMPERATURE: CONFIG_DEFAULTS.AI_TEMPERATURE,
    AI_CUSTOM_PROMPT: CONFIG_DEFAULTS.AI_CUSTOM_PROMPT,
    AI_ANSWER_TYPES: CONFIG_DEFAULTS.AI_ANSWER_TYPES,
  }));

  /** 答题范围切换（读写 aiConfig.AI_ANSWER_TYPES 的 JSON 数组） */
  function toggleAnswerType(type: string) {
    setAiConfig((prev) => {
      let types: string[];
      try {
        const parsed: unknown = JSON.parse(prev.AI_ANSWER_TYPES);
        types = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
      } catch {
        types = [];
      }
      const next = types.includes(type) ? types.filter((t) => t !== type) : [...types, type];
      return { ...prev, AI_ANSWER_TYPES: JSON.stringify(next) };
    });
  }

  /** 当前答题范围（解析 JSON，容错回落默认） */
  function answerTypesOf(raw: string): string[] {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  // AI 供应商列表（存于 SystemConfig AI_PROVIDERS，JSON 数组，增删改即时持久化）
  const [aiProviders, setAiProviders] = useState<IAiProvider[]>([]);

  // 供应商创建/修改弹窗
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  /** 正在编辑的供应商 id，null = 新建 */
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState<{
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    enabled: boolean;
    models: string[];
  }>({ id: '', name: '', baseUrl: '', apiKey: '', enabled: true, models: [] });
  const [savingProvider, setSavingProvider] = useState(false);
  /** 供应商弹窗内的保存错误（内联显示） */
  const [dialogError, setDialogError] = useState('');
  /** 待删除的供应商（确认弹窗） */
  const [deleteProviderTarget, setDeleteProviderTarget] = useState<IAiProvider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState(false);
  const [deleteProviderError, setDeleteProviderError] = useState('');
  /** 手动输入的模型 ID */
  const [manualModel, setManualModel] = useState('');
  /** 从供应商拉取到的候选模型（null = 未拉取，[] = 拉取但为空） */
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // AI 作答模型链（存于 SystemConfig AI_MODEL_CHAIN，按优先级排序）
  const [modelChain, setModelChain] = useState<IAiModelChainItem[]>([]);
  // 作答模型链卡片编辑模式（默认只读展示，点「编辑」后才能增删改，保存成功或取消后退出）
  const [chainEditing, setChainEditing] = useState(false);
  // 进入编辑时的快照，取消编辑时回滚
  const [chainSnapshot, setChainSnapshot] = useState<IAiModelChainItem[]>([]);
  // 模型链拖拽排序：当前拖拽中的行下标
  const [chainDragIndex, setChainDragIndex] = useState<number | null>(null);
  // SMTP / 站点与登录 / AI 搜题 卡片编辑模式（只读时表单禁用置灰）
  const [smtpEditing, setSmtpEditing] = useState(false);
  // SMTP 密码显示/隐藏
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [siteEditing, setSiteEditing] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);
  const [smtpSnapshot, setSmtpSnapshot] = useState<typeof smtpConfig | null>(null);
  const [siteSnapshot, setSiteSnapshot] = useState<typeof siteConfig | null>(null);
  const [aiSnapshot, setAiSnapshot] = useState<typeof aiConfig | null>(null);

  /** 解析 SystemConfig 中的 JSON 数组配置（容错） */
  function parseJsonArray<T>(raw: unknown): T[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(String(raw));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function fetchSettings() {
    setLoading(true);
    setError('');
    try {
      const [rolesRes, configRes, nodesRes, banksRes, cfgs, aiProvidersRes, aiChainRes, upstreamEnabledRes] =
        await Promise.all([
          api.get('/permissions/roles'),
          api.get('/permissions/config/ALLOW_REGISTRATION'),
          api.get('/permissions/nodes'),
          api.get('/permissions/config/UPSTREAM_BANKS'),
          loadConfigValues(Object.keys(CONFIG_DEFAULTS)),
          api.get('/permissions/config/AI_PROVIDERS'),
          api.get('/permissions/config/AI_MODEL_CHAIN'),
          api.get('/permissions/config/UPSTREAM_ENABLED'),
        ]);
      if (rolesRes.data.code === 1) {
        setRoles(rolesRes.data.data);
        setRolesServer(rolesRes.data.data);
      }
      if (configRes.data.code === 1 && configRes.data.data) {
        setAllowRegistration(configRes.data.data.value === 'true');
      }
      if (nodesRes.data.code === 1) {
        setAllPermissions(nodesRes.data.data);
      }
      if (banksRes.data.code === 1) {
        setUpstreams(parseUpstreamBanks(banksRes.data.data?.value));
      }
      if (upstreamEnabledRes.data.code === 1) {
        // 配置缺失（undefined）视为开启
        setUpstreamEnabled(upstreamEnabledRes.data.data?.value !== 'false');
      }
      setSmtpConfig({
        SMTP_HOST: cfgs.SMTP_HOST,
        SMTP_PORT: cfgs.SMTP_PORT,
        SMTP_SECURE: cfgs.SMTP_SECURE,
        SMTP_USER: cfgs.SMTP_USER,
        SMTP_PASS: cfgs.SMTP_PASS,
        EMAIL_FROM: cfgs.EMAIL_FROM,
      });
      setSiteConfig({
        SITE_NAME: cfgs.SITE_NAME,
        JWT_EXPIRES_IN: cfgs.JWT_EXPIRES_IN,
        RP_ID: cfgs.RP_ID,
        RP_NAME: cfgs.RP_NAME,
      });
      setAiConfig({
        AI_SEARCH_ENABLED: cfgs.AI_SEARCH_ENABLED,
        AI_TIMEOUT_MS: cfgs.AI_TIMEOUT_MS,
        AI_TEMPERATURE: cfgs.AI_TEMPERATURE,
        AI_CUSTOM_PROMPT: cfgs.AI_CUSTOM_PROMPT,
        AI_ANSWER_TYPES: cfgs.AI_ANSWER_TYPES,
      });
      if (aiProvidersRes.data.code === 1) {
        setAiProviders(parseJsonArray<IAiProvider>(aiProvidersRes.data.data?.value));
      }
      if (aiChainRes.data.code === 1) {
        setModelChain(parseJsonArray<IAiModelChainItem>(aiChainRes.data.data?.value).map((r) => ({ ...r })));
      }
    } catch {
      setError('加载设置失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function saveRegistration() {
    try {
      await api.put('/permissions/config/ALLOW_REGISTRATION', {
        value: allowRegistration ? 'true' : 'false',
      });
      setRegEditing(false);
    } catch {
      throw new Error('保存失败（需要 OWNER 权限）');
    }
  }

  function startEditReg() {
    setRegSnapshot(allowRegistration);
    setRegEditing(true);
  }

  function cancelEditReg() {
    setAllowRegistration(regSnapshot);
    setRegEditing(false);
  }

  // ---------- 其它题库（弹窗创建/修改，即时持久化） ----------

  /** 切换其它题库总开关（失败自动回弹） */
  async function toggleUpstreamEnabled(checked: boolean) {
    const prev = upstreamEnabled;
    setUpstreamEnabled(checked);
    setSavingUpstreamEnabled(true);
    setUpstreamEnabledError('');
    try {
      await api.put('/permissions/config/UPSTREAM_ENABLED', { value: String(checked) });
    } catch {
      setUpstreamEnabled(prev);
      setUpstreamEnabledError('保存失败，请重试');
    } finally {
      setSavingUpstreamEnabled(false);
    }
  }

  /** 持久化其它题库列表到 SystemConfig（过滤掉未填地址的行） */
  async function persistUpstreams(list: UpstreamBank[]) {
    const value = JSON.stringify(
      list
        .filter((u) => u.url.trim())
        .map((u) => ({
          id: u.id,
          name: u.name.trim(),
          url: u.url.trim(),
          token: u.token.trim(),
          enabled: u.enabled,
        })),
    );
    await api.put('/permissions/config/UPSTREAM_BANKS', { value });
  }

  function openCreateUpstream() {
    setEditingUpstreamId(null);
    setUpstreamForm({ name: '', url: '', token: '', enabled: true });
    setShowUpstreamToken(false);
    setUpstreamDialogError('');
    setUpstreamDialogOpen(true);
  }

  function openEditUpstream(u: UpstreamBank) {
    setEditingUpstreamId(u.id);
    setUpstreamForm({ name: u.name, url: u.url, token: u.token, enabled: u.enabled });
    setShowUpstreamToken(false);
    setUpstreamDialogError('');
    setUpstreamDialogOpen(true);
  }

  /** 保存弹窗中的其它题库（upsert + 即时持久化），成功后关闭弹窗 */
  async function handleSaveUpstream() {
    if (!upstreamForm.url.trim()) {
      setUpstreamDialogError('接口地址不能为空');
      return;
    }
    setSavingUpstream(true);
    try {
      const id = editingUpstreamId ?? crypto.randomUUID();
      const bank: UpstreamBank = {
        id,
        name: upstreamForm.name.trim(),
        url: upstreamForm.url.trim(),
        token: upstreamForm.token.trim(),
        enabled: upstreamForm.enabled,
      };
      const next = editingUpstreamId
        ? upstreams.map((u) => (u.id === id ? bank : u))
        : [...upstreams, bank];
      setUpstreams(next);
      await persistUpstreams(next);
      setUpstreamDialogOpen(false);
    } catch {
      setUpstreamDialogError('保存失败（需要 OWNER 权限）');
    } finally {
      setSavingUpstream(false);
    }
  }

  /** 打开删除其它题库确认弹窗 */
  function askRemoveUpstream(u: UpstreamBank) {
    setDeleteUpstreamError('');
    setDeleteUpstreamTarget(u);
  }

  /** 确认删除其它题库（即时持久化） */
  async function confirmRemoveUpstream() {
    if (!deleteUpstreamTarget) return;
    setDeletingUpstream(true);
    setDeleteUpstreamError('');
    const next = upstreams.filter((u) => u.id !== deleteUpstreamTarget.id);
    setUpstreams(next);
    try {
      await persistUpstreams(next);
      setDeleteUpstreamTarget(null);
    } catch {
      // 删除失败：回滚本地状态，确认弹窗内提示错误
      setUpstreams(upstreams);
      setDeleteUpstreamError('删除失败（需要 OWNER 权限）');
    } finally {
      setDeletingUpstream(false);
    }
  }

  /** 批量保存配置项（key/value 均存 SystemConfig） */
  async function saveConfigs(values: Record<string, string>) {
    await Promise.all(
      Object.entries(values).map(([key, value]) =>
        api.put(`/permissions/config/${key}`, { value })
      )
    );
  }

  async function saveSmtp() {
    try {
      await saveConfigs(smtpConfig);
      setSmtpSnapshot({ ...smtpConfig });
      setSmtpEditing(false);
    } catch {
      throw new Error('保存失败（需要 OWNER 权限）');
    }
  }

  async function saveSite() {
    if (!siteConfig.JWT_EXPIRES_IN.trim()) {
      throw new Error('登录态有效期不能为空');
    }
    try {
      await saveConfigs(siteConfig);
      setSiteSnapshot({ ...siteConfig });
      setSiteEditing(false);
    } catch {
      throw new Error('保存失败（需要 OWNER 权限）');
    }
  }  /** 保存 AI 全局配置（启用时校验存在未禁用的可用模型） */
  async function saveAiGlobal() {
    const enabled = aiConfig.AI_SEARCH_ENABLED === 'true';
    const usable = modelChain.filter(
      (m) => m.modelId.trim() && m.providerId && !m.disabled,
    );
    if (enabled && usable.length === 0) {
      throw new Error('启用 AI 搜题需至少配置一个未禁用的可用模型，请先在「作答模型链」中添加或启用');
    }
    try {
      await saveConfigs({
        ...aiConfig,
        AI_TIMEOUT_MS: String(Number(aiConfig.AI_TIMEOUT_MS) || 30000),
        AI_TEMPERATURE: String(Number(aiConfig.AI_TEMPERATURE) || 0.2),
      });
      setAiSnapshot({ ...aiConfig });
      setAiEditing(false);
    } catch {
      throw new Error('保存失败（需要 OWNER 权限）');
    }
  }

  // ---------- 卡片编辑模式：进入 / 取消 ----------

  function startEditSmtp() {
    setSmtpSnapshot({ ...smtpConfig });
    setSmtpEditing(true);
  }

  function cancelEditSmtp() {
    if (smtpSnapshot) setSmtpConfig(smtpSnapshot);
    setSmtpEditing(false);
  }

  function startEditSite() {
    setSiteSnapshot({ ...siteConfig });
    setSiteEditing(true);
  }

  function cancelEditSite() {
    if (siteSnapshot) setSiteConfig(siteSnapshot);
    setSiteEditing(false);
  }

  function startEditAi() {
    setAiSnapshot({ ...aiConfig });
    setAiEditing(true);
  }

  function cancelEditAi() {
    if (aiSnapshot) setAiConfig(aiSnapshot);
    setAiEditing(false);
  }

  // ---------- 未保存更改离开拦截 ----------

  const unsavedEdits = regEditing || smtpEditing || siteEditing || aiEditing || chainEditing;
  const blocker = useBlocker(unsavedEdits);
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [savingToLeave, setSavingToLeave] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  useEffect(() => {
    if (blocker.state === 'blocked') setLeaveDialogOpen(true);
  }, [blocker.state]);

  // 编辑中刷新 / 关闭标签页：浏览器原生确认
  useEffect(() => {
    if (!unsavedEdits) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsavedEdits]);

  /** 离开确认弹窗：保存当前编辑中的卡片后继续跳转 */
  async function saveAndLeave() {
    setSavingToLeave(true);
    setLeaveError('');
    try {
      if (regEditing) await saveRegistration();
      else if (smtpEditing) await saveSmtp();
      else if (siteEditing) await saveSite();
      else if (aiEditing) await saveAiGlobal();
      else if (chainEditing) await saveChain();
      setLeaveDialogOpen(false);
      blockerRef.current.proceed?.();
    } catch (err: any) {
      setLeaveError(err?.message || '保存失败，请重试');
    } finally {
      setSavingToLeave(false);
    }
  }

  function discardAndLeave() {
    setLeaveDialogOpen(false);
    blockerRef.current.proceed?.();
  }

  function stayOnPage() {
    setLeaveDialogOpen(false);
    blockerRef.current.reset?.();
  }

  // ---------- AI 供应商（弹窗创建/修改，即时持久化） ----------

  /** 持久化供应商列表到 SystemConfig */
  async function persistProviders(list: IAiProvider[]) {
    const value = JSON.stringify(
      list
        .filter((p) => p.baseUrl.trim())
        .map((p) => ({
          id: p.id,
          name: p.name.trim(),
          baseUrl: p.baseUrl.trim(),
          apiKey: p.apiKey.trim(),
          enabled: p.enabled,
          models: (p.models ?? []).filter((m) => m.trim()),
        })),
    );
    await api.put('/permissions/config/AI_PROVIDERS', { value });
  }

  function openCreateProvider() {
    setEditingProviderId(null);
    setProviderForm({ id: '', name: '', baseUrl: '', apiKey: '', enabled: true, models: [] });
    setManualModel('');
    setFetchedModels(null);
    setFetchError('');
    setDialogError('');
    setProviderDialogOpen(true);
  }

  function openEditProvider(p: IAiProvider) {
    setEditingProviderId(p.id);
    setProviderForm({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      enabled: p.enabled,
      models: [...(p.models ?? [])],
    });
    setManualModel('');
    setFetchedModels(null);
    setFetchError('');
    setDialogError('');
    setProviderDialogOpen(true);
  }

  /**
   * 保存弹窗中的供应商（upsert + 即时持久化）。
   * 静默模式（拉取模型前的自动保存）不关闭弹窗、错误静默；
   * 手动保存成功后关闭弹窗。
   * 返回保存后的供应商 id（失败返回 null）。
   */
  async function handleSaveProvider(silent = false): Promise<string | null> {
    const rawId = providerForm.id.trim();
    if (!rawId) {
      if (!silent) setDialogError('供应商 ID 不能为空');
      return null;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(rawId)) {
      if (!silent) setDialogError('ID 仅支持字母、数字、下划线和连字符');
      return null;
    }
    if (!providerForm.baseUrl.trim()) {
      if (!silent) setDialogError('Base URL 不能为空');
      return null;
    }
    if (aiProviders.some((p) => p.id === rawId && p.id !== editingProviderId)) {
      if (!silent) setDialogError('该 ID 已被其他供应商使用');
      return null;
    }
    setSavingProvider(true);
    try {
      const id = rawId;
      const idChanged = !!editingProviderId && editingProviderId !== id;
      // 修改 ID 时先级联迁移历史 answeredBy（ai:oldId/模型 -> ai:newId/模型），失败则中止保存
      if (idChanged) {
        try {
          await api.post('/ai/providers/rename', { oldId: editingProviderId, newId: id });
        } catch {
          if (!silent) setDialogError('历史答案标记迁移失败（需要 OWNER 权限）');
          return null;
        }
      }
      const provider: IAiProvider = {
        id,
        name: providerForm.name.trim(),
        baseUrl: providerForm.baseUrl.trim(),
        apiKey: providerForm.apiKey.trim(),
        enabled: providerForm.enabled,
        models: providerForm.models.filter((m) => m.trim()),
      };
      const next = editingProviderId
        ? aiProviders.map((p) => (p.id === editingProviderId ? provider : p))
        : [...aiProviders, provider];
      setAiProviders(next);
      await persistProviders(next);
      // ID 变化时同步作答模型链中的引用
      if (idChanged && modelChain.some((m) => m.providerId === editingProviderId)) {
        const nextChain = modelChain.map((m) =>
          m.providerId === editingProviderId ? { ...m, providerId: id } : m,
        );
        setModelChain(nextChain);
        await api.put('/permissions/config/AI_MODEL_CHAIN', {
          value: JSON.stringify(
            nextChain
              .filter((m) => m.providerId && m.modelId.trim())
              .map((m) => ({ providerId: m.providerId, modelId: m.modelId.trim() })),
          ),
        });
      }
      setEditingProviderId(id);
      if (!silent) {
        setDialogError('');
        setProviderDialogOpen(false);
      }
      return id;
    } catch {
      if (!silent) setDialogError('保存失败（需要 OWNER 权限）');
      return null;
    } finally {
      setSavingProvider(false);
    }
  }

  /** 打开删除供应商确认弹窗 */
  function askRemoveProvider(p: IAiProvider) {
    setDeleteProviderError('');
    setDeleteProviderTarget(p);
  }

  /** 确认删除供应商（即时持久化），并联动清理模型链中引用该项的条目 */
  async function confirmRemoveProvider() {
    if (!deleteProviderTarget) return;
    setDeletingProvider(true);
    setDeleteProviderError('');
    const next = aiProviders.filter((p) => p.id !== deleteProviderTarget.id);
    setAiProviders(next);
    setModelChain((prev) => prev.filter((m) => m.providerId !== deleteProviderTarget.id));
    try {
      await persistProviders(next);
      setDeleteProviderTarget(null);
    } catch {
      // 删除失败：回滚本地状态，确认弹窗内提示错误
      setAiProviders(aiProviders);
      setDeleteProviderError('删除失败（需要 OWNER 权限）');
    } finally {
      setDeletingProvider(false);
    }
  }

  // ---------- 供应商弹窗内的模型管理 ----------

  /** 手动输入模型 ID 加入可用模型列表 */
  function addManualModel() {
    const id = manualModel.trim();
    if (!id) return;
    setProviderForm((prev) =>
      prev.models.includes(id) ? prev : { ...prev, models: [...prev.models, id] },
    );
    setManualModel('');
  }

  /** 从拉取候选中点选加入可用模型列表（去重） */
  function addFetchedModel(id: string) {
    setProviderForm((prev) =>
      prev.models.includes(id) ? prev : { ...prev, models: [...prev.models, id] },
    );
  }

  function removeModel(id: string) {
    setProviderForm((prev) => ({ ...prev, models: prev.models.filter((m) => m !== id) }));
  }

  /**
   * 从供应商拉取可用模型（后端代理，apiKey 不出服务端）。
   * 新建未保存的供应商会先自动保存（后端按 providerId 读取密钥）。
   */
  async function fetchModelsInDialog() {
    if (!providerForm.baseUrl.trim()) {
      setFetchError('请先填写 Base URL 并保存');
      return;
    }
    setFetchingModels(true);
    setFetchError('');
    setFetchedModels(null);
    try {
      let pid = editingProviderId;
      if (!pid) {
        pid = await handleSaveProvider(true);
        if (!pid) return;
      }
      const { data } = await api.get('/ai/models', { params: { providerId: pid } });
      if (data.code === 1) {
        const models: string[] = (data.data?.models ?? [])
          .map((m: { id: string }) => m.id)
          .filter(Boolean);
        setFetchedModels(models);
        if (models.length === 0) setFetchError('供应商未返回可用模型，请手动输入');
      } else {
        setFetchError(data.msg || '拉取失败，请手动输入模型 ID');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '拉取失败';
      setFetchError(`${msg}，请手动输入模型 ID`);
    } finally {
      setFetchingModels(false);
    }
  }

  // ---------- 作答模型链 ----------

  function addChainItem() {
    const enabledProvider = aiProviders.find((p) => p.enabled && p.baseUrl.trim());
    setModelChain((prev) => [
      ...prev,
      { providerId: enabledProvider?.id ?? '', modelId: '' },
    ]);
  }

  function updateChainItem(index: number, patch: Partial<IAiModelChainItem>) {
    setModelChain((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function removeChainItem(index: number) {
    setModelChain((prev) => prev.filter((_, i) => i !== index));
  }

  /** 上下移动调整优先级（拖拽把手在移动端可能无效，保留按钮兜底） */
  function moveChainItem(index: number, offset: -1 | 1) {
    setModelChain((prev) => {
      const next = [...prev];
      const target = index + offset;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /** 拖拽排序：把 from 位置的项移到 to 位置 */
  function reorderChain(from: number, to: number) {
    setModelChain((prev) => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  /** 切换模型行的供应商时清空已选模型 */
  function changeChainProvider(index: number, providerId: string) {
    updateChainItem(index, { providerId, modelId: '' });
  }

  async function saveChain() {
    const valid = modelChain.filter((m) => m.providerId && m.modelId.trim());
    // 不允许重复：同一 供应商/模型 组合只能出现一次
    const seen = new Set<string>();
    const dup = valid.find((m) => {
      const key = `${m.providerId}/${m.modelId.trim()}`;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    if (dup) {
      const p = aiProviders.find((x) => x.id === dup.providerId);
      throw new Error(
        `存在重复模型「${p?.name || dup.providerId} / ${dup.modelId.trim()}」，请移除重复项后再保存`,
      );
    }
    const value = JSON.stringify(
      valid.map((m) => ({
        providerId: m.providerId,
        modelId: m.modelId.trim(),
        ...(m.disabled ? { disabled: true } : {}),
      })),
    );
    try {
      await api.put('/permissions/config/AI_MODEL_CHAIN', { value });
      // 保存成功后同步快照并退出编辑模式
      setChainSnapshot(modelChain.map((m) => ({ ...m })));
      setChainEditing(false);
    } catch {
      throw new Error('保存失败（需要 OWNER 权限）');
    }
  }

  function startEditChain() {
    setChainSnapshot(modelChain.map((m) => ({ ...m })));
    setChainEditing(true);
  }

  /** 取消编辑：回滚到进入编辑前的状态 */
  function cancelEditChain() {
    setModelChain(chainSnapshot.map((m) => ({ ...m })));
    setChainEditing(false);
  }

  function startEditRole(role: RoleItem) {
    setEditingRoles((prev) => ({ ...prev, [role.name]: true }));
  }

  function cancelEditRole(role: RoleItem) {
    // 用服务端快照本地恢复，不整页重载
    const pristine = rolesServer.find((r) => r.name === role.name);
    if (pristine) {
      setRoles((prev) =>
        prev.map((r) => (r.name === role.name ? { ...pristine, permissions: [...pristine.permissions] } : r)),
      );
    }
    setEditingRoles((prev) => ({ ...prev, [role.name]: false }));
  }

  async function saveRolePermissions(role: RoleItem) {
    try {
      await api.put(`/permissions/roles/${role.name}`, {
        permissions: role.permissions,
      });
      setEditingRoles((prev) => ({ ...prev, [role.name]: false }));
      // 同步服务端快照，保证之后取消编辑能恢复到已保存的状态
      setRolesServer((prev) =>
        prev.map((r) => (r.name === role.name ? { ...role, permissions: [...role.permissions] } : r)),
      );
    } catch {
      throw new Error('保存权限失败');
    }
  }

  function togglePermission(role: RoleItem, permission: string) {
    if (role.name === 'OWNER' || !editingRoles[role.name]) return;
    setRoles((prev) =>
      prev.map((r) => {
        if (r.name !== role.name) return r;
        const has = r.permissions.includes(permission);
        return {
          ...r,
          permissions: has
            ? r.permissions.filter((p) => p !== permission)
            : [...r.permissions, permission],
        };
      })
    );
  }

  function permissionChipClass(role: RoleItem, permission: string) {
    const active = role.permissions.includes(permission);
    if (editingRoles[role.name] && role.name !== 'OWNER') {
      return active
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-muted/50 text-muted-foreground/60 border-border hover:border-muted-foreground/50';
    }
    return active
      ? 'bg-muted text-muted-foreground border-border'
      : 'bg-muted/50 text-muted-foreground/40 border-border';
  }

  return (
    <div className="p-8">
      <div className="flex items-baseline gap-3 mb-8">
        <h2 className="text-2xl font-bold">系统设置</h2>
        <span className="text-sm text-muted-foreground" title="当前部署版本">
          v{__APP_VERSION__}
        </span>
      </div>

      {/* 加载状态 */}
      {loading && (
        <Card className="max-w-2xl">
          <CardContent className="py-12 text-center text-muted-foreground">
            加载中...
          </CardContent>
        </Card>
      )}

      {/* 错误状态 */}
      {!loading && error && (
        <Card className="max-w-2xl">
          <CardContent className="py-12 text-center">
            <p className="text-destructive mb-2">{error}</p>
            <Button variant="link" onClick={fetchSettings}>
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* 左列（固定分列：卡片高度变化只影响本列，不会引起跨列重排） */}
          <div className="space-y-6">
          {/* 注册开关 */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">注册设置</h3>
                {regEditing ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={cancelEditReg}>
                      取消
                    </Button>
                    <SaveButton size="sm" onSave={saveRegistration} />
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditReg}>
                    <Pencil className="size-4" />
                    编辑
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">开放注册</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    允许新用户注册账号
                  </p>
                </div>
                <Switch
                  checked={allowRegistration}
                  onCheckedChange={setAllowRegistration}
                  disabled={!regEditing}
                />
              </div>
            </CardContent>
          </Card>

          {/* 邮件服务（SMTP） */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4 gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold truncate">邮件服务（SMTP）</h3>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    发送注册/登录验证码所用，配置存于数据库。
                  </p>
                </div>
                {smtpEditing ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={cancelEditSmtp}>
                      取消
                    </Button>
                    <SaveButton size="sm" onSave={saveSmtp} />
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditSmtp}>
                    <Pencil className="size-4" />
                    编辑
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>SMTP 服务器</Label>
                  <Input
                    placeholder="smtp.example.com"
                    disabled={!smtpEditing}
                    value={smtpConfig.SMTP_HOST}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, SMTP_HOST: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>端口</Label>
                  <Input
                    placeholder="465"
                    disabled={!smtpEditing}
                    value={smtpConfig.SMTP_PORT}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, SMTP_PORT: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>账号</Label>
                  <Input
                    placeholder="noreply@example.com"
                    disabled={!smtpEditing}
                    value={smtpConfig.SMTP_USER}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, SMTP_USER: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>密码 / 授权码</Label>
                  <div className="relative">
                    <Input
                      type={showSmtpPass ? 'text' : 'password'}
                      disabled={!smtpEditing}
                      className="pr-9"
                      value={smtpConfig.SMTP_PASS}
                      onChange={(e) => setSmtpConfig({ ...smtpConfig, SMTP_PASS: e.target.value })}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      title={showSmtpPass ? '隐藏密码' : '显示密码'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={() => setShowSmtpPass((v) => !v)}
                    >
                      {showSmtpPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>发件人（From）</Label>
                  <Input
                    placeholder="X Answerer Service <noreply@example.com>"
                    disabled={!smtpEditing}
                    value={smtpConfig.EMAIL_FROM}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, EMAIL_FROM: e.target.value })}
                  />
                </div>
                <div
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3',
                    !smtpEditing && 'opacity-60',
                  )}
                >
                  <div>
                    <p className="text-sm">SSL/TLS</p>
                    <p className="text-xs text-muted-foreground mt-0.5">465 端口通常开启</p>
                  </div>
                  <Switch
                    disabled={!smtpEditing}
                    checked={smtpConfig.SMTP_SECURE === 'true'}
                    onCheckedChange={(checked) =>
                      setSmtpConfig({ ...smtpConfig, SMTP_SECURE: checked ? 'true' : 'false' })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 站点与登录 */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4 gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold truncate">站点与登录</h3>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    登录态有效期仅对新签发的登录生效；Passkey 域名需与访问域名一致。
                  </p>
                </div>
                {siteEditing ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={cancelEditSite}>
                      取消
                    </Button>
                    <SaveButton size="sm" onSave={saveSite} />
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditSite}>
                    <Pencil className="size-4" />
                    编辑
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>站点名称</Label>
                  <Input
                    disabled={!siteEditing}
                    value={siteConfig.SITE_NAME}
                    onChange={(e) => setSiteConfig({ ...siteConfig, SITE_NAME: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>登录态有效期</Label>
                  <Input
                    placeholder="如 7d、24h、12h30m"
                    disabled={!siteEditing}
                    value={siteConfig.JWT_EXPIRES_IN}
                    onChange={(e) =>
                      setSiteConfig({ ...siteConfig, JWT_EXPIRES_IN: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Passkey 域名（RP_ID）</Label>
                  <Input
                    placeholder="localhost 或 example.com"
                    disabled={!siteEditing}
                    value={siteConfig.RP_ID}
                    onChange={(e) => setSiteConfig({ ...siteConfig, RP_ID: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Passkey 名称（RP_NAME）</Label>
                  <Input
                    disabled={!siteEditing}
                    value={siteConfig.RP_NAME}
                    onChange={(e) => setSiteConfig({ ...siteConfig, RP_NAME: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 其它题库（弹窗创建/修改，即时持久化） */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4 gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold">其它题库</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    本地题库未命中时按顺序查询外部题库接口（OCSJS 格式），命中后自动收录。
                  </p>
                </div>
              </div>
              {/* 总开关 */}
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 mb-4">
                <div>
                  <p className="text-sm">启用其它题库</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    关闭后搜题仅使用本地题库与 AI，批量补全不受影响
                  </p>
                </div>
                <Switch
                  checked={upstreamEnabled}
                  disabled={savingUpstreamEnabled}
                  onCheckedChange={toggleUpstreamEnabled}
                />
              </div>
              {upstreamEnabledError && (
                <p className="text-sm text-destructive mb-3">{upstreamEnabledError}</p>
              )}
              <div className={upstreamEnabled ? '' : 'opacity-50 pointer-events-none'}>
                {upstreams.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    暂无题库，点击下方按钮添加
                  </p>
                ) : (
                  <div className="space-y-2">
                    {upstreams.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{u.name || '未命名题库'}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.url}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {u.enabled ? '已启用' : '已停用'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => openEditUpstream(u)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => askRemoveUpstream(u)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  variant="outline"
                  className="w-full border-dashed mt-3 gap-1.5"
                  onClick={openCreateUpstream}
                >
                  <Plus className="size-4" />
                  添加题库
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>
          {/* 右列 */}
          <div className="space-y-6">
          {/* AI 搜题 - 全局配置 */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4 gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold truncate">AI 搜题</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    仅在本地与其它题库均未命中时，按「作答模型链」优先级依次调用大模型作答，
                    答案直接入库（来源 auto_record，answeredBy 记录 ai:供应商/模型），待人工验证。
                  </p>
                </div>
                {aiEditing ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={cancelEditAi}>
                      取消
                    </Button>
                    <SaveButton size="sm" onSave={saveAiGlobal} />
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditAi}>
                    <Pencil className="size-4" />
                    编辑
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3',
                    !aiEditing && 'opacity-60',
                  )}
                >
                  <div>
                    <p className="text-sm">启用 AI 搜题</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      关闭时完全跳过 AI 环节
                    </p>
                  </div>
                  <Switch
                    disabled={!aiEditing}
                    checked={aiConfig.AI_SEARCH_ENABLED === 'true'}
                    onCheckedChange={(checked) =>
                      setAiConfig({ ...aiConfig, AI_SEARCH_ENABLED: checked ? 'true' : 'false' })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>超时（毫秒，1s ~ 60s，单模型）</Label>
                  <Input
                    placeholder="30000"
                    disabled={!aiEditing}
                    value={aiConfig.AI_TIMEOUT_MS}
                    onChange={(e) => setAiConfig({ ...aiConfig, AI_TIMEOUT_MS: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>温度（0 ~ 2，越低越稳定）</Label>
                  <Input
                    placeholder="0.2"
                    disabled={!aiEditing}
                    value={aiConfig.AI_TEMPERATURE}
                    onChange={(e) => setAiConfig({ ...aiConfig, AI_TEMPERATURE: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>AI 答题范围</Label>
                  <p className="text-xs text-muted-foreground">
                    仅在范围内的题型走 AI 兜底作答；未标注题型的题目视为「其它」
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {AI_ANSWER_TYPE_OPTIONS.map((opt) => {
                      const active = answerTypesOf(aiConfig.AI_ANSWER_TYPES).includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={!aiEditing}
                          onClick={() => aiEditing && toggleAnswerType(opt.value)}
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs transition-colors cursor-pointer select-none',
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground hover:bg-muted',
                            !aiEditing && 'opacity-60 cursor-not-allowed',
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>自定义补充说明（追加到答题提示词，可选）</Label>
                  <Textarea
                    rows={3}
                    placeholder="例如：答案以教材《XXX》为准"
                    disabled={!aiEditing}
                    value={aiConfig.AI_CUSTOM_PROMPT}
                    onChange={(e) => setAiConfig({ ...aiConfig, AI_CUSTOM_PROMPT: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI 供应商 */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">AI 供应商</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    OpenAI 兼容接口供应商，API Key 仅存于服务端。点击「编辑」可在弹窗中管理可用模型（手动添加或拉取）。
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openCreateProvider}>
                  <Plus className="size-4" />
                  添加供应商
                </Button>
              </div>

              {aiProviders.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  暂无供应商，添加后可在「作答模型链」中选择模型。
                </p>
              )}

              <div className="space-y-3">
                {aiProviders.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      'border rounded-lg p-3 flex items-center gap-3 transition-opacity',
                      !p.enabled && 'opacity-50',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{p.name || '未命名供应商'}</p>
                        <Badge
                          variant={p.enabled ? 'default' : 'secondary'}
                          className="text-xs shrink-0"
                        >
                          {p.enabled ? '启用' : '停用'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        @{p.id} · {p.baseUrl}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(p.models ?? []).length} 个模型
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => openEditProvider(p)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => askRemoveProvider(p)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 作答模型链 */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4 gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold truncate">作答模型链</h3>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    按从上到下的优先级依次尝试作答，某模型失败/超时自动降级下一个。
                  </p>
                </div>
                {chainEditing ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={cancelEditChain}>
                      取消
                    </Button>
                    <SaveButton onSave={saveChain} size="sm" />
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={startEditChain}
                  >
                    <Pencil className="size-4" />
                    编辑
                  </Button>
                )}
              </div>

              {aiProviders.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">请先添加并保存 AI 供应商。</p>
              )}

              {!chainEditing && modelChain.length === 0 && aiProviders.length > 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  暂未配置作答模型链，搜题时不会使用 AI 作答。
                </p>
              )}

              <div className="space-y-3">
                {modelChain.map((item, index) => {
                  const provider = aiProviders.find((p) => p.id === item.providerId);
                  const providerMissing = !!item.providerId && !provider;
                  const providerDisabled = !!provider && !provider.enabled;
                  const providerModels = provider?.models ?? [];
                  // 该模型是否已被其他链项选用（同供应商下不允许重复）
                  const isDup =
                    !!item.modelId.trim() &&
                    modelChain.some(
                      (it, i) =>
                        i !== index &&
                        it.providerId === item.providerId &&
                        it.modelId.trim() === item.modelId.trim(),
                    );

                  // 只读模式：仅展示供应商 / 模型与状态标记
                  if (!chainEditing) {
                    return (
                      <div
                        key={index}
                        className={cn(
                          'border rounded-lg p-3 flex items-center gap-3',
                          (providerMissing || providerDisabled || item.disabled) && 'opacity-50',
                        )}
                      >
                        <span className="w-6 text-sm text-muted-foreground text-center shrink-0">
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {provider?.name || (providerMissing ? '未知供应商' : '未选择供应商')}
                          </p>
                          <span className="text-sm text-muted-foreground truncate">
                            {item.modelId || '未选择模型'}
                          </span>
                          {item.disabled && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              已禁用
                            </Badge>
                          )}
                          {providerMissing && (
                            <Badge variant="destructive" className="text-xs shrink-0">
                              供应商已删除
                            </Badge>
                          )}
                          {providerDisabled && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              供应商已禁用
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={index}
                      draggable={chainDragIndex === index}
                      onDragStart={(e) => {
                        setChainDragIndex(index);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setChainDragIndex(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (chainDragIndex !== null && chainDragIndex !== index) {
                          reorderChain(chainDragIndex, index);
                        }
                        setChainDragIndex(null);
                      }}
                      className={cn(
                        'border rounded-lg p-3 space-y-2',
                        (providerMissing || providerDisabled || item.disabled) && 'opacity-50',
                        isDup && 'border-destructive',
                        chainDragIndex === index && 'opacity-40',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="flex items-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                          title="按住拖拽排序"
                          onPointerDown={() => setChainDragIndex(index)}
                        >
                          <GripVertical className="size-4" />
                        </span>
                        <span className="w-6 text-sm text-muted-foreground text-center shrink-0">
                          {index + 1}
                        </span>
                        <Select
                          value={item.providerId || undefined}
                          onValueChange={(v) => changeChainProvider(index, v)}
                        >
                          <SelectTrigger className="w-30 min-w-0 shrink">
                            <SelectValue placeholder="选择供应商" />
                          </SelectTrigger>
                          <SelectContent>
                            {aiProviders.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name || '未命名供应商'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {providerModels.length > 0 ? (
                          <Select
                            value={item.modelId || undefined}
                            onValueChange={(v) => updateChainItem(index, { modelId: v })}
                          >
                            <SelectTrigger className="flex-1 min-w-40">
                              <SelectValue placeholder="选择模型" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {providerModels.map((m) => {
                                const used = modelChain.some(
                                  (it, i) =>
                                    i !== index &&
                                    it.providerId === item.providerId &&
                                    it.modelId === m,
                                );
                                return (
                                  <SelectItem key={m} value={m} disabled={used}>
                                    {m}
                                    {used && (
                                      <span className="text-muted-foreground">（已使用）</span>
                                    )}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className="flex-1 min-w-40"
                            placeholder="该供应商暂无模型列表，手动输入模型 ID"
                            value={item.modelId}
                            onChange={(e) => updateChainItem(index, { modelId: e.target.value })}
                          />
                        )}
                      </div>

                      {/* 第二行：排序与启停操作 */}
                      <div className="flex items-center gap-1 pl-8">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          disabled={index === 0}
                          onClick={() => moveChainItem(index, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          disabled={index === modelChain.length - 1}
                          onClick={() => moveChainItem(index, 1)}
                        >
                          ↓
                        </Button>
                        <div className="flex items-center gap-2 shrink-0 pl-2 ml-1">
                          <span className="text-xs text-muted-foreground">启用</span>
                          <Switch
                            checked={!item.disabled}
                            onCheckedChange={(v) =>
                              updateChainItem(index, { disabled: !v })
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 ml-1 text-muted-foreground hover:text-destructive"
                          onClick={() => removeChainItem(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {item.disabled && (
                        <p className="text-xs text-muted-foreground pl-8">
                          该模型已禁用，搜题与批量补全时将跳过
                        </p>
                      )}
                      {isDup && (
                        <p className="text-xs text-destructive pl-8">
                          该模型已在作答模型链中，请移除重复项后再保存
                        </p>
                      )}
                      {providerMissing && (
                        <p className="text-xs text-destructive pl-8">
                          引用的供应商已删除，保存后将自动移除该项
                        </p>
                      )}
                      {providerDisabled && (
                        <p className="text-xs text-muted-foreground pl-8">
                          供应商已禁用，搜题时将跳过此模型
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {chainEditing && modelChain.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed gap-1.5 mt-3"
                  onClick={addChainItem}
                  disabled={aiProviders.length === 0}
                >
                  <Plus className="size-4" />
                  添加模型
                </Button>
              )}
            </CardContent>
          </Card>

          {/* 权限组 */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-semibold mb-4">权限组配置</h3>
              {roles.length === 0 && (
                <p className="text-sm text-muted-foreground">暂无权限数据</p>
              )}
              <div className="space-y-4">
                {roles.map((role) => (
                  <div key={role.name} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge className={ROLE_CLASSES[role.name] || ''}>
                          {ROLE_LABELS[role.name] || role.name}
                        </Badge>
                        {role.name === 'OWNER' && (
                          <span className="text-xs text-muted-foreground">（不可修改）</span>
                        )}
                      </div>
                      {role.name !== 'OWNER' && !editingRoles[role.name] && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => startEditRole(role)}
                        >
                          编辑
                        </Button>
                      )}
                      {role.name !== 'OWNER' && editingRoles[role.name] && (
                        <div className="flex gap-2">
                          <SaveButton
                            variant="link"
                            size="sm"
                            savedText="已保存"
                            onSave={() => saveRolePermissions(role)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() => cancelEditRole(role)}
                          >
                            取消
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {allPermissions.map((p) => (
                        <span
                          key={p.name}
                          onClick={() => togglePermission(role, p.name)}
                          className={cn(
                            'inline-block px-2 py-0.5 text-xs rounded border transition-colors',
                            editingRoles[role.name] && role.name !== 'OWNER'
                              ? 'cursor-pointer'
                              : 'cursor-default',
                            permissionChipClass(role, p.name)
                          )}
                        >
                          {shortPermission(p.name)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      {/* 关于 */}
      {!loading && !error && (
        <Card className="max-w-7xl mx-auto mt-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">X Answerer Service</span>
              <span className="text-muted-foreground">v{__APP_VERSION__}</span>
            </div>
            <a
              href="https://github.com/xyz8848/x-answerer-service"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="size-4" />
              github.com/xyz8848/x-answerer-service
              <ExternalLink className="size-3.5" />
            </a>
          </CardContent>
        </Card>
      )}

      {/* AI 供应商 创建/修改弹窗 */}
      <Dialog
        open={providerDialogOpen}
        onOpenChange={(open) => {
          if (!open) setProviderDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProviderId ? '编辑供应商' : '添加供应商'}</DialogTitle>
            <DialogDescription>
              OpenAI 兼容接口。保存后可拉取模型，或手动输入模型 ID 添加。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>ID</Label>
              <Input
                placeholder="如 deepseek（字母/数字/-/_），修改后历史答案标记自动迁移"
                value={providerForm.id}
                onChange={(e) => setProviderForm({ ...providerForm, id: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                placeholder="如 OpenAI / 硅基流动 / DeepSeek"
                value={providerForm.name}
                onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input
                placeholder="https://api.openai.com/v1"
                value={providerForm.baseUrl}
                onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showProviderKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={providerForm.apiKey}
                  onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setShowProviderKey((v) => !v)}
                  aria-label={showProviderKey ? '隐藏 API Key' : '显示 API Key'}
                >
                  {showProviderKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3">
              <div>
                <p className="text-sm">启用</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  停用后搜题时跳过该供应商下的所有模型
                </p>
              </div>
              <Switch
                checked={providerForm.enabled}
                onCheckedChange={(checked) =>
                  setProviderForm({ ...providerForm, enabled: checked })
                }
              />
            </div>

            <Separator />

            {/* 可用模型管理 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>可用模型（{providerForm.models.length}）</Label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={fetchingModels || savingProvider}
                  onClick={fetchModelsInDialog}
                >
                  {fetchingModels ? '拉取中...' : '拉取模型'}
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="手动输入模型 ID，如 gpt-4o-mini"
                  value={manualModel}
                  onChange={(e) => setManualModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addManualModel();
                    }
                  }}
                />
                <Button variant="outline" className="shrink-0" onClick={addManualModel}>
                  添加
                </Button>
              </div>

              {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}

              {fetchedModels && fetchedModels.length > 0 && (
                <div className="border rounded-lg p-2 space-y-1.5 max-h-44 overflow-y-auto">
                  <p className="text-xs text-muted-foreground">
                    拉取到 {fetchedModels.length} 个模型，点击加入/移出可用模型：
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {fetchedModels.map((m) => {
                      const added = providerForm.models.includes(m);
                      return (
                        <span
                          key={m}
                          title={added ? '点击移出可用模型' : '点击加入可用模型'}
                          onClick={() => (added ? removeModel(m) : addFetchedModel(m))}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border cursor-pointer transition-colors break-all',
                            added
                              ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/80'
                              : 'hover:border-primary/50',
                          )}
                        >
                          {added ? '✓' : '+'} {m}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {providerForm.models.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {providerForm.models.map((m) => (
                    <Badge
                      key={m}
                      variant="secondary"
                      className="gap-1 max-w-full cursor-pointer"
                      title="点击移除该模型"
                      onClick={() => removeModel(m)}
                    >
                      <span className="truncate">{m}</span>
                      <X className="size-3 shrink-0 opacity-70" aria-hidden />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>
              关闭
            </Button>
            <Button onClick={() => handleSaveProvider()} disabled={savingProvider}>
              {savingProvider ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除供应商确认弹窗 */}
      <ConfirmDialog
        open={!!deleteProviderTarget}
        onOpenChange={(open) => !open && setDeleteProviderTarget(null)}
        title="删除供应商"
        description={`确定删除「${deleteProviderTarget?.name || '未命名供应商'}」吗？作答模型链中引用它的条目将一并移除。`}
        confirmText="删除"
        destructive
        loading={deletingProvider}
        error={deleteProviderError}
        onConfirm={confirmRemoveProvider}
      />

      {/* 其它题库 创建/修改弹窗 */}
      <Dialog
        open={upstreamDialogOpen}
        onOpenChange={(open) => {
          if (!open) setUpstreamDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUpstreamId ? '编辑题库' : '添加题库'}</DialogTitle>
            <DialogDescription>
              OCSJS 官方题库格式（POST 接口）。保存后立即生效，无需额外保存。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                placeholder="如 xxx题库"
                value={upstreamForm.name}
                onChange={(e) => setUpstreamForm({ ...upstreamForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>接口地址</Label>
              <Input
                placeholder="https://example.com/query"
                value={upstreamForm.url}
                onChange={(e) => setUpstreamForm({ ...upstreamForm, url: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Token（如需要）</Label>
              <div className="relative">
                <Input
                  type={showUpstreamToken ? 'text' : 'password'}
                  placeholder="留空表示不需要 Token"
                  value={upstreamForm.token}
                  onChange={(e) => setUpstreamForm({ ...upstreamForm, token: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setShowUpstreamToken((v) => !v)}
                  aria-label={showUpstreamToken ? '隐藏 Token' : '显示 Token'}
                >
                  {showUpstreamToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3">
              <div>
                <p className="text-sm">启用</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  停用后搜题时跳过该题库
                </p>
              </div>
              <Switch
                checked={upstreamForm.enabled}
                onCheckedChange={(checked) =>
                  setUpstreamForm({ ...upstreamForm, enabled: checked })
                }
              />
            </div>
          </div>

          {upstreamDialogError && <p className="text-sm text-destructive">{upstreamDialogError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUpstreamDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveUpstream} disabled={savingUpstream}>
              {savingUpstream ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除其它题库确认弹窗 */}
      <ConfirmDialog
        open={!!deleteUpstreamTarget}
        onOpenChange={(open) => !open && setDeleteUpstreamTarget(null)}
        title="删除题库"
        description={`确定删除「${deleteUpstreamTarget?.name || '未命名题库'}」吗？`}
        confirmText="删除"
        destructive
        loading={deletingUpstream}
        error={deleteUpstreamError}
        onConfirm={confirmRemoveUpstream}
      />

      {/* 未保存更改离开确认弹窗 */}
      <Dialog open={leaveDialogOpen} onOpenChange={(open) => !open && stayOnPage()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>有未保存的更改</DialogTitle>
            <DialogDescription>
              当前卡片处于编辑状态，离开页面将丢失未保存的修改。
            </DialogDescription>
          </DialogHeader>
          {leaveError && <p className="text-sm text-destructive">{leaveError}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={stayOnPage} disabled={savingToLeave}>
              留在本页
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={discardAndLeave}
              disabled={savingToLeave}
            >
              不保存离开
            </Button>
            <Button onClick={saveAndLeave} disabled={savingToLeave}>
              {savingToLeave ? '保存中...' : '保存并离开'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
