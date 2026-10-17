import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  // ---------- 页面路由 ----------
  index('routes/_index.tsx'),
  route('login', 'routes/login.tsx'),
  route('dashboard', 'routes/dashboard.tsx', [
    index('routes/dashboard._index.tsx'),
    route('keys', 'routes/dashboard.keys.tsx'),
    route('questions', 'routes/dashboard.questions.tsx'),
    route('users', 'routes/dashboard.users.tsx'),
    route('settings', 'routes/dashboard.settings.tsx'),
  ]),

  // ---------- 认证 ----------
  route('api/auth/send-code', 'routes/api.auth.send-code.ts'),
  route('api/auth/register', 'routes/api.auth.register.ts'),
  route('api/auth/login', 'routes/api.auth.login.ts'),
  route('api/auth/logout', 'routes/api.auth.logout.ts'),
  route('api/auth/me', 'routes/api.auth.me.ts'),
  route('api/auth/passkey/register/begin', 'routes/api.auth.passkey.register.begin.ts'),
  route('api/auth/passkey/register/finish', 'routes/api.auth.passkey.register.finish.ts'),
  route('api/auth/passkey/login/begin', 'routes/api.auth.passkey.login.begin.ts'),
  route('api/auth/passkey/login/finish', 'routes/api.auth.passkey.login.finish.ts'),

  // ---------- API Key（搜题令牌，登录用户自管） ----------
  route('api/keys', 'routes/api.keys.ts'),
  route('api/keys/:id', 'routes/api.keys.$id.ts'),

  // ---------- 查题（需 API Key，按格式拆分） ----------
  route('api/v1/questions/search/ocsjs', 'routes/api.v1.questions.search.ocsjs.ts'),
  route('api/v1/questions/search/tiku-adapter', 'routes/api.v1.questions.search.tiku-adapter.ts'),

  // ---------- 题目管理 ----------
  route('api/search/pending', 'routes/api.search.pending.ts'),
  route('api/search/stats', 'routes/api.search.stats.ts'),
  route('api/search', 'routes/api.search.ts'),
  route('api/search/:id/answer', 'routes/api.search.$id.answer.ts'),
  route('api/search/:id/verify', 'routes/api.search.$id.verify.ts'),
  route('api/search/:id/reject', 'routes/api.search.$id.reject.ts'),
  route('api/search/:id/restore', 'routes/api.search.$id.restore.ts'),
  route('api/search/batch', 'routes/api.search.batch.ts'),
  route('api/search/batch-answer', 'routes/api.search.batch-answer.ts'),

  // ---------- 用户管理 ----------
  route('api/users', 'routes/api.users.ts'),
  route('api/users/:id', 'routes/api.users.$id.ts'),
  route('api/users/:id/role', 'routes/api.users.$id.role.ts'),
  route('api/users/:id/status', 'routes/api.users.$id.status.ts'),
  route('api/users/:id/email', 'routes/api.users.$id.email.ts'),
  route('api/users/:id/password', 'routes/api.users.$id.password.ts'),

  // ---------- 权限/系统配置 ----------
  route('api/permissions/nodes', 'routes/api.permissions.nodes.ts'),
  route('api/permissions/roles', 'routes/api.permissions.roles.ts'),
  route('api/permissions/roles/:role', 'routes/api.permissions.roles.$role.ts'),
  route('api/permissions/config/:key', 'routes/api.permissions.config.$key.ts'),

  // ---------- AI 搜题 ----------
  route('api/ai/models', 'routes/api.ai.models.ts'),
  route('api/ai/providers/rename', 'routes/api.ai.providers.rename.ts'),
] satisfies RouteConfig;
