import { z } from 'zod';
import type { Route } from './+types/api.auth.login';
import { authToken, signToken } from '@/lib/server/auth.server';
import { login } from '@/lib/server/auth.service.server';
import { parseBody } from '@/lib/server/http.server';
import { rateLimit } from '@/lib/server/rate-limit.server';

const schema = z
  .object({
    email: z.string().email(),
    password: z.string(),
  })
  .strict();

/** 邮箱 + 密码登录（5 次/分钟），成功后 Set-Cookie 写入 httpOnly JWT */
export async function action({ request }: Route.ActionArgs) {
  rateLimit(request, 'login', 5, 60_000);
  const dto = await parseBody(request, schema);
  const user = await login(dto.email, dto.password);
  const token = await signToken({ sub: user.id, email: user.email, role: user.role });
  return Response.json(
    { code: 1, data: { accessToken: token }, msg: '登录成功' },
    { headers: { 'Set-Cookie': await authToken.serialize(token) } }
  );
}
