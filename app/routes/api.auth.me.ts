import type { Route } from './+types/api.auth.me';
import { requireUser } from '@/lib/server/auth.server';
import { ok } from '@/lib/server/http.server';

/** 获取当前用户信息 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return ok(user);
}
