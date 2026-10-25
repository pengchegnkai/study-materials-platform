import { useRef, useState } from 'react';
import { Camera, KeyRound, LogOut, UserRound } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useToast } from '../components/Toast';
import { useSession } from '../components/Layout';
import { apiPatch, apiPost, apiUpload } from '../utils/api';

/** 个人中心：头像、昵称、修改密码 */
export default function ProfilePage() {
  const { session, refresh } = useSession();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [nickname, setNickname] = useState(session?.nickname ?? '');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  if (!session) {
    return <div className="py-24 text-center text-ink-secondary">正在加载…</div>;
  }

  const roleLabel = session.roles
    .map((r) => (r === 'admin' ? '管理员' : r === 'teacher' ? '老师' : '学生'))
    .join(' · ');

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('请选择图片文件', 'warning');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('图片不能超过 2MB', 'warning');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiUpload('/api/me/avatar', form);
      await refresh();
      toast('头像已更新', 'success');
    } catch (err: any) {
      toast(err.message || '上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  const saveNickname = async () => {
    try {
      await apiPatch('/api/me/profile', { nickname: nickname.trim() });
      await refresh();
      toast('昵称已保存', 'success');
    } catch (err: any) {
      toast(err.message || '保存失败', 'error');
    }
  };

  const changePassword = async () => {
    if (newPwd.length < 6) {
      toast('新密码至少 6 位', 'warning');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast('两次输入的新密码不一致', 'warning');
      return;
    }
    setPwdLoading(true);
    try {
      await apiPost('/api/change-password', { oldPassword: oldPwd, newPassword: newPwd });
      toast('密码已修改，其他设备已下线', 'success');
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err: any) {
      toast(err.message || '修改失败', 'error');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="max-w-[760px] mx-auto px-4 md:px-6 py-8">
      <h1 className="text-h2 font-semibold text-ink dark:text-gray-100 mb-6">个人中心</h1>

      {/* 个人信息卡 */}
      <section className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-6 mb-5 shadow-card">
        <div className="flex items-center gap-5">
          <div className="relative group">
            {session.avatar ? (
              <img
                src={`/api/avatar?u=${encodeURIComponent(session.username)}&v=${session.avatar}`}
                alt=""
                className="w-20 h-20 rounded-full object-cover ring-4 ring-primary-soft dark:ring-indigo-950"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[26px] font-semibold flex items-center justify-center ring-4 ring-primary-soft dark:ring-indigo-950">
                {(session.nickname || session.username).slice(0, 2).toUpperCase()}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full bg-black/45 text-white text-[11px] font-medium flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer"
            >
              <Camera size={14} />
              {uploading ? '上传中' : '换头像'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold text-ink dark:text-gray-100 truncate">
              {session.nickname || session.username}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-secondary dark:text-gray-400">
              账号 {session.username} · {roleLabel}
            </p>
            <p className="mt-1 text-[12px] text-ink-muted dark:text-gray-500">
              支持 PNG / JPG / WebP，不超过 2MB
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Input
              label="昵称（显示在页面右上角）"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={session.username}
            />
          </div>
          <Button variant="secondary" onClick={saveNickname}>
            <UserRound size={15} />
            保存昵称
          </Button>
        </div>
      </section>

      {/* 修改密码 */}
      <section className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-6 shadow-card">
        <h2 className="text-h3 font-semibold text-ink dark:text-gray-100 flex items-center gap-2 mb-4">
          <KeyRound size={16} className="text-primary dark:text-indigo-400" />
          修改密码
        </h2>
        <div className="flex flex-col gap-3 max-w-[380px]">
          <Input label="旧密码" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
          <Input label="新密码（至少 6 位）" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          <Input label="确认新密码" type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
          <div className="flex items-center justify-between pt-1">
            <p className="text-[12px] text-ink-muted dark:text-gray-500">修改后其他设备会下线</p>
            <Button loading={pwdLoading} onClick={changePassword}>
              确认修改
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-5 flex justify-end">
        <Button
          variant="ghost"
          onClick={async () => {
            await fetch('/api/logout', { method: 'POST', credentials: 'include' });
            await refresh();
            window.location.href = '/login';
          }}
        >
          <LogOut size={15} />
          退出登录
        </Button>
      </div>
    </div>
  );
}
