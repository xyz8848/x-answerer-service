import { z } from 'zod';
import type { Route } from './+types/api.keys';
import { requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';
import { createApiKey, listApiKeys } from '@/lib/server/apikey.service.server';

const schema = z
  .object({
    name: z.string().max(50).optional(),
  })
  .strict();

/** 当前用户的 API Key 列表 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return ok(await listApiKeys(Number(user.id)));
}

/** 创建 API Key */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  if (request.method !== 'POST') httpError(405, 'Method Not Allowed');

  const dto = await parseBody(request, schema);
  return ok(await createApiKey(Number(user.id), dto.name ?? ''), 'API Key 已创建');
}
