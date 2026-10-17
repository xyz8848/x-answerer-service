import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import {
  BookOpen,
  FileText,
  KeyRound,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Permission } from '@/lib/types';

const navItems: { to: string; label: string; icon: typeof BookOpen; end: boolean; permission?: Permission }[] = [
  { to: '/dashboard', label: '题库配置', icon: BookOpen, end: true },
  { to: '/dashboard/keys', label: 'API 密钥', icon: KeyRound, end: false },
  { to: '/dashboard/questions', label: '题目管理', icon: FileText, end: false, permission: Permission.QUESTION_VIEW },
  { to: '/dashboard/users', label: '用户管理', icon: Users, end: false, permission: Permission.USER_VIEW },
  { to: '/dashboard/settings', label: '系统设置', icon: Settings, end: false, permission: Permission.SYSTEM_CONFIG },
];

const COLLAPSE_KEY = 'sidebar_collapsed';

export default function DashboardLayout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  // 侧边栏收起（只显示图标），状态持久化到 localStorage（SSR 环境无 localStorage，跳过读取）
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem(COLLAPSE_KEY);
    if (saved !== null) return saved === '1';
    // 无手动记录时按窗口宽度决定（窄屏默认收起）
    return window.matchMedia('(max-width: 1023px)').matches;
  });

  // 窗口宽度跨越 1024px 阈值时自动收起/展开
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = (e: MediaQueryListEvent) => {
      setCollapsed(e.matches);
      localStorage.setItem(COLLAPSE_KEY, e.matches ? '1' : '0');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem(COLLAPSE_KEY, prev ? '0' : '1');
      }
      return !prev;
    });
  }

  // 无对应权限的导航项直接隐藏（题目管理/用户管理/系统设置仅管理角色可见）
  const visibleItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));

  async function handleLogout() {
    // 服务端清除 httpOnly Cookie 后再跳转
    await logout();
    navigate('/login');
  }

  return (
    <div className="h-screen overflow-hidden flex bg-background">
      {/* 侧边栏（固定视口高度：Logo / 导航 / 用户信息始终可见；可收起为图标栏） */}
      <aside
        className={cn(
          'shrink-0 border-r bg-sidebar flex flex-col transition-[width] duration-200',
          collapsed ? 'w-14' : 'w-64',
        )}
      >
        {/* Logo */}
        <div className={cn('h-16 shrink-0 flex items-center border-b', collapsed ? 'justify-center px-2' : 'px-4')}>
          {collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="展开侧边栏"
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <BookOpen className="size-5" />
            </button>
          ) : (
            <>
              <h1 className="text-lg font-bold tracking-tight flex-1 min-w-0 truncate">题库管理</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                title="收起侧边栏"
                className="shrink-0 size-8 text-muted-foreground hover:text-foreground"
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </>
          )}
        </div>

        {/* 导航 */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* 用户信息 */}
        <div className={cn('border-t', collapsed ? 'p-2 flex justify-center' : 'p-4')}>
          {collapsed ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title="退出登录"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4" />
            </Button>
          ) : (
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground truncate">
                  {user?.email ?? ''}
                </p>
                <p className="text-xs text-muted-foreground/70">{user?.role ?? ''}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="退出登录"
                className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="size-5" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* 主内容区（独立滚动，不影响侧边栏） */}
      <main className="flex-1 min-w-0 h-screen overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
