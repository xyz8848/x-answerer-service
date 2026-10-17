import { z } from 'zod';
import type { Route } from './+types/api.permissions.config.$key';
import { Role } from '@/lib/types';
import { prisma } from '@/lib/server/db.server';
import { requireRole, requireUser } from '@/lib/server/auth.server';
import { httpError, ok, parseBody } from '@/lib/server/http.server';

/** 获取系统配置（ADMIN / OWNER） */
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.ADMIN, Role.OWNER);

  const config = await prisma.systemConfig.findUnique({ where: { key: params.key } });
  return ok(config ? { key: config.key, value: config.value } : null);
}

const schema = z.object({ value: z.string() }).strict();

/** 更新系统配置（OWNER） */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  requireRole(user, Role.OWNER);
  if (request.method !== 'PUT') httpError(405, 'Method Not Allowed');

  const dto = await parseBody(request, schema);
  await prisma.systemConfig.upsert({
    where: { key: params.key },
    create: { key: params.key, value: dto.value },
    update: { value: dto.value },
  });
  return ok(null, '配置已更新');
}
