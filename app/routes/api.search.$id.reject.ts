import type { Route } from './+types/api.search.$id.reject';
import { Permission } from '@/lib/types';
import { requirePermission, requireUser } from '@/lib/server/auth.server';
import { httpError, ok } from '@/lib/server/http.server';
import { rejectQuestion } from '@/lib/server/question.service.server';

/** 拒绝题目（question:delete 权限） */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  requirePermission(user, Permission.QUESTION_DELETE);
  if (request.method !== 'PATCH') httpError(405, 'Method Not Allowed');

  await rejectQuestion(params.id);
  return ok(null, '题目已拒绝');
}
