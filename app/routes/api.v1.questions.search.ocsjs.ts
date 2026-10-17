import type { Route } from './+types/api.v1.questions.search.ocsjs';
import { searchOcsjs } from '@/lib/server/question.service.server';
import { corsHeaders } from '@/lib/server/cors.server';
import { verifyApiKey } from '@/lib/server/apikey.service.server';

/**
 * OCSJS 格式查题接口（需 API Key：body.token / query ?token= / Header X-API-Key）
 * 仅接受 OCSJS 请求字段（title / options('\n' 分隔) / type 字符串），
 * 返回 OCSJS 约定响应：{ code: 1|0, msg, data: { question, answer, times } }。
 */
export async function action({ request }: Route.ActionArgs) {
  // fetch 类配置跨域 POST 时浏览器会先发 OPTIONS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const body = await request.json().catch(() => ({}));
  if (!(await verifyApiKey(request, body))) {
    return Response.json(
      { code: 0, msg: '无效的 API Key，请在题库服务中创建并配置 token', data: null },
      { status: 401, headers: corsHeaders }
    );
  }
  const result = await searchOcsjs(body);
  return Response.json(result, { headers: corsHeaders });
}

/**
 * OCSJS 保存题库后用 HEAD 请求探测连接（要求 2xx–3xx 才判定成功），
 * 必须让 HEAD/GET 返回 200，否则显示“连接失败（HTTP400）”。
 */
export async function loader(_: Route.LoaderArgs) {
  return Response.json({ code: 0, msg: 'ok' }, { headers: corsHeaders });
}
