import { z } from 'zod';
import type { Route } from './+types/api.auth.passkey.login.begin';
import { passkeyLoginBegin } from '@/lib/server/auth.service.server';
import { ok, parseBody } from '@/lib/server/http.server';
import { rateLimit } from '@/lib/server/rate-limit.server';

const schema = z.object({ email: z.string().email() }).strict();

/** Passkey 登录 - 开始（5 次/分钟，现状平移：桩实现） */
export async function action({ request }: Route.ActionArgs) {
  rateLimit(request, 'passkey-login', 5, 60_000);
  const dto = await parseBody(request, schema);
  const options = await passkeyLoginBegin(dto.email);
  return ok(options);
}
