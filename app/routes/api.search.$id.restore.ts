import type { Route } from './+types/api.search.$id.restore';
import { Permission } from '@/lib/types';
import { requireUser } from '@/lib/server/auth.server';
import { httpError, ok } from '@/lib/server/http.server';
import { restoreQuestion } from '@/lib/server/question.service.server';

/** 恢复题目状态（已拒绝 → 待收录；已验证 → 已解答；已解答 → 待收录），需 question:verify / question:delete / question:answer 任一权限 */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  if (request.method !== 'PATCH') httpError(405, 'Method Not Allowed');

  const canRestore =
    user.permissions.includes(Permission.QUESTION_VERIFY) ||
    user.permissions.includes(Permission.QUESTION_DELETE) ||
    user.permissions.includes(Permission.QUESTION_ANSWER);
  if (!canRestore) httpError(403, '权限不足：缺少必要权限节点');

  const result = await restoreQuestion(params.id);
  return ok(result, '题目已恢复');
}
