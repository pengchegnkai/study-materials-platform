import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../utils/api';
import { ToastProvider } from './Toast';
import { Button } from './Button';

export interface SessionInfo {
  id: string;
  username: string;
  roles: string[];
  avatar?: string | null;
  nickname?: string | null;
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

  const [pwdOpen, setPwdOpen] = useState(false);
  const logout = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    await refresh();
    navigate('/login');
  };

  return (
    <>
    <header className="sticky top-0 z-40 h-14 bg-white/80 dark:bg-[#0B0F14]/80 backdrop-blur-xl border-b border-line/80 dark:border-gray-800/80">
      <div className="max-w-[1200px] mx-auto px-6 md:px-4 h-full flex items-center justify-between">
        <div className="flex items-center gap-8 min-w-0">
          <a href="/" className="flex items-center gap-2 shrink-0 cursor-pointer">
            <span className="flex items-center justify-center w-7 h-7 rounded-[9px] bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-[0_2px_8px_rgba(79,70,229,0.35)]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </span>
            <span className="text-[15px] font-bold tracking-tight text-ink dark:text-gray-100">班级资料共享</span>
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
                {session.avatar ? (
                  <img
                    src={`/api/avatar?u=${encodeURIComponent(session.username)}&v=${session.avatar}`}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-primary-soft dark:ring-indigo-900"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[12px] font-semibold flex items-center justify-center">
                    {(session.nickname || session.username).slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="hidden md:block text-[13px] font-medium text-ink dark:text-gray-200">{session.nickname || session.username}</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-40 bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card shadow-card-hover py-1 animate-fade-in">
                    <div className="px-3 py-2 text-[12px] text-ink-muted dark:text-gray-500">
                      {session.roles.map((r) => (r === 'admin' ? '管理员' : r === 'teacher' ? '老师' : '学生')).join(' · ')}
                    </div>
                    <a
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full text-left px-3 py-2.5 text-[13px] text-ink dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-150 ease-out cursor-pointer"
                    >
                      个人中心
                    </a>
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
      {pwdOpen && <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />}
    </>
  );
}

import { Link, useLocation } from 'react-router-dom';

function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={`relative h-8 my-auto flex items-center px-3.5 rounded-full text-[13.5px] font-medium transition-all duration-150 ease-out ${
        active
          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-300'
          : 'text-ink-secondary dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70 hover:text-ink dark:hover:text-gray-200'
      }`}
    >
      {label}
    </Link>
  );
}


function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError('');
    if (newPwd.length < 6) { setError('新密码至少 6 位'); return; }
    if (newPwd !== confirm) { setError('两次输入的新密码不一致'); return; }
    setLoading(true);
    try {
      const resp = await fetch('/api/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) { setError(d.error || '修改失败'); return; }
      setDone(true);
    } catch (e: any) {
      setError(e.message || '修改失败');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={done ? onClose : undefined}>
      <div
        className="w-full max-w-[380px] bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card shadow-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h3 font-semibold text-ink dark:text-gray-100">修改密码</h2>
        {done ? (
          <div className="mt-4">
            <p className="text-[13px] text-ink-secondary dark:text-gray-400">
              密码已修改，其他设备的登录状态已失效。请使用新密码重新登录。
            </p>
            <div className="mt-5 flex justify-end">
              <Button
                onClick={async () => {
                  onClose();
                  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                  window.location.href = '/login';
                }}
              >
                去重新登录
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <input
              type="password"
              placeholder="旧密码"
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              className="h-10 px-3 rounded-btn border border-line dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px]"
            />
            <input
              type="password"
              placeholder="新密码（至少 6 位）"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              className="h-10 px-3 rounded-btn border border-line dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px]"
            />
            <input
              type="password"
              placeholder="确认新密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-10 px-3 rounded-btn border border-line dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px]"
            />
            {error && <p className="text-[12px] text-red-500">{error}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button loading={loading} onClick={submit}>确认修改</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
