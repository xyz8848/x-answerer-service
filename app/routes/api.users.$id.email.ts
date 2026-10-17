import { z } from 'zod';
import type { Route } from './+types/api.users.$id.email';
import { Role } from '@/lib/types';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';
import { updateEmail } from '@/lib/server/user.service.server';

const schema = z.object({ email: z.string().email() }).strict();

/** 更新用户邮箱（OWNER） */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.OWNER);
  if (request.method !== 'PATCH') httpError(405, 'Method Not Allowed');

  const dto = await parseBody(request, schema);
  await updateEmail(Number(params.id), dto.email);
  return ok(null, '邮箱已更新');
}
