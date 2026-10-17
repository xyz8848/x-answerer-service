import { z } from 'zod';
import type { Route } from './+types/api.ai.providers.rename';
import { Role } from '@/lib/types';
import { prisma } from '@/lib/server/db.server';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';

const schema = z
  .object({
    oldId: z.string().min(1),
    newId: z.string().min(1),
  })
  .strict();

/**
 * 供应商 ID 重命名（OWNER）。
 * 级联迁移 Question.answeredBy 中以 `ai:<oldId>/` 开头的历史 AI 作答标记（`ai:oldId/模型` -> `ai:newId/模型`），
 * 保证修改供应商 ID 后已入库答案的来源标记保持一致。供应商配置与作答模型链由前端一并持久化。
 */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.OWNER);
  if (request.method !== 'POST') httpError(405, 'Method Not Allowed');

  const { oldId, newId } = await parseBody(request, schema);
  if (oldId === newId) return ok({ updated: 0 });

  const affected = await prisma.question.findMany({
    where: { answeredBy: { startsWith: `ai:${oldId}/` } },
    select: { id: true, answeredBy: true },
  });

  if (affected.length > 0) {
    await prisma.$transaction(
      affected.map((q) =>
        prisma.question.update({
          where: { id: q.id },
          data: {
            answeredBy: `ai:${newId}/${(q.answeredBy ?? '').slice(oldId.length + 4)}`,
          },
        }),
      ),
    );
  }

  return ok({ updated: affected.length }, `已迁移 ${affected.length} 条答案标记`);
}
