import { redirect } from 'react-router';
import type { Route } from './+types/dashboard.users';
import { getUserOrNull } from '@/lib/server/auth.server';
import { Permission } from '@/lib/types';
import Users from '@/pages/Users';

/** 用户管理：需 user:view 权限，否则回到题库配置页 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrNull(request);
  if (!user) throw redirect('/login');
  if (!user.permissions.includes(Permission.USER_VIEW)) {
    throw redirect('/dashboard');
  }
  return null;
}

export default function DashboardUsers(_: Route.ComponentProps) {
  return <Users />;
}
