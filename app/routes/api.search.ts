import { z } from 'zod';
import type { Route } from './+types/api.search';
import { Permission } from '@/lib/types';
import { requirePermission, requireUser } from '@/lib/server/auth.server';
import { ok, parseBody } from '@/lib/server/http.server';
import { createQuestion } from '@/lib/server/question.service.server';

const schema = z
  .object({
    title: z.string().min(1),
    type: z.string(),
    answer: z.string().optional(),
    options: z.any().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

/** 手动创建题目（question:create 权限） */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  requirePermission(user, Permission.QUESTION_CREATE);
  const dto = await parseBody(request, schema);
  const question = await createQuestion(dto);
  return ok(question, '题目已创建');
}
