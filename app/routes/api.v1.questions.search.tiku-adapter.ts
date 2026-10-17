import type { Route } from './+types/api.v1.questions.search.tiku-adapter';
import { searchTikuAdapter } from '@/lib/server/question.service.server';
import { corsHeaders } from '@/lib/server/cors.server';
import { verifyApiKey } from '@/lib/server/apikey.service.server';

/**
 * TikuAdapter 格式查题接口（需 API Key：query ?token= / body.token / Header X-API-Key）
 * 仅接受 TikuAdapter 请求字段（question / options 数组 / type 数值 / plat），
 * 返回 TikuAdapter 约定响应：{ code, msg, question, options, type, plat, answer.* }。
 */
export async function action({ request }: Route.ActionArgs) {
  // fetch 类配置跨域 POST 时浏览器会先发 OPTIONS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const body = await request.json().catch(() => ({}));
  if (!(await verifyApiKey(request, body))) {
    return Response.json(
      { code: -1, msg: '无效的 API Key，请在题库服务中创建并配置 token' },
      { status: 401, headers: corsHeaders }
    );
  }
  const result = await searchTikuAdapter(body);
  return Response.json(result, { headers: corsHeaders });
}
