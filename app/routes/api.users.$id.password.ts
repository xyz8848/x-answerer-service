import { z } from 'zod';
import type { Route } from './+types/api.users.$id.password';
import { Role } from '@/lib/types';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';
import { updatePassword } from '@/lib/server/user.service.server';

const schema = z.object({ password: z.string().min(6) }).strict();

/** 重置用户密码（OWNER） */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.OWNER);
  if (request.method !== 'PATCH') httpError(405, 'Method Not Allowed');

  const dto = await parseBody(request, schema);
  await updatePassword(Number(params.id), dto.password);
  return ok(null, '密码已重置');
}
