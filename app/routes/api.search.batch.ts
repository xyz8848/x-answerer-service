import { z } from 'zod';
import type { Route } from './+types/api.search.batch';
import { Permission } from '@/lib/types';
import { requirePermission, requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';
import { batchOperateQuestions } from '@/lib/server/question.service.server';

const schema = z
  .object({
    action: z.enum(['verify', 'reject', 'delete']),
    ids: z.array(z.string().min(1)).min(1),
  })
  .strict();

/** 批量操作题目（PATCH /search/batch） */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  if (request.method !== 'PATCH') httpError(405, 'Method Not Allowed');

  const dto = await parseBody(request, schema);
  // 验证与单个题目验证一致（question:verify），拒绝/删除与单个题目拒绝一致（question:delete）
  requirePermission(
    user,
    dto.action === 'verify' ? Permission.QUESTION_VERIFY : Permission.QUESTION_DELETE,
  );

  const result = await batchOperateQuestions(dto.action, dto.ids);
  const msg =
    dto.action === 'verify'
      ? `已验证 ${result.matched} 道题目`
      : dto.action === 'delete'
        ? `已删除 ${result.matched} 道题目`
        : `已拒绝 ${result.matched} 道题目`;
  return ok(result, msg);
}
