import type { Route } from './+types/api.auth.passkey.register.finish';
import { passkeyRegisterFinish } from '@/lib/server/auth.service.server';
import { requireUser } from '@/lib/server/auth.server';
import { ok } from '@/lib/server/http.server';

/** Passkey 注册 - 完成（现状平移：桩实现，不验签） */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const body = await request.json().catch(() => ({}));
  await passkeyRegisterFinish(user.id, body);
  return ok(null, 'Passkey 注册成功');
}
