import { SignJWT, jwtVerify } from 'jose';
import { createCookie } from 'react-router';
import { randomBytes } from 'node:crypto';
import type { ICurrentUser, Permission, Role } from '@/lib/types';
import { httpError } from './http.server';
import { prisma } from './db.server';
import { getSystemConfig } from './auth.service.server';
import { getRolePermissions } from './permission.server';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** JWT 密钥：首次使用时自动生成并持久化到 SystemConfig（数据库），进程内缓存 */
let cachedSecretKey: Uint8Array | null = null;
async function getSecretKey(): Promise<Uint8Array> {
  if (cachedSecretKey) return cachedSecretKey;
  const row = await prisma.systemConfig.findUnique({ where: { key: 'JWT_SECRET' } });
  let secret = row?.value;
  if (!secret) {
    secret = randomBytes(48).toString('hex');
    await prisma.systemConfig.upsert({
      where: { key: 'JWT_SECRET' },
      create: { key: 'JWT_SECRET', value: secret },
      update: { value: secret },
    });
    console.log('已生成新的 JWT 密钥并写入数据库（SystemConfig.JWT_SECRET）');
  }
  cachedSecretKey = new TextEncoder().encode(secret);
  return cachedSecretKey;
}

/** httpOnly Cookie 存放 JWT（登录态），7 天有效期 */
export const authToken = createCookie('auth_token', {
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 7,
});

export async function signToken(payload: JwtPayload): Promise<string> {
  const [secretKey, expiresIn] = await Promise.all([
    getSecretKey(),
    getSystemConfig('JWT_EXPIRES_IN', '7d'),
  ]);
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const secretKey = await getSecretKey();
  const { payload } = await jwtVerify(token, secretKey);
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    role: payload.role as Role,
  };
}

/** 角色 → 权限节点映射改从数据库解析（系统设置页保存后生效），JWT 中只存角色 */
async function toCurrentUser(payload: JwtPayload): Promise<ICurrentUser> {
  const rolePermissions = await getRolePermissions();
  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    permissions: rolePermissions[payload.role] || [],
  };
}

/** 读取 cookie 解析当前用户，未登录返回 null（页面路由用） */
export async function getUserOrNull(request: Request): Promise<ICurrentUser | null> {
  const token = await authToken.parse(request.headers.get('Cookie'));
  if (!token || typeof token !== 'string') return null;
  try {
    return await toCurrentUser(await verifyToken(token));
  } catch {
    return null;
  }
}

/** 强制鉴权（资源路由用），未登录抛 401；写请求附带同源校验（CSRF 兜底） */
export async function requireUser(request: Request): Promise<ICurrentUser> {
  const user = await getUserOrNull(request);
  if (!user) httpError(401, '未登录或登录已过期');
  assertSameOrigin(request);
  return user;
}

/** SameSite=Lax 之外的第二道防线：非浏览器客户端（无 Origin 头）放行 */
function assertSameOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = request.headers.get('host');
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) httpError(403, '跨站请求被拒绝');
  } catch {
    // origin 非法，忽略
  }
}

/** 角色校验（对应 NestJS @RequireRoles） */
export function requireRole(user: ICurrentUser, ...roles: Role[]) {
  if (!roles.includes(user.role)) httpError(403, '权限不足：角色不符');
}

/** 权限节点校验（对应 NestJS @RequirePermissions） */
export function requirePermission(user: ICurrentUser, ...permissions: Permission[]) {
  for (const p of permissions) {
    if (!user.permissions.includes(p)) httpError(403, '权限不足：缺少必要权限节点');
  }
}
