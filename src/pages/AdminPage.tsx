import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Copy,
  Download,
  FileText,
  FolderTree,
  Plus,
  Trash2,
  Users,
  BarChart2,
  UserCheck,
  FileImage,
  Presentation,
  HardDrive,
  Activity,
  FolderPlus,
  Folder,
  ChevronRight,
  FileSpreadsheet,
  FolderInput,
  FolderMinus,
} from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../utils/api';
import { formatSize, formatTime } from '../utils/format';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { ListSkeleton } from '../components/Skeleton';

type Tab = 'dashboard' | 'files' | 'users' | 'subjects';

interface DashboardData {
  online: number;
  users: {
    total: number;
    active: number;
    teachers: number;
    students: number;
  };
  subjects: {
    total: number;
    withFiles: number;
  };
  files: {
    total: number;
    published: number;
    private: number;
    totalSize: number;
    byType: { type: string; count: number }[];
  };
  recentFiles: {
    key: string;
    title: string;
    subject: string | null;
    uploader: string;
    visibility: string;
    uploadedAt: number;
    size: number | null;
  }[];
  recentUsers: {
    id: string;
    username: string;
    status: string;
    createdAt: number;
    roles: string[];
  }[];
}


interface AdminUser {
  id: string;
  username: string;
  status: string;
  roles: string[];
  subjects: string[];
}

interface AdminSubject {
  id: string;
  name: string;
  slug: string;
  file_count: number;
}

interface CreatedUser {
  username: string;
  password: string;
}

/** 管理员后台：左侧固定侧边栏（lg 以下折叠为顶部 Tabs）+ 右侧内容区 */
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const d = await apiGet<DashboardData>('/api/admin/dashboard');
      setDashboard(d);
    } catch {
      // 失败时静默，UI 会显示骨架屏
    }
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
  }, [tab, loadDashboard]);

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'dashboard', label: '数据看板', icon: BarChart2 },
    { key: 'files', label: '文件管理', icon: FileText },
    { key: 'users', label: '用户管理', icon: Users },
    { key: 'subjects', label: '科目管理', icon: FolderTree },
  ];

  return (
    <div className="max-w-[1200px] mx-auto px-0 md:px-6 py-0 md:py-8 flex flex-col lg:flex-row gap-6">
      {/* 侧边栏：< lg 折叠为顶部 Tabs */}
      <aside className="lg:w-[220px] shrink-0">
        <div className="lg:sticky lg:top-20">
          <div className="flex lg:flex-col gap-1 px-4 lg:px-0 py-2 lg:py-0 overflow-x-auto border-b border-line dark:border-gray-800 lg:border-b-0 lg:bg-white lg:dark:bg-gray-900 lg:border lg:border-line lg:dark:border-gray-800 lg:rounded-card lg:p-2">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2.5 h-10 px-3 rounded-btn text-[14px] whitespace-nowrap transition-all duration-150 ease-out cursor-pointer ${
                    tab === t.key
                      ? 'text-primary dark:text-indigo-400 bg-primary-soft dark:bg-indigo-950/50 font-medium'
                      : 'text-ink-secondary dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 px-4 lg:px-0 pb-8">
        {tab === 'dashboard' && <DashboardTab dashboard={dashboard} onRefresh={loadDashboard} />}
        {tab === 'files' && <FilesTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'subjects' && <SubjectsTab />}
      </div>
    </div>
  );
}

// StatCard 组件
function StatCard({ icon: Icon, label, value, subLabel, iconBg, iconColor }: {
  icon: typeof Users;
  label: string;
  value: number | string;
  subLabel?: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-secondary dark:text-gray-500">{label}</p>
          <p className="mt-1 text-[24px] font-semibold text-ink dark:text-gray-100 tabular-nums">{value}</p>
          {subLabel && <p className="mt-1 text-[12px] text-ink-muted dark:text-gray-500">{subLabel}</p>}
        </div>
        <span className={`shrink-0 w-12 h-12 rounded-card flex items-center justify-center ${iconBg} ${iconColor}`}>
          <Icon size={20} strokeWidth={1.8} />
        </span>
      </div>
    </div>
  );
}

