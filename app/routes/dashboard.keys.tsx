import type { Route } from './+types/dashboard.keys';
import ApiKeys from '@/pages/ApiKeys';

/** API 密钥：所有登录用户可用（自行生成并管理搜题令牌） */
export default function DashboardKeys(_: Route.ComponentProps) {
  return <ApiKeys />;
}
