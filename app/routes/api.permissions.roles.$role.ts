import { z } from 'zod';
import type { Route } from './+types/api.permissions.roles.$role';
import { Permission, Role } from '@/lib/types';
import { prisma } from '@/lib/server/db.server';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';
import { invalidateRolePermissionsCache } from '@/lib/server/permission.server';

const schema = z.object({ permissions: z.array(z.string()) }).strict();

/** 更新角色权限（OWNER，不允许修改 OWNER 自身），持久化到 system_configs 表 */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.OWNER);
  if (request.method !== 'PUT') httpError(405, 'Method Not Allowed');

  const { role } = params;
  if (role === Role.OWNER) httpError(403, '不能修改拥有者权限');
  if (!Object.values(Role).includes(role as Role)) httpError(400, '无效的角色');

  const dto = await parseBody(request, schema);
  // 验证所有权限节点是否有效
  const validPermissions = Object.values(Permission);
  for (const p of dto.permissions) {
    if (!validPermissions.includes(p as Permission)) {
      httpError(400, `无效的权限节点: ${p}`);
    }
  }

  await prisma.systemConfig.upsert({
    where: { key: `ROLE_PERMISSIONS_${role}` },
    create: { key: `ROLE_PERMISSIONS_${role}`, value: JSON.stringify(dto.permissions) },
    update: { value: JSON.stringify(dto.permissions) },
  });
  // 立即生效（清除运行时权限缓存）
  invalidateRolePermissionsCache();
  return ok(null, '权限已更新');
}
