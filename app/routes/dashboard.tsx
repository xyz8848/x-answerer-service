import { redirect } from 'react-router';
import type { Route } from './+types/dashboard';
import { getUserOrNull } from '@/lib/server/auth.server';
import { AuthProvider } from '@/context/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';

/** 布局级鉴权：未登录重定向 /login */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrNull(request);
  if (!user) throw redirect('/login');
  return { user };
}

export default function DashboardRoute({ loaderData }: Route.ComponentProps) {
  // 将服务端已获取的用户注入 AuthProvider：SSR 首屏即持有登录态与权限，
  // 避免客户端 /auth/me 回来前侧边栏导航项与用户信息闪烁
  return (
    <AuthProvider initialUser={loaderData.user}>
      <DashboardLayout />
    </AuthProvider>
  );
}
