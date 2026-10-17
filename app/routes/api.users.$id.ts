import type { Route } from './+types/api.users.$id';
import { Permission } from '@/lib/types';
import { requirePermission, requireUser } from '@/lib/server/auth.server';
import { httpError, ok } from '@/lib/server/http.server';
import { deleteUser, getUser } from '@/lib/server/user.service.server';

/** 获取单个用户（user:view 权限） */
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  requirePermission(user, Permission.USER_VIEW);
  return ok(await getUser(Number(params.id)));
}

/** 删除用户（user:delete 权限） */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  requirePermission(user, Permission.USER_DELETE);
  if (request.method !== 'DELETE') httpError(405, 'Method Not Allowed');

  await deleteUser(Number(params.id));
  return ok(null, '用户已删除');
}
