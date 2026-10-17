import { z } from 'zod';
import type { Route } from './+types/api.search.batch-answer';
import { Permission } from '@/lib/types';
import { requirePermission, requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';
import { batchAnswerQuestions } from '@/lib/server/question.service.server';

const schema = z
  .object({
    mode: z.enum(['upstream', 'ai']),
    ids: z.array(z.string().min(1)).min(1).max(200),
  })
  .strict();

/**
 * 批量补全答案（POST /search/batch-answer）：
 * - mode=upstream：从其它题库拉取答案
 * - mode=ai：AI 作答
 * 仅处理待收录状态的题目，已拒绝/已解答/已验证自动跳过。
 */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  if (request.method !== 'POST') httpError(405, 'Method Not Allowed');
  // 与单个标注答案一致，使用 question:answer 权限
  requirePermission(user, Permission.QUESTION_ANSWER);

  const dto = await parseBody(request, schema);
  const result = await batchAnswerQuestions(dto.mode, dto.ids);
  const modeLabel = dto.mode === 'upstream' ? '其它题库拉取' : 'AI 作答';
  return ok(result, `${modeLabel}完成：成功 ${result.succeeded}，跳过 ${result.skipped}，失败 ${result.failed}`);
}
