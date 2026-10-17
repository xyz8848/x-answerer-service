import type { Route } from './+types/api.search.stats';
import { Role } from '@/lib/types';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { ok } from '@/lib/server/http.server';
import { getStats } from '@/lib/server/question.service.server';

/** 获取题目统计（ADMIN / OWNER） */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.ADMIN, Role.OWNER);
  return ok(await getStats());
}
