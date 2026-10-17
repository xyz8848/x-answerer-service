import type { Route } from './+types/api.search.pending';
import { Role } from '@/lib/types';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { ok } from '@/lib/server/http.server';
import { getPendingQuestions } from '@/lib/server/question.service.server';

/** 获取题目列表（ADMIN / OWNER），可按状态筛选 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.ADMIN, Role.OWNER);

  const url = new URL(request.url);
  const page = url.searchParams.get('page') || '1';
  const pageSize = url.searchParams.get('pageSize') || '20';
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;

  const result = await getPendingQuestions(+page, +pageSize, status, search);
  return ok(result);
}
