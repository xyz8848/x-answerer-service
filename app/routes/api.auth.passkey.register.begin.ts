import type { Route } from './+types/api.auth.passkey.register.begin';
import { passkeyRegisterBegin } from '@/lib/server/auth.service.server';
import { requireUser } from '@/lib/server/auth.server';
import { ok } from '@/lib/server/http.server';

/** Passkey 注册 - 开始（现状平移：桩实现） */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const options = await passkeyRegisterBegin(user.id);
  return ok(options);
}
