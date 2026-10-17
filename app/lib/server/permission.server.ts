import { Permission, Role, ROLE_PERMISSIONS } from '@/lib/types';
import { prisma } from './db.server';

/** 缓存有效期（毫秒）：权限组保存在 system_configs 表，设置页保存后立即失效缓存 */
const CACHE_TTL = 30_000;
let cache: { value: Record<Role, Permission[]>; expires: number } | null = null;

/**
 * 解析角色 → 权限节点映射。
 * 数据库键 ROLE_PERMISSIONS_<ROLE>（系统设置页保存）覆盖默认值，
 * 缺失时回落 @/lib/types 静态默认；OWNER 恒为全部权限。
 */
export async function getRolePermissions(): Promise<Record<Role, Permission[]>> {
  if (cache && Date.now() < cache.expires) return cache.value;

  const rows = await prisma.systemConfig.findMany({
    where: { key: { startsWith: 'ROLE_PERMISSIONS_' } },
  });

  const result = { ...ROLE_PERMISSIONS } as Record<Role, Permission[]>;
  for (const row of rows) {
    const role = row.key.replace('ROLE_PERMISSIONS_', '');
    if (!Object.values(Role).includes(role as Role)) continue;
    try {
      const parsed = JSON.parse(row.value);
      if (!Array.isArray(parsed)) continue;
      // 过滤掉无效权限节点，避免脏数据
      result[role as Role] = parsed.filter((p: string) =>
        Object.values(Permission).includes(p as Permission)
      );
    } catch {
      // 非法 JSON，回落默认值
    }
  }

  // OWNER 不可修改，恒为全部权限
  result[Role.OWNER] = Object.values(Permission);

  cache = { value: result, expires: Date.now() + CACHE_TTL };
  return result;
}

/** 设置页保存角色权限后调用，立即生效 */
export function invalidateRolePermissionsCache() {
  cache = null;
}
