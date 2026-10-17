import { httpError } from './http.server';

/**
 * 简单 per-IP 内存滑动窗口限流（替代 @nestjs/throttler）。
 * 注意：单进程内存态，重启清零；多实例部署需改用 Redis。
 */
const buckets = new Map<string, number[]>();

function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'local';
}

export function rateLimit(request: Request, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const id = `${key}:${getClientIp(request)}`;
  const hits = (buckets.get(id) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    httpError(429, '请求过于频繁，请稍后再试');
  }
  hits.push(now);
  buckets.set(id, hits);

  // 简单防泄漏：桶数量过多时清理过期项
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
}
