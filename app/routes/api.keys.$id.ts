import type { Route } from './+types/api.keys.$id';
import { requireUser } from '@/lib/server/auth.server';
import { httpError, ok } from '@/lib/server/http.server';
import { deleteApiKey } from '@/lib/server/apikey.service.server';

/** 删除 API Key（仅自己的） */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  if (request.method !== 'DELETE') httpError(405, 'Method Not Allowed');

  await deleteApiKey(Number(user.id), params.id);
  return ok(null, 'API Key 已删除');
}
