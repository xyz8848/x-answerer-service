import type { Route } from './+types/api.ai.models';
import { Role } from '@/lib/types';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { httpError, ok } from '@/lib/server/http.server';
import { getAiProviders } from '@/lib/server/ai.server';
import type { IAiProviderModel } from '@/lib/types';

/**
 * 拉取供应商下的可用模型列表（后端代理，apiKey 不出服务端）。
 * GET /api/ai/models?providerId=<id>（ADMIN / OWNER）
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.ADMIN, Role.OWNER);

  const providerId = new URL(request.url).searchParams.get('providerId')?.trim();
  if (!providerId) httpError(400, '缺少 providerId 参数');

  const provider = (await getAiProviders()).find((p) => p.id === providerId);
  if (!provider) httpError(404, '供应商不存在');
  if (!provider.enabled) httpError(400, '供应商已禁用');
  if (!provider.apiKey) httpError(400, '供应商未配置 API Key');

  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    console.error(
      '拉取供应商模型列表失败:',
      provider.name,
      error instanceof Error ? error.message : error,
    );
    httpError(504, isTimeout ? '供应商连接超时' : '供应商连接失败，请检查 Base URL');
  }

  if (response.status === 401 || response.status === 403) {
    httpError(502, '供应商鉴权失败，请检查 API Key');
  }
  if (!response.ok) {
    httpError(502, `供应商模型列表获取失败（HTTP ${response.status}）`);
  }

  // OpenAI 兼容格式：{ data: [{ id, ... }] }，只回传模型 id，不透传其他字段
  const data: any = await response.json().catch(() => null);
  if (!data || !Array.isArray(data.data)) {
    httpError(502, '供应商响应格式不兼容');
  }

  const models: IAiProviderModel[] = data.data
    .map((item: any) => (typeof item?.id === 'string' ? { id: item.id } : null))
    .filter((m: IAiProviderModel | null): m is IAiProviderModel => m !== null);

  return ok({ models });
}
