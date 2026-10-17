import type { Route } from './+types/api.auth.logout';
import { authToken } from '@/lib/server/auth.server';

/** 退出登录：清除 httpOnly Cookie */
export async function action({ request }: Route.ActionArgs) {
  void request;
  return Response.json(
    { code: 1, data: null, msg: '已退出登录' },
    {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': await authToken.serialize(null, { expires: new Date(0) }),
      },
    }
  );
}
