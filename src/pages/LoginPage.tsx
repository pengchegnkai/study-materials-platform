import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FolderOpen, GraduationCap, Users } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { apiPost } from '../utils/api';

/** 登录页：桌面左右分栏（左产品区 + 右 380px 卡片），移动端仅卡片 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiPost<{ ok: boolean; roles: string[] }>('/api/login', { username, password });
      if (data.roles.includes('admin')) navigate('/admin', { replace: true });
      else if (data.roles.includes('teacher')) navigate('/teacher', { replace: true });
      else navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-surface dark:bg-[#0B0F14]">
      {/* 左侧产品区（桌面） */}
      <div className="hidden lg:flex flex-col justify-center w-[45%] bg-primary-soft dark:bg-indigo-950/30 px-16">
        <div className="flex items-center gap-2.5 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-[0_4px_14px_rgba(79,70,229,0.35)]">
            <BookOpen size={17} />
          </span>
          <span className="text-[18px] font-bold tracking-tight text-ink dark:text-gray-100">班级资料共享</span>
        </div>
        <p className="text-[15px] text-ink-secondary dark:text-gray-400 max-w-[360px] leading-relaxed">
          按科目整理的学习资料库，Word / PPT / Excel / PDF 在线预览，权限清晰。
        </p>
        <ul className="mt-8 flex flex-col gap-4">
          <li className="flex items-center gap-3 text-[14px] text-ink dark:text-gray-200">
            <FolderOpen size={18} className="text-primary dark:text-indigo-400" />
            Markdown / PPT / Word / 图片在线预览
          </li>
          <li className="flex items-center gap-3 text-[14px] text-ink dark:text-gray-200">
            <Users size={18} className="text-primary dark:text-indigo-400" />
            老师上传管理，学生按权限查看
          </li>
          <li className="flex items-center gap-3 text-[14px] text-ink dark:text-gray-200">
            <GraduationCap size={18} className="text-primary dark:text-indigo-400" />
            文件按科目与老师归类，随取随用
          </li>
        </ul>
      </div>

      {/* 右侧登录卡片 */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-[0_4px_14px_rgba(79,70,229,0.35)]">
            <BookOpen size={17} />
          </span>
          <span className="text-[18px] font-bold tracking-tight text-ink dark:text-gray-100">班级资料共享</span>
        </div>

        <div className="w-full max-w-[380px] bg-white/90 dark:bg-gray-900/90 backdrop-blur rounded-card shadow-card-hover ring-1 ring-black/[0.03] dark:ring-white/[0.04] p-8 animate-pop-in">
          <h1 className="text-h2 font-semibold text-ink dark:text-gray-100">登录</h1>
          <p className="mt-1 mb-6 text-[13px] text-ink-secondary dark:text-gray-500">使用管理员、老师或学生账号登录</p>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <Input
              label="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
            <Input
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              error={error}
            />
            <Button type="submit" loading={loading} className="mt-2">
              登录
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
