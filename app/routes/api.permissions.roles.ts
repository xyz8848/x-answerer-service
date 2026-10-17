import type { Route } from './+types/api.permissions.roles';
import { Role } from '@/lib/types';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { ok } from '@/lib/server/http.server';
import { getRolePermissions } from '@/lib/server/permission.server';

/** 获取权限组及其权限映射（ADMIN / OWNER），读取数据库生效值 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.ADMIN, Role.OWNER);

  const rolePermissions = await getRolePermissions();
  const roles = Object.values(Role).map((role) => ({
    name: role,
    permissions: rolePermissions[role] || [],
  }));
  return ok(roles);
}
