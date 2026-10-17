import type { Route } from './+types/api.permissions.nodes';
import { Permission, Role } from '@/lib/types';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { ok } from '@/lib/server/http.server';

/** 获取所有权限节点定义（ADMIN / OWNER） */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.ADMIN, Role.OWNER);

  const nodes = Object.values(Permission).map((p: string) => ({
    name: p,
    description: p.split(':')[1],
    module: p.split(':')[0],
  }));
  return ok(nodes);
}
