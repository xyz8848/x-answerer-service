import { redirect } from 'react-router';
import type { Route } from './+types/dashboard';
import { getUserOrNull } from '@/lib/server/auth.server';
import DashboardLayout from '@/components/layout/DashboardLayout';

/** 布局级鉴权：未登录重定向 /login */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrNull(request);
  if (!user) throw redirect('/login');
  return { user };
}

export default function DashboardRoute() {
  return <DashboardLayout />;
}
