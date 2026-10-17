import type { Route } from './+types/api.search.$id.verify';
import { Permission } from '@/lib/types';
import { requirePermission, requireUser } from '@/lib/server/auth.server';
import { httpError, ok } from '@/lib/server/http.server';
import { verifyQuestion } from '@/lib/server/question.service.server';

/** 验证题目答案（question:verify 权限） */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  requirePermission(user, Permission.QUESTION_VERIFY);
  if (request.method !== 'PATCH') httpError(405, 'Method Not Allowed');

  await verifyQuestion(params.id);
  return ok(null, '题目已验证');
}
