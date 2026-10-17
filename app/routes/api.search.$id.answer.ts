import { z } from 'zod';
import type { Route } from './+types/api.search.$id.answer';
import { Permission } from '@/lib/types';
import { requirePermission, requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';
import { answerQuestion } from '@/lib/server/question.service.server';

const schema = z
  .object({
    answer: z.string(),
    options: z.any().optional(),
  })
  .strict();

/** 给题目标注答案（question:answer 权限） */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  requirePermission(user, Permission.QUESTION_ANSWER);
  if (request.method !== 'PATCH') httpError(405, 'Method Not Allowed');

  const dto = await parseBody(request, schema);
  // 标注人取当前鉴权用户（此前误从 URL 查询参数读取，前端从未传过，导致 answeredBy 恒为空）
  await answerQuestion(params.id, dto.answer, dto.options, user.id);
  return ok(null, '答案已标注');
}
