/** 公开题库接口的 CORS 头（网课页面与题库服务不同源，浏览器 fetch/预检需要） */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
