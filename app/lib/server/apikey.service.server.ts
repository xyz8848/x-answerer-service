import { randomBytes } from 'node:crypto';
import { prisma } from './db.server';
import { httpError } from './http.server';

/** 生成 API Key：xas_ + 48 位十六进制随机串 */
function generateKey(): string {
  return `xas_${randomBytes(24).toString('hex')}`;
}

/** 当前用户的 API Key 列表（按创建时间倒序） */
export async function listApiKeys(userId: number) {
  const items = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      key: true,
      name: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  return { items };
}

/** 创建 API Key（返回完整 key，仅创建时可复制配置） */
export async function createApiKey(userId: number, name: string) {
  const apiKey = await prisma.apiKey.create({
    data: {
      key: generateKey(),
      name: name.trim().slice(0, 50),
      userId,
    },
  });
  return {
    id: apiKey.id,
    key: apiKey.key,
    name: apiKey.name,
    lastUsedAt: null,
    createdAt: apiKey.createdAt,
  };
}

/** 删除 API Key（仅允许删除自己的） */
export async function deleteApiKey(userId: number, id: string) {
  const apiKey = await prisma.apiKey.findUnique({ where: { id } });
  if (!apiKey || apiKey.userId !== userId) httpError(404, 'API Key 不存在');

  await prisma.apiKey.delete({ where: { id } });
}

/**
 * 校验搜题请求携带的 API Key。
 * 提取顺序：Header X-API-Key → query token → body token（覆盖 OCSJS data.token 与
 * TikuAdapter ?token= 两种协议传法）。key 存在且属主账号未禁用才算有效，
 * 命中后异步刷新 lastUsedAt。
 */
export async function verifyApiKey(
  request: Request,
  body?: Record<string, unknown>
): Promise<boolean> {
  const url = new URL(request.url);
  const token =
    request.headers.get('X-API-Key')?.trim() ||
    url.searchParams.get('token')?.trim() ||
    (typeof body?.token === 'string' ? body.token.trim() : '');
  if (!token) return false;

  const apiKey = await prisma.apiKey.findUnique({
    where: { key: token },
    select: { id: true, user: { select: { isActive: true } } },
  });
  if (!apiKey || !apiKey.user.isActive) return false;

  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
  return true;
}