// ---------- 数据看板 ----------
function DashboardTab({ dashboard, onRefresh }: { dashboard: DashboardData | null; onRefresh: () => void }) {
  // 每 30 秒自动刷新（在线人数等实时数据）
  useEffect(() => {
    const t = setInterval(onRefresh, 30000);
    return () => clearInterval(t);
  }, [onRefresh]);

  return (
    <div>
      {!dashboard ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5">
                <div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-6 w-1/3 rounded mb-2" />
                <div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-8 w-1/2 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5">
            <h3 className="text-h3 font-semibold text-ink dark:text-gray-100 mb-4">最近上传文件</h3>
            <ListSkeleton count={4} />
          </div>
          <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5">
            <h3 className="text-h3 font-semibold text-ink dark:text-gray-100 mb-4">最近注册用户</h3>
            <ListSkeleton count={4} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Activity}
              label="实时在线"
              value={dashboard.online}
              subLabel="5 分钟内活跃会话"
              iconBg="bg-emerald-50 dark:bg-emerald-950"
              iconColor="text-emerald-700 dark:text-emerald-400"
            />
            <StatCard
              icon={Users}
              label="总用户数"
              value={dashboard.users.total}
              subLabel={`活跃 ${dashboard.users.active} · 教师 ${dashboard.users.teachers} · 学生 ${dashboard.users.students}`}
              iconBg="bg-primary-soft dark:bg-indigo-950"
              iconColor="text-primary dark:text-indigo-400"
            />
            <StatCard
              icon={BookOpen}
              label="科目总数"
              value={dashboard.subjects.total}
              subLabel={`有文件 ${dashboard.subjects.withFiles} 个`}
              iconBg="bg-emerald-50 dark:bg-emerald-950"
              iconColor="text-emerald-700 dark:text-emerald-400"
            />
            <StatCard
              icon={FileText}
              label="文件总数"
              value={dashboard.files.total}
              subLabel={`已开放 ${dashboard.files.published} · 未开放 ${dashboard.files.private}`}
              iconBg="bg-blue-50 dark:bg-blue-950"
              iconColor="text-blue-700 dark:text-blue-400"
            />
            <StatCard
              icon={HardDrive}
              label="存储占用"
              value={formatSize(dashboard.files.totalSize)}
              iconBg="bg-amber-50 dark:bg-amber-950"
              iconColor="text-amber-700 dark:text-amber-400"
            />
          </div>

          {/* 文件类型分布 + 最近文件 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5">
              <h3 className="text-h3 font-semibold text-ink dark:text-gray-100 mb-4">文件类型分布</h3>
              {dashboard.files.byType.length > 0 ? (
                <div className="space-y-3">
                  {dashboard.files.byType.map((t) => (
                    <div key={t.type} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-btn flex items-center justify-center ${
                          t.type === 'markdown' ? 'bg-primary-soft text-primary' :
                          t.type === 'pptx' ? 'bg-orange-50 text-orange-700' :
                          t.type === 'docx' ? 'bg-blue-50 text-blue-700' :
                          t.type === 'image' ? 'bg-emerald-50 text-emerald-700' :
                          'bg-gray-100 text-gray-600'
                        } dark:${
                          t.type === 'markdown' ? 'bg-indigo-950 text-indigo-400' :
                          t.type === 'pptx' ? 'bg-orange-950 text-orange-400' :
                          t.type === 'docx' ? 'bg-blue-950 text-blue-400' :
                          t.type === 'image' ? 'bg-emerald-950 text-emerald-400' :
                          'bg-gray-800 text-gray-400'
                        }">
                          {t.type === 'markdown' && <FileText size={16} />}
                          {t.type === 'pptx' && <Presentation size={16} />}
                          {t.type === 'docx' && <FileText size={16} />}
                          {t.type === 'image' && <FileImage size={16} />}
                          {t.type === 'other' && <FileText size={16} />}
                        </span>
                        <span className="text-[14px] font-medium capitalize">{t.type}</span>
                      </div>
                      <span className="text-[14px] font-mono tabular-nums text-ink-secondary dark:text-gray-400">{t.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={FileText} title="暂无文件" />
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5">
              <h3 className="text-h3 font-semibold text-ink dark:text-gray-100 mb-4">最近上传文件</h3>
              {dashboard.recentFiles.length > 0 ? (
                <div className="space-y-3">
                  {dashboard.recentFiles.map((f) => (
                    <div key={f.key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-btn hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-9 h-9 rounded-btn flex items-center justify-center ${
                          f.title?.endsWith('.md') || f.title?.endsWith('.markdown') ? 'bg-primary-soft text-primary' :
                          f.title?.endsWith('.pptx') ? 'bg-orange-50 text-orange-700' :
                          f.title?.endsWith('.docx') ? 'bg-blue-50 text-blue-700' :
                          f.title?.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) ? 'bg-emerald-50 text-emerald-700' :
                          'bg-gray-100 text-gray-600'
                        } dark:${
                          f.title?.endsWith('.md') || f.title?.endsWith('.markdown') ? 'bg-indigo-950 text-indigo-400' :
                          f.title?.endsWith('.pptx') ? 'bg-orange-950 text-orange-400' :
                          f.title?.endsWith('.docx') ? 'bg-blue-950 text-blue-400' :
                          f.title?.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) ? 'bg-emerald-950 text-emerald-400' :
                          'bg-gray-800 text-gray-400'
                        }">
                          {f.title?.endsWith('.md') || f.title?.endsWith('.markdown') && <FileText size={16} />}
                          {f.title?.endsWith('.pptx') && <Presentation size={16} />}
                          {f.title?.endsWith('.docx') && <FileText size={16} />}
                          {f.title?.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) && <FileImage size={16} />}
                          {!f.title?.match(/\.(md|markdown|pptx|docx|png|jpg|jpeg|gif|webp|svg)$/i) && <FileText size={16} />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium text-ink dark:text-gray-100 truncate">{f.title}</p>
                          <p className="text-[12px] text-ink-secondary dark:text-gray-500 tabular-nums">{f.subject ?? '—'} · {formatSize(f.size)} · {formatTime(f.uploadedAt)}</p>
                        </div>
                      </div>
                      <Badge tone={f.visibility === 'published' ? 'published' : 'private'}>
                        {f.visibility === 'published' ? '已开放' : '未开放'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={FileText} title="暂无文件" />
              )}
            </div>
          </div>

          {/* 最近注册用户 */}
          <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5">
            <h3 className="text-h3 font-semibold text-ink dark:text-gray-100 mb-4">最近注册用户</h3>
            {dashboard.recentUsers.length > 0 ? (
              <div className="space-y-3">
                {dashboard.recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-btn hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-btn bg-primary-soft dark:bg-indigo-950 text-primary dark:text-indigo-400 flex items-center justify-center">
                        <UserCheck size={16} />
                      </span>
                      <div>
                        <p className="text-[14px] font-medium text-ink dark:text-gray-100">{u.username}</p>
                        <p className="text-[12px] text-ink-secondary dark:text-gray-500">{u.roles.join(' · ')} · {formatTime(u.createdAt)}</p>
                      </div>
                    </div>
                    <Badge tone={u.status === 'active' ? 'published' : 'private'}>
                      {u.status === 'active' ? '正常' : '已禁用'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Users} title="暂无用户" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 文件管理 ----------

interface AdminFile {
  key: string;
  title: string;
  type: string;
  dir: string | null;
  size: number | null;
  subject: string | null;
  uploader: string;
  visibility: string;
  canManage: boolean;
}

function FilesTab() {
  const { toast } = useToast();
  const [files, setFiles] = useState<AdminFile[] | null>(null);
  const [currentDir, setCurrentDir] = useState('');
  const [folders, setFolders] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dirPick, setDirPick] = useState<{ action: 'move' | 'copy' | 'moveFolder'; f: AdminFile } | null>(null);
  const [dirPickTarget, setDirPickTarget] = useState('');
  const [folderPick, setFolderPick] = useState<{ action: 'delete' | 'move'; path: string } | null>(null);
  const [folderPickTarget, setFolderPickTarget] = useState('');

  const load = useCallback(async () => {
    setFiles(null);
    try {
      const [d, f] = await Promise.all([
        apiGet<{ files: AdminFile[] }>('/api/manifest'),
        apiGet<{ folders: string[] }>('/api/folders'),
      ]);
      setFiles(d.files);
      setFolders(f.folders);
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 当前目录下的子文件夹
  const subFolders = folders
    .filter((p) => {
      if (currentDir === '') return !p.includes('/');
      return p.startsWith(currentDir + '/') && !p.slice(currentDir.length + 1).includes('/');
    })
    .map((p) => (currentDir === '' ? p : p.slice(currentDir.length + 1)));

  const dirFiles = (files ?? []).filter((f) => (f.dir ?? '') === currentDir);

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const path = currentDir ? `${currentDir}/${name}` : name;
    try {
      await apiPost('/api/folders', { subjectId: null, path });
      toast('文件夹已创建', 'success');
      setCreating(false);
      setNewFolderName('');
      load();
    } catch (err: any) {
      toast(err.message || '创建失败', 'error');
    }
  };

  const runMoveCopy = async () => {
    if (!dirPick) return;
    const body = { key: dirPick.f.key, targetDir: dirPickTarget.trim() };
    try {
      await apiPost(`/api/${dirPick.action}`, body);
      toast(dirPick.action === 'move' ? '已移动' : '已复制', 'success');
      setDirPick(null);
      load();
    } catch (err: any) {
      toast(err.message || '操作失败', 'error');
    }
  };

  const runFolderAction = async () => {
    if (!folderPick) return;
    try {
      if (folderPick.action === 'delete') {
        await apiDelete(`/api/folders?path=${encodeURIComponent(folderPick.path)}`);
        toast('文件夹已删除（其中文件已移到上级目录）', 'success');
      } else {
        await apiPost('/api/folders/move', { folder: folderPick.path, targetDir: folderPickTarget.trim() });
        toast('文件夹已移动', 'success');
      }
      setFolderPick(null);
      setCurrentDir((cur) => (folderPick.action === 'delete' || folderPick.action === 'move') && (cur === folderPick.path || cur.startsWith(folderPick.path + '/')) ? '' : cur);
      load();
    } catch (err: any) {
      toast(err.message || '操作失败', 'error');
    }
  };

  const remove = async (f: AdminFile) => {
    if (!confirm(`确定删除「${f.title}」？此操作不可恢复。`)) return;
    try {
      await apiDelete(`/api/delete?key=${encodeURIComponent(f.key)}`);
      toast('已删除', 'success');
      load();
    } catch (err: any) {
      toast(err.message || '删除失败', 'error');
    }
  };

  const toggle = async (f: AdminFile) => {
    const next = f.visibility === 'published' ? 'private' : 'published';
    try {
      await apiPatch('/api/file', { key: f.key, visibility: next });
      toast(next === 'published' ? '已开放' : '已取消开放', 'success');
      load();
    } catch (err: any) {
      toast(err.message || '操作失败', 'error');
    }
  };

  return (
    <div>
      <h1 className="hidden lg:block text-h2 font-semibold text-ink dark:text-gray-100 mb-6">文件管理</h1>
      {/* 工具行：面包屑 + 新建文件夹 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <nav className="flex items-center gap-1 text-[13px] flex-1 min-w-0">
          <button onClick={() => setCurrentDir('')} className="text-ink-secondary dark:text-gray-400 hover:text-primary transition-all duration-150 cursor-pointer">
            全部文件
          </button>
          {currentDir.split('/').filter(Boolean).map((seg, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-ink-muted dark:text-gray-600" />
              <button
                onClick={() => setCurrentDir(arr.slice(0, i + 1).join('/'))}
                className={i === arr.length - 1 ? 'text-ink dark:text-gray-200' : 'text-ink-secondary dark:text-gray-400 hover:text-primary'}
              >
                {seg}
              </button>
            </span>
          ))}
        </nav>
        {creating ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              placeholder="文件夹名称"
              className="h-9 px-3 rounded-btn border border-line dark:border-gray-700 bg-white dark:bg-gray-900 text-[13px] w-40"
            />
            <Button size="sm" onClick={createFolder}>确定</Button>
            <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>取消</Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => { setCreating(true); setNewFolderName(''); }}>
            <FolderPlus size={15} />
            新建文件夹
          </Button>
        )}
      </div>

      {!files ? (
        <ListSkeleton count={5} />
      ) : dirFiles.length === 0 && subFolders.length === 0 ? (
        <EmptyState icon={FileText} title="此文件夹为空" />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card overflow-hidden">
          {/* 子文件夹行 */}
          {subFolders.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 border-b border-line dark:border-gray-800">
              {subFolders.map((name) => {
                const fullPath = currentDir ? `${currentDir}/${name}` : name;
                return (
                  <div
                    key={name}
                    className="group flex items-center h-9 pl-3 pr-1 rounded-btn border border-line dark:border-gray-700 text-[13px] text-ink dark:text-gray-200 hover:border-primary dark:hover:border-indigo-500 transition-all duration-150"
                  >
                    <button onClick={() => setCurrentDir(fullPath)} className="flex items-center gap-1.5 cursor-pointer">
                      <Folder size={15} className="text-primary dark:text-indigo-400" />
                      {name}
                    </button>
                    <span className="hidden group-hover:flex items-center ml-1">
                      <button
                        title="移动"
                        onClick={() => { setFolderPick({ action: 'move', path: fullPath }); setFolderPickTarget(''); }}
                        className="h-7 w-7 flex items-center justify-center rounded text-ink-muted dark:text-gray-500 hover:text-primary dark:hover:text-indigo-400 transition-all duration-150 cursor-pointer"
                      >
                        <FolderInput size={13} />
                      </button>
                      <button
                        title="删除（文件移到上级）"
                        onClick={() => setFolderPick({ action: 'delete', path: fullPath })}
                        className="h-7 w-7 flex items-center justify-center rounded text-ink-muted dark:text-gray-500 hover:text-red-500 transition-all duration-150 cursor-pointer"
                      >
                        <FolderMinus size={13} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="hidden md:block">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-[12px] font-medium text-ink-secondary dark:text-gray-500">
                  <th className="text-left font-medium px-5 py-3">文件名</th>
                  <th className="text-left font-medium px-5 py-3">科目</th>
                  <th className="text-left font-medium px-5 py-3">上传者</th>
                  <th className="text-left font-medium px-5 py-3">状态</th>
                  <th className="text-right font-medium px-5 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {dirFiles.map((f) => (
                  <tr key={f.key} className="border-t border-line dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150 ease-out">
                    <td className="px-5 py-3 text-ink dark:text-gray-100 max-w-[240px] truncate">{f.title}</td>
                    <td className="px-5 py-3 text-ink-secondary dark:text-gray-400">{f.subject ?? '—'}</td>
                    <td className="px-5 py-3 text-ink-secondary dark:text-gray-400">{f.uploader}</td>
                    <td className="px-5 py-3">
                      <Badge tone={f.visibility === 'published' ? 'published' : 'private'}>
                        {f.visibility === 'published' ? '已开放' : '未开放'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => { setDirPick({ action: 'move', f }); setDirPickTarget(currentDir); }}>
                        移动
                      </Button>
                      <Button variant="ghost" size="sm" className="ml-1" onClick={() => { setDirPick({ action: 'copy', f }); setDirPickTarget(currentDir); }}>
                        复制
                      </Button>
                      <Button variant="ghost" size="sm" className="ml-1" onClick={() => toggle(f)}>
                        {f.visibility === 'published' ? '取消开放' : '开放'}
                      </Button>
                      <Button variant="danger" size="sm" className="ml-1" onClick={() => remove(f)}>
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden flex flex-col">
            {dirFiles.map((f) => (
              <div key={f.key} className="border-b border-line dark:border-gray-800 p-4 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-medium text-ink dark:text-gray-100 flex-1 min-w-0 truncate">{f.title}</p>
                  <Badge tone={f.visibility === 'published' ? 'published' : 'private'}>
                    {f.visibility === 'published' ? '已开放' : '未开放'}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-ink-secondary dark:text-gray-500">
                  {f.subject ?? '—'} · {f.uploader}
                </p>
                <div className="mt-3 flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setDirPick({ action: 'move', f }); setDirPickTarget(currentDir); }}>
                    移动
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setDirPick({ action: 'copy', f }); setDirPickTarget(currentDir); }}>
                    复制
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggle(f)}>
                    {f.visibility === 'published' ? '取消开放' : '开放'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(f)}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 移动/复制目标目录选择 */}
      <Modal open={!!dirPick} title={dirPick?.action === 'move' ? '移动文件' : '复制文件'} onClose={() => setDirPick(null)}>
        <p className="text-[13px] text-ink-secondary dark:text-gray-400 mb-3">
          目标文件：{dirPick?.f.title}
        </p>
        <label className="block text-[12px] text-ink-secondary dark:text-gray-400 mb-1.5">目标目录（留空为根目录）</label>
        <select
          value={subFolders.includes(dirPickTarget.split('/').pop() ?? '') || dirPickTarget === currentDir ? '' : dirPickTarget}
          onChange={(e) => setDirPickTarget(e.target.value)}
          className="w-full h-10 px-3 rounded-btn border border-line dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px] mb-2"
        >
          <option value="">（根目录）</option>
          {folders.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <input
          value={dirPickTarget}
          onChange={(e) => setDirPickTarget(e.target.value)}
          placeholder="或手动输入路径，如 第一章/课件"
          className="w-full h-10 px-3 rounded-btn border border-line dark:border-gray-700 bg-white dark:bg-gray-900 text-[13px]"
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDirPick(null)}>取消</Button>
          <Button onClick={runMoveCopy}>{dirPick?.action === 'move' ? '移动' : '复制'}</Button>
        </div>
      </Modal>

      {/* 文件夹删除/移动确认 */}
      <Modal open={!!folderPick} title={folderPick?.action === 'delete' ? '删除文件夹' : '移动文件夹'} onClose={() => setFolderPick(null)}>
        {folderPick?.action === 'delete' ? (
          <>
            <p className="text-[13px] text-ink-secondary dark:text-gray-400">
              确定删除文件夹「{folderPick.path}」？其中所有文件将移到上级目录（{folderPick.path.includes('/') ? folderPick.path.slice(0, folderPick.path.lastIndexOf('/')) || '根目录' : '根目录'}），不会丢失。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setFolderPick(null)}>取消</Button>
              <Button variant="danger" onClick={runFolderAction}>删除文件夹</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink-secondary dark:text-gray-400 mb-3">移动文件夹：{folderPick?.path}</p>
            <label className="block text-[12px] text-ink-secondary dark:text-gray-400 mb-1.5">目标目录（留空为根目录）</label>
            <select
              value={folderPickTarget}
              onChange={(e) => setFolderPickTarget(e.target.value)}
              className="w-full h-10 px-3 rounded-btn border border-line dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px] mb-2"
            >
              <option value="">（根目录）</option>
              {folders.filter((f) => f !== folderPick?.path && !f.startsWith((folderPick?.path ?? '') + '/')).map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <input
              value={folderPickTarget}
              onChange={(e) => setFolderPickTarget(e.target.value)}
              placeholder="或手动输入路径"
              className="w-full h-10 px-3 rounded-btn border border-line dark:border-gray-700 bg-white dark:bg-gray-900 text-[13px]"
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setFolderPick(null)}>取消</Button>
              <Button onClick={runFolderAction}>移动</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ---------- 用户管理 ----------

interface RoleItem {
  id: string;
  name: string;
}

function UsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [subjects, setSubjects] = useState<AdminSubject[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [created, setCreated] = useState<CreatedUser[]>([]);
  const [batchText, setBatchText] = useState('');
  const [batchRole, setBatchRole] = useState('role-student');
  const [batchSubjects, setBatchSubjects] = useState<string[]>([]);
  const [batchPassword, setBatchPassword] = useState('');
  const importPasswords = useRef<Map<string, string>>(new Map());
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importInfo, setImportInfo] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);

  const load = useCallback(async () => {
    setUsers(null);
    try {
      const [u, s] = await Promise.all([
        apiGet<{ users: AdminUser[] }>('/api/admin/users'),
        apiGet<{ subjects: AdminSubject[] }>('/api/admin/subjects'),
      ]);
      setUsers(u.users);
      setSubjects(s.subjects);
      setRoles([
        { id: 'role-admin', name: 'admin' },
        { id: 'role-teacher', name: 'teacher' },
        { id: 'role-student', name: 'student' },
      ]);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runBatch = async () => {
    // 每行支持 "用户名,密码"（密码可选，优先于统一初始密码）
    const lines = batchText.split(/[\n]+/).map((s) => s.trim()).filter(Boolean);
    const pairs = lines.map((line) => {
      const parts = line.split(/[,，\t]/).map((x) => x.trim());
      const username = parts[0];
      const pwd = parts[1] || importPasswords.current.get(username) || batchPassword || '';
      return { username, password: pwd };
    });
    if (pairs.length === 0) {
      toast('请输入至少一个用户名', 'warning');
      return;
    }
    setBatchLoading(true);
    try {
      const d = await apiPost<{ created: CreatedUser[]; failed: { username: string; reason: string }[] }>(
        '/api/admin/users/batch',
        {
          users: pairs.map((p) => ({
            username: p.username,
            password: p.password || undefined,
            roleIds: [batchRole],
            subjectIds: batchSubjects,
          })),
        }
      );
      setCreated(d.created);
      if (d.failed.length > 0) {
        toast(`${d.failed.length} 个创建失败：${d.failed.map((f) => f.username).join('、')}`, 'warning');
      }
      setBatchText('');
      importPasswords.current.clear();
      setImportInfo('');
      setBatchOpen(false);
      setShowPasswords(true);
      load();
    } catch (err: any) {
      toast(err.message || '批量创建失败', 'error');
    } finally {
      setBatchLoading(false);
    }
  };

  const [showPasswords, setShowPasswords] = useState(false);

  const copyAll = async () => {
    const text = created.map((c) => `${c.username}\t${c.password}`).join('\n');
    await navigator.clipboard.writeText(text);
    toast('已复制全部账号密码', 'success');
  };

  const downloadCsv = () => {
    const csv = 'username,password\n' + created.map((c) => `${c.username},${c.password}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'initial-passwords.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const setStatus = async (u: AdminUser) => {
    const next = u.status === 'active' ? 'disabled' : 'active';
    try {
      await apiPatch('/api/admin/user', { id: u.id, status: next });
      toast(next === 'active' ? '已启用' : '已禁用', 'success');
      load();
    } catch (err: any) {
      toast(err.message || '操作失败', 'error');
    }
  };

  const removeUser = async (u: AdminUser) => {
    if (!confirm(`确定删除用户「${u.username}」？`)) return;
    try {
      await apiDelete(`/api/admin/user?id=${encodeURIComponent(u.id)}`);
      toast('已删除', 'success');
      load();
    } catch (err: any) {
      toast(err.message || '删除失败', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="hidden lg:block text-h2 font-semibold text-ink dark:text-gray-100">用户管理</h1>
        <Button
          onClick={() => {
            setCreated([]);
            setShowPasswords(false);
            setBatchOpen(true);
          }}
        >
          <Plus size={15} />
          批量创建
        </Button>
      </div>

      {!users ? (
        <ListSkeleton count={5} />
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="暂无用户" />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-[12px] font-medium text-ink-secondary dark:text-gray-500">
                  <th className="text-left font-medium px-5 py-3">用户名</th>
                  <th className="text-left font-medium px-5 py-3">角色</th>
                  <th className="text-left font-medium px-5 py-3">科目</th>
                  <th className="text-left font-medium px-5 py-3">状态</th>
                  <th className="text-right font-medium px-5 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-line dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150 ease-out">
                    <td className="px-5 py-3 text-ink dark:text-gray-100">{u.username}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {u.roles.map((r) => (
                          <Badge key={r} tone="role">
                            {r === 'admin' ? '管理员' : r === 'teacher' ? '老师' : '学生'}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary dark:text-gray-400 max-w-[200px] truncate">
                      {u.subjects.join('、') || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={u.status === 'active' ? 'published' : 'private'}>
                        {u.status === 'active' ? '正常' : '已禁用'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setStatus(u)}>
                        {u.status === 'active' ? '禁用' : '启用'}
                      </Button>
                      <Button variant="danger" size="sm" className="ml-1" onClick={() => removeUser(u)}>
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden flex flex-col">
            {users.map((u) => (
              <div key={u.id} className="border-b border-line dark:border-gray-800 p-4 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-medium text-ink dark:text-gray-100">{u.username}</p>
                  <Badge tone={u.status === 'active' ? 'published' : 'private'}>
                    {u.status === 'active' ? '正常' : '已禁用'}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-ink-secondary dark:text-gray-500">
                  {u.roles.map((r) => (r === 'admin' ? '管理员' : r === 'teacher' ? '老师' : '学生')).join(' · ')} ·{' '}
                  {u.subjects.join('、') || '无科目'}
                </p>
                <div className="mt-3 flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setStatus(u)}>
                    {u.status === 'active' ? '禁用' : '启用'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => removeUser(u)}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 批量创建弹窗 */}
      <Modal open={batchOpen} title="批量创建用户" onClose={() => setBatchOpen(false)}>
        <div className="flex flex-col gap-4">
          <Input
            label="用户名（每行一个，或用逗号分隔）"
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder={'zhangsan\nlisi\nwangwu'}
          />
          <Select label="统一角色" value={batchRole} onChange={(e) => setBatchRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name === 'admin' ? '管理员' : r.name === 'teacher' ? '老师' : '学生'}
              </option>
            ))}
          </Select>
          <div>
            <label className="block text-[12px] text-ink-secondary dark:text-gray-400 mb-1.5">分配科目（可多选）</label>
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => {
                const on = batchSubjects.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setBatchSubjects((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                    }
                    className={`h-8 px-3 rounded-btn text-[13px] border transition-all duration-150 ease-out cursor-pointer ${
                      on
                        ? 'bg-primary-soft dark:bg-indigo-950/50 border-primary dark:border-indigo-500 text-primary dark:text-indigo-400'
                        : 'border-line dark:border-gray-700 text-ink-secondary dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
          <Input
            label="统一初始密码（可选，留空则每个用户随机生成）"
            value={batchPassword}
            onChange={(e) => setBatchPassword(e.target.value)}
            type="password"
            placeholder="至少 6 位"
          />
          <div>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const XLSX: any = await import('xlsx');
                  const buf = await file.arrayBuffer();
                  const wb = XLSX.read(buf, { type: 'array' });
                  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as string[][];
                  const names: string[] = [];
                  importPasswords.current.clear();
                  for (const row of rows) {
                    const username = String(row?.[0] ?? '').trim();
                    if (!username) continue;
                    names.push(username);
                    const pwd = String(row?.[1] ?? '').trim();
                    if (pwd) importPasswords.current.set(username, pwd);
                  }
                  if (names.length === 0) {
                    toast('表格中未找到用户名', 'warning');
                    return;
                  }
                  setBatchText(names.join('\n'));
                  setImportInfo(`已导入 ${names.length} 个用户${importPasswords.current.size > 0 ? `（含 ${importPasswords.current.size} 个自定义密码）` : ''}`);
                  toast(`已导入 ${names.length} 个用户名`, 'success');
                } catch (err: any) {
                  toast(err.message || '表格解析失败', 'error');
                }
                e.target.value = '';
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => importFileRef.current?.click()}
            >
              <FileSpreadsheet size={14} />
              导入用户表格（.xlsx/.csv，第一列用户名，第二列密码可选）
            </Button>
            {importInfo && <p className="mt-1.5 text-[12px] text-primary dark:text-indigo-400">{importInfo}</p>}
          </div>
          <p className="text-[12px] text-ink-muted dark:text-gray-500">
            密码规则：行内「用户名,密码」＞ 表格第二列 ＞ 统一初始密码 ＞ 随机生成（≥12 位）。密码仅在创建结果中显示一次。
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setBatchOpen(false)}>
            取消
          </Button>
          <Button loading={batchLoading} onClick={runBatch}>
            创建
          </Button>
        </div>
      </Modal>

      {/* 密码结果面板：不可关闭，确认保存后才能关闭 */}
      <Modal
        open={showPasswords && created.length > 0}
        title="初始密码（仅显示一次）"
        locked
        onClose={() => setShowPasswords(false)}
      >
        <p className="text-[13px] text-ink-secondary dark:text-gray-400 mb-4">
          请立即保存以下账号密码。关闭后无法再次查看，数据库中只保存哈希。
        </p>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-card p-4 max-h-[280px] overflow-y-auto">
          <table className="w-full text-[13px]">
            <tbody>
              {created.map((c) => (
                <tr key={c.username}>
                  <td className="py-1 pr-4 text-ink dark:text-gray-200">{c.username}</td>
                  <td className="py-1 font-mono text-ink-secondary dark:text-gray-400 break-all">{c.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={copyAll}>
              <Copy size={14} />
              复制全部
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadCsv}>
              <Download size={14} />
              下载 CSV
            </Button>
          </div>
          <Button onClick={() => setShowPasswords(false)}>我已保存</Button>
        </div>
      </Modal>
    </div>
  );
}

// ---------- 科目管理 ----------

function SubjectsTab() {
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<AdminSubject[] | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setSubjects(null);
    try {
      const d = await apiGet<{ subjects: AdminSubject[] }>('/api/admin/subjects');
      setSubjects(d.subjects);
    } catch {
      setSubjects([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) {
      toast('请输入科目名', 'warning');
      return;
    }
    setLoading(true);
    try {
      await apiPost('/api/admin/subjects', { name: name.trim() });
      setName('');
      toast('科目已创建', 'success');
      load();
    } catch (err: any) {
      toast(err.message || '创建失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (s: AdminSubject) => {
    if (!confirm(`确定删除科目「${s.name}」？`)) return;
    try {
      await apiDelete(`/api/admin/subjects?id=${encodeURIComponent(s.id)}`);
      toast('已删除', 'success');
      load();
    } catch (err: any) {
      if (err.status === 409) toast('该科目下仍有文件，无法删除', 'error');
      else toast(err.message || '删除失败', 'error');
    }
  };

  return (
    <div>
      <h1 className="hidden lg:block text-h2 font-semibold text-ink dark:text-gray-100 mb-6">科目管理</h1>

      <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5 mb-5 flex items-end gap-3">
        <div className="flex-1 max-w-[320px]">
          <Input label="新科目名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：物理" />
        </div>
        <Button loading={loading} onClick={create}>
          <Plus size={15} />
          创建科目
        </Button>
      </div>

      {!subjects ? (
        <ListSkeleton count={4} />
      ) : subjects.length === 0 ? (
        <EmptyState icon={BookOpen} title="暂无科目" />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card overflow-hidden">
          {subjects.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150 ease-out"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-btn bg-primary-soft dark:bg-indigo-950 text-primary dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <BookOpen size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-ink dark:text-gray-100">{s.name}</p>
                  <p className="text-[12px] text-ink-secondary dark:text-gray-500 tabular-nums">{s.file_count} 个文件</p>
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => remove(s)}>
                <Trash2 size={14} />
                删除
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
