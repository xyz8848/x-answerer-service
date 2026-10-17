import { z } from 'zod';
import type { Route } from './+types/api.users.$id.status';
import { Role } from '@/lib/types';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';
import { toggleStatus } from '@/lib/server/user.service.server';

const schema = z.object({ isActive: z.boolean() }).strict();

/** 禁用/启用用户（OWNER） */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.OWNER);
  if (request.method !== 'PATCH') httpError(405, 'Method Not Allowed');

  const dto = await parseBody(request, schema);
  await toggleStatus(Number(params.id), dto.isActive);
  return ok(null, '状态已更新');
}
