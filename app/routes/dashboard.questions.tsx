import { redirect } from 'react-router';
import type { Route } from './+types/dashboard.questions';
import { getUserOrNull } from '@/lib/server/auth.server';
import { Permission } from '@/lib/types';
import Questions from '@/pages/Questions';

/** 题目管理：需 question:view 权限，否则回到题库配置页 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrNull(request);
  if (!user) throw redirect('/login');
  if (!user.permissions.includes(Permission.QUESTION_VIEW)) {
    throw redirect('/dashboard');
  }
  return null;
}

export default function DashboardQuestions(_: Route.ComponentProps) {
  return <Questions />;
}
