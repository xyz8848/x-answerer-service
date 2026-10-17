import type { z } from 'zod';

/** 成功响应：与原 NestJS IApiResponse { code: 1, data, msg } 一致 */
export function ok<T>(data: T, msg = '成功') {
  return Response.json({ code: 1, data, msg });
}

/**
 * 抛出 HTTP 错误响应。
 * 响应体保持 { message } 字段 —— 前端 axios 错误处理读取 err.response.data.message。
 */
export function httpError(status: number, message: string): never {
  throw new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 解析并校验 JSON 请求体。
 * 替代 NestJS ValidationPipe（whitelist + forbidNonWhitelisted）：zod .strict() 拒绝未知字段。
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    httpError(400, '请求体必须是合法的 JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    httpError(400, first ? `${first.path.join('.') || 'body'}: ${first.message}` : '请求参数不合法');
  }
  return result.data;
}
