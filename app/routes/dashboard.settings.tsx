import { redirect } from 'react-router';
import type { Route } from './+types/dashboard.settings';
import { getUserOrNull } from '@/lib/server/auth.server';
import { Permission } from '@/lib/types';
import Settings from '@/pages/Settings';

/** 系统设置：需 system:config 权限，否则回到题库配置页 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrNull(request);
  if (!user) throw redirect('/login');
  if (!user.permissions.includes(Permission.SYSTEM_CONFIG)) {
    throw redirect('/dashboard');
  }
  return null;
}

export default function DashboardSettings(_: Route.ComponentProps) {
  return <Settings />;
}
