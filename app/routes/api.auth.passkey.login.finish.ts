import type { Route } from './+types/api.auth.passkey.login.finish';
import { authToken, signToken } from '@/lib/server/auth.server';
import { passkeyLoginFinish } from '@/lib/server/auth.service.server';

/** Passkey 登录 - 完成（现状平移：桩实现，不验签），成功后写入 httpOnly Cookie */
export async function action({ request }: Route.ActionArgs) {
  void request;
  const body = await request.json().catch(() => ({}));
  const user = await passkeyLoginFinish(body);
  const token = await signToken({ sub: user.id, email: user.email, role: user.role });
  return Response.json(
    { code: 1, data: { accessToken: token }, msg: '登录成功' },
    { headers: { 'Set-Cookie': await authToken.serialize(token) } }
  );
}
