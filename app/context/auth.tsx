import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ICurrentUser, Permission } from '@/lib/types';
import api from '@/api';

interface AuthContextValue {
  user: ICurrentUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  setUser: (user: ICurrentUser) => void;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser = null,
}: {
  children: ReactNode;
  initialUser?: ICurrentUser | null;
}) {
  const [user, setUserState] = useState<ICurrentUser | null>(initialUser);

  // 登录态由 httpOnly Cookie 维护，刷新页面后通过 /auth/me 恢复用户信息
  useEffect(() => {
    if (user) return;
    api
      .get('/auth/me')
      .then(({ data }) => {
        if (data.code === 1) setUserState(data.data);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setUser = useCallback((newUser: ICurrentUser) => {
    setUserState(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Cookie 已失效也无妨
    }
    setUserState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'ADMIN' || user?.role === 'OWNER',
      isOwner: user?.role === 'OWNER',
      setUser,
      logout,
      hasPermission: (permission: Permission) =>
        user?.permissions.includes(permission) ?? false,
    }),
    [user, setUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
