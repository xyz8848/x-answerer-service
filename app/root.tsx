import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from 'react-router';

import type { Route } from './+types/root';
import { AuthProvider } from '@/context/auth';
import './app.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>X Answerer Service</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let message = '出错了';
  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="text-center">
        <p className="text-lg font-semibold text-destructive">{message}</p>
        <a href="/dashboard" className="text-sm text-muted-foreground hover:underline mt-2 inline-block">
          返回首页
        </a>
      </div>
    </div>
  );
}
