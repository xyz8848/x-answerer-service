import { z } from 'zod';
import type { Route } from './+types/api.auth.register';
import { register } from '@/lib/server/auth.service.server';
import { ok, parseBody } from '@/lib/server/http.server';

const schema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
    code: z.string(),
  })
  .strict();

/** 邮箱 + 密码注册 */
export async function action({ request }: Route.ActionArgs) {
  const dto = await parseBody(request, schema);
  await register(dto);
  return ok(null, '注册成功');
}
