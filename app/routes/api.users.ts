import { z } from 'zod';
import type { Route } from './+types/api.users';
import { Role } from '@/lib/types';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { ok, parseBody } from '@/lib/server/http.server';
import { createUser, getUsers } from '@/lib/server/user.service.server';

/** 获取用户列表（ADMIN / OWNER） */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.ADMIN, Role.OWNER);

  const url = new URL(request.url);
  const page = +(url.searchParams.get('page') || '1');
  const pageSize = +(url.searchParams.get('pageSize') || '20');

  return ok(await getUsers(page, pageSize));
}

const createSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum([Role.USER, Role.ADMIN]).default(Role.USER),
  })
  .strict();

/** 创建用户（OWNER，补齐原 Users.tsx 调用但后端缺失的端点） */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.OWNER);

  const dto = await parseBody(request, createSchema);
  const created = await createUser(dto);
  return ok(created, '用户已创建');
}
