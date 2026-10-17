import { z } from 'zod';
import type { Route } from './+types/api.auth.send-code';
import { sendEmailCode } from '@/lib/server/auth.service.server';
import { ok, parseBody } from '@/lib/server/http.server';
import { rateLimit } from '@/lib/server/rate-limit.server';

const schema = z
  .object({
    email: z.string().email(),
    type: z.enum(['register', 'login']),
  })
  .strict();

/** 发送邮箱验证码（1 次/分钟） */
export async function action({ request }: Route.ActionArgs) {
  rateLimit(request, 'send-code', 1, 60_000);
  const dto = await parseBody(request, schema);
  await sendEmailCode(dto.email, dto.type);
  return ok(null, '验证码已发送');
}
