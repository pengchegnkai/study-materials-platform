import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../utils/api';
import { ToastProvider } from './Toast';

export interface SessionInfo {
  id: string;
  username: string;
  roles: string[];
}

interface SessionContextValue {
  session: SessionInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  refresh: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function hasRole(session: SessionInfo | null, role: string): boolean {
  return !!session && session.roles.includes(role);
}

/** 全局布局：会话加载 + Toast 提供者 */
export function Layout({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await apiGet<{ user: SessionInfo }>('/api/session');
      setSession(data.user);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading, refresh }}>
      <ToastProvider>
        <div className="min-h-screen flex flex-col bg-surface dark:bg-[#0B0F14]">
          <AppHeader />
          <main className="flex-1">{children}</main>
        </div>
      </ToastProvider>
    </SessionContext.Provider>
  );
}

/** AppHeader：56px sticky，Logo+导航左侧，用户菜单右侧，当前路由主色 + 2px 指示条 */
function AppHeader() {
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = hasRole(session, 'admin');
  const isTeacher = hasRole(session, 'teacher');

  const navItems: { to: string; label: string; show: boolean }[] = [
    { to: '/', label: '首页', show: true },
    { to: '/teacher', label: '老师工作台', show: isTeacher || isAdmin },
    { to: '/admin', label: '管理后台', show: isAdmin },
  ];

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    await refresh();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 h-14 bg-white dark:bg-[#111827] border-b border-line dark:border-gray-800">
      <div className="max-w-[1200px] mx-auto px-6 md:px-4 h-full flex items-center justify-between">
        <div className="flex items-center gap-8 min-w-0">
          <a href="/" className="flex items-center gap-2 shrink-0 cursor-pointer">
            <span className="flex items-center justify-center w-6 h-6 rounded-btn bg-primary text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold text-ink dark:text-gray-100">学习资料</span>
          </a>
          <nav className="hidden sm:flex items-center gap-1 self-stretch">
            {navItems
              .filter((n) => n.show)
              .map((n) => (
                <NavLink key={n.to} to={n.to} label={n.label} />
              ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {session ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="h-10 flex items-center gap-2 px-1 rounded-btn cursor-pointer transition-all duration-150 ease-out hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="w-7 h-7 rounded-full bg-primary-soft dark:bg-indigo-950 text-primary dark:text-indigo-400 text-[12px] font-medium flex items-center justify-center">
                  {session.username.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden md:block text-[13px] text-ink dark:text-gray-200">{session.username}</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-40 bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card shadow-card-hover py-1 animate-fade-in">
                    <div className="px-3 py-2 text-[12px] text-ink-muted dark:text-gray-500">
                      {session.roles.map((r) => (r === 'admin' ? '管理员' : r === 'teacher' ? '老师' : '学生')).join(' · ')}
                    </div>
                    <button
                      onClick={logout}
                      className="w-full text-left px-3 py-2.5 text-[13px] text-ink dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-150 ease-out cursor-pointer"
                    >
                      退出登录
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <a
              href="/login"
              className="h-9 px-4 inline-flex items-center rounded-btn bg-primary text-white text-[14px] font-medium hover:bg-primary-hover transition-all duration-150 ease-out"
            >
              登录
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

import { Link, useLocation } from 'react-router-dom';

function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={`relative h-full flex items-center px-3 text-[14px] transition-all duration-150 ease-out ${
        active
          ? 'text-primary dark:text-indigo-400 font-medium'
          : 'text-ink-secondary dark:text-gray-400 hover:text-ink dark:hover:text-gray-200'
      }`}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary dark:bg-indigo-400 rounded-full" />
      )}
    </Link>
  );
}
