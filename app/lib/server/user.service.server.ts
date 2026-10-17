import bcrypt from 'bcryptjs';
import type { Role } from '@/lib/types';
import { prisma } from './db.server';
import { httpError } from './http.server';
import { getRolePermissions } from './permission.server';

export async function getUsers(page: number, pageSize: number) {
  const [items, total, rolePermissions] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count(),
    getRolePermissions(),
  ]);

  return {
    items: items.map((u) => ({
      ...u,
      permissions: rolePermissions[u.role as Role] || [],
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getUser(id: number) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) httpError(400, '用户不存在');

  const rolePermissions = await getRolePermissions();
  return {
    ...user,
    permissions: rolePermissions[user.role as Role] || [],
  };
}

export async function updateRole(id: number, role: Role) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) httpError(400, '用户不存在');

  await prisma.user.update({
    where: { id },
    data: { role: role as any },
  });
}

export async function toggleStatus(id: number, isActive: boolean) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) httpError(400, '用户不存在');
  if (user.role === 'OWNER') httpError(400, '不能禁用拥有者账号');

  await prisma.user.update({
    where: { id },
    data: { isActive },
  });
}

export async function updateEmail(id: number, email: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) httpError(400, '用户不存在');
  if (user.role === 'OWNER') httpError(400, '不能修改拥有者邮箱');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) httpError(400, '该邮箱已被使用');

  await prisma.user.update({
    where: { id },
    data: { email },
  });
}

export async function updatePassword(id: number, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) httpError(400, '用户不存在');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });
}

export async function deleteUser(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) httpError(400, '用户不存在');

  await prisma.user.delete({ where: { id } });
}

/** 创建用户（OWNER，新增端点：原 Users.tsx 调用 POST /api/users 后端缺失） */
export async function createUser(dto: { email: string; password: string; role: Role }) {
  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) httpError(400, '该邮箱已注册');

  const passwordHash = await bcrypt.hash(dto.password, 12);
  const user = await prisma.user.create({
    data: {
      email: dto.email,
      passwordHash,
      role: dto.role,
    },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const rolePermissions = await getRolePermissions();
  return { ...user, permissions: rolePermissions[user.role as Role] || [] };
}
