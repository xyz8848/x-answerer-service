/**
 * 数据库初始化脚本
 * 运行方式: npx ts-node prisma/seed.ts
 *
 * 用处：
 * 1. 创建第一个 OWNER 管理员账号
 * 2. 初始化系统配置
 */
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 从项目根目录加载 .env（保证从任意 cwd 运行都能取到 DATABASE_URL）
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as crypto from 'node:crypto';
import { ROLE_PERMISSIONS } from '../app/lib/types';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 开始初始化数据库...');

  // ===========================================
  // 0. 初始化标记：已初始化则整体跳过（容器每次启动都会执行本脚本）
  // ===========================================
  const initialized = await prisma.systemConfig.findUnique({ where: { key: 'INITIALIZED' } });
  if (initialized) {
    console.log('ℹ️  数据库已初始化（INITIALIZED 标记存在），跳过');
    return;
  }

  // ===========================================
  // 1. 创建第一个 OWNER（首次部署引导账号，后续可在用户管理中修改）
  //    按角色判断而非固定邮箱：即使 OWNER 邮箱已被修改，也不会重复创建引导账号
  // ===========================================
  const ownerEmail = 'admin@example.com';
  const ownerPassword = 'ChangeMe123!';

  const existingOwner = await prisma.user.findFirst({
    where: { role: Role.OWNER },
  });

  if (existingOwner) {
    console.log(`ℹ️  OWNER 账号已存在（${existingOwner.email}），跳过创建`);
  } else {
    const passwordHash = await bcrypt.hash(ownerPassword, 12);
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        passwordHash,
        role: Role.OWNER,
      },
    });
    console.log(`✅ OWNER 账号已创建:`);
    console.log(`   邮箱: ${ownerEmail}`);
    console.log(`   密码: ${ownerPassword}`);
    console.log(`   角色: ${owner.role}`);
    console.log(`⚠️  请立即登录并修改密码！`);
  }

  // ===========================================
  // 2. 初始化系统配置（其余配置在系统设置页维护）
  // ===========================================
  const configs = [
    { key: 'ALLOW_REGISTRATION', value: 'true' },
    { key: 'SITE_NAME', value: 'X Answerer Service' },
    { key: 'JWT_EXPIRES_IN', value: '7d' },
  ];

  for (const cfg of configs) {
    // 仅在缺失时创建，不覆盖系统设置页已保存的自定义值（容器每次启动都会执行 seed）
    const exists = await prisma.systemConfig.findUnique({ where: { key: cfg.key } });
    if (exists) continue;
    await prisma.systemConfig.create({
      data: { id: cfg.key, key: cfg.key, value: cfg.value },
    });
  }

  // JWT 密钥：仅首次生成（已存在则保留，避免使已签发的登录态失效）
  const jwtSecretRow = await prisma.systemConfig.findUnique({ where: { key: 'JWT_SECRET' } });
  if (!jwtSecretRow?.value) {
    await prisma.systemConfig.create({
      data: { id: 'JWT_SECRET', key: 'JWT_SECRET', value: crypto.randomBytes(48).toString('hex') },
    });
    console.log('✅ JWT 密钥已生成');
  }

  // ===========================================
  // 3. 初始化角色权限组（USER / ADMIN，OWNER 恒为全部权限）
  //    仅在数据库缺失时初始化，不覆盖系统设置页已保存的自定义权限
  // ===========================================
  for (const role of [Role.USER, Role.ADMIN]) {
    const key = `ROLE_PERMISSIONS_${role}`;
    const exists = await prisma.systemConfig.findUnique({ where: { key } });
    if (exists) continue;
    await prisma.systemConfig.create({
      data: { id: key, key, value: JSON.stringify(ROLE_PERMISSIONS[role]) },
    });
    console.log(`✅ 角色权限组 ${role} 已初始化`);
  }

  console.log('✅ 系统配置已初始化');
  console.log('🎉 数据库初始化完成！');

  // 最后写入初始化标记（后续运行将整体跳过）
  await prisma.systemConfig.create({
    data: { id: 'INITIALIZED', key: 'INITIALIZED', value: new Date().toISOString() },
  });
}

main()
  .catch((e) => {
    console.error('❌ 初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
