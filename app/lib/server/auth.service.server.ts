import bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { createTransport, type Transporter } from 'nodemailer';
import { Role } from '@/lib/types';
import { prisma } from './db.server';
import { httpError } from './http.server';

/** SMTP 配置存于 SystemConfig（数据库，可在系统设置页修改），每次发送时读取 */
async function getMailer(): Promise<{ transporter: Transporter; from: string }> {
  const [host, port, secure, user, pass, from] = await Promise.all([
    getSystemConfig('SMTP_HOST', 'localhost'),
    getSystemConfig('SMTP_PORT', '587'),
    getSystemConfig('SMTP_SECURE', 'false'),
    getSystemConfig('SMTP_USER', ''),
    getSystemConfig('SMTP_PASS', ''),
    getSystemConfig('EMAIL_FROM', 'noreply@example.com'),
  ]);
  const transporter = createTransport({
    host,
    port: parseInt(port, 10) || 587,
    secure: secure === 'true',
    auth: user ? { user, pass } : undefined,
  });
  return { transporter, from };
}

/** 发送邮箱验证码（现状平移：验证码仅发送，不存储不校验） */
export async function sendEmailCode(email: string, type: 'register' | 'login') {
  // 检查注册是否开放
  if (type === 'register') {
    const allowRegistration = await getSystemConfig('ALLOW_REGISTRATION', 'true');
    if (allowRegistration !== 'true') {
      httpError(400, '当前未开放注册');
    }
  }

  // 生成 6 位验证码
  const code = crypto.randomInt(100000, 999999).toString();

  // 发送邮件
  const { transporter, from } = await getMailer();
  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: type === 'register' ? '注册验证码' : '登录验证码',
      text: `您的验证码是：${code}，有效期 5 分钟。`,
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
          <h2 style="color: #111;">X Answerer Service</h2>
          <p>您的验证码是：</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111; text-align: center; padding: 20px; background: #f5f5f5; border-radius: 8px;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">有效期 5 分钟，请勿泄露给他人。</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('邮件发送失败', error);
    httpError(400, '验证码发送失败，请稍后重试');
  }
}

/** 邮箱 + 密码注册 */
export async function register(dto: { email: string; password: string; code: string }) {
  const existing = await prisma.user.findUnique({
    where: { email: dto.email },
  });
  if (existing) {
    httpError(400, '该邮箱已注册');
  }

  const passwordHash = await bcrypt.hash(dto.password, 12);

  await prisma.user.create({
    data: {
      email: dto.email,
      passwordHash,
      role: Role.USER,
    },
  });
}

/** 邮箱 + 密码登录，成功返回用户信息（由路由签发 JWT 并写入 cookie） */
export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    httpError(401, '邮箱或密码错误');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    httpError(401, '邮箱或密码错误');
  }

  if (!user.isActive) {
    httpError(401, '账号已被禁用');
  }

  // id 转字符串写入 JWT sub（数据库为自增数字）
  return { id: String(user.id), email: user.email, role: user.role as Role };
}

/** Passkey 注册 - 开始（现状平移：桩实现，challenge 不持久化） */
export async function passkeyRegisterBegin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) httpError(400, '用户不存在');

  return {
    challenge: crypto.randomBytes(32).toString('base64url'),
    rp: {
      name: await getSystemConfig('RP_NAME', 'X Answerer Service'),
      id: await getSystemConfig('RP_ID', 'localhost'),
    },
    user: {
      id: userId,
      name: user.email,
      displayName: user.email,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    timeout: 60000,
    attestation: 'none',
  };
}

/** Passkey 注册 - 完成（现状平移：桩实现，不验签） */
export async function passkeyRegisterFinish(userId: string, body: any) {
  await prisma.passkey.create({
    data: {
      userId: Number(userId),
      credentialId: body.id,
      publicKey: Buffer.from(body.response.publicKey, 'base64'),
      counter: 0,
      deviceName: body.deviceName,
    },
  });
}

/** Passkey 登录 - 开始（现状平移：桩实现） */
export async function passkeyLoginBegin(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { passkeys: true },
  });
  if (!user || user.passkeys.length === 0) {
    httpError(400, '该用户未注册 Passkey');
  }

  return {
    challenge: crypto.randomBytes(32).toString('base64url'),
    rpId: await getSystemConfig('RP_ID', 'localhost'),
    allowCredentials: user.passkeys.map((pk) => ({
      id: pk.credentialId,
      type: 'public-key',
      transports: ['internal', 'hybrid'],
    })),
    timeout: 60000,
    userVerification: 'preferred',
  };
}

/** Passkey 登录 - 完成（现状平移：桩实现，不验签），成功返回用户信息 */
export async function passkeyLoginFinish(body: any) {
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: body.id },
    include: { user: true },
  });
  if (!passkey) httpError(401, 'Passkey 验证失败');

  return { id: String(passkey.user.id), email: passkey.user.email, role: passkey.user.role as Role };
}

/** 读取系统配置（system_configs 表） */
export async function getSystemConfig(key: string, defaultValue: string): Promise<string> {
  const config = await prisma.systemConfig.findUnique({
    where: { key },
  });
  return config?.value ?? defaultValue;
}
