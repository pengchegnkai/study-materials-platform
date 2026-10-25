import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { apiDelete, apiGet, apiUpload } from '../utils/api';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { Badge } from '../components/Badge';
import { Switch } from '../components/Switch';
import { Modal } from '../components/Modal';
import { UploadZone } from '../components/UploadZone';
import { EmptyState } from '../components/EmptyState';
import { ListSkeleton } from '../components/Skeleton';
import { formatSize, formatTime } from '../utils/format';
import type { ManifestFile } from '../components/FileCard';

interface SubjectItem {
  id: string;
  name: string;
  slug: string;
}

interface TeacherFile {
  key: string;
  title: string;
  size: number | null;
  visibility: string;
  uploadedAt: number;
  subject: string | null;
}

/** 老师工作台：科目筛选 + 拖拽上传 + 我的文件（发布开关/改标题/删除） */
export default function TeacherPage() {
  const { toast } = useToast();

  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [publishedOnly, setPublishedOnly] = useState('all');
  const [files, setFiles] = useState<TeacherFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<TeacherFile | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploadVisibility, setUploadVisibility] = useState('private');
  const [progress, setProgress] = useState<{ current: number; total: number; pct: number } | null>(null);

  const mySubjects = useMemo(() => subjects, [subjects]);

  const loadSubjects = useCallback(async () => {
    // mine=1：只返回自己被分配的科目，避免上传时出现「未分配该科目」
    const d = await apiGet<{ subjects: SubjectItem[] }>('/api/subjects?mine=1');
    setSubjects(d.subjects);
  }, []);

  const loadFiles = useCallback(async () => {
    setFiles(null);
    try {
      const d = await apiGet<{ files: ManifestFile[] }>('/api/manifest');
      setFiles(d.files.filter((f) => f.canManage));
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    loadSubjects();
    loadFiles();
  }, [loadSubjects, loadFiles]);

  const upload = async (fileList: File[], dir?: string) => {
    if (!uploadSubject) {
      toast('请先选择要上传到的科目', 'warning');
      return;
    }
    const subjectName = subjects.find((s) => s.id === uploadSubject)?.name ?? '';
    setUploading(true);
    let ok = 0;
    let fail = 0;
    let firstError = '';
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // 目录规则：手动上传 = 指定目录；文件夹上传 = 「科目名/相对路径」（不含所选根文件夹名本身）
      const rel = (file as any).webkitRelativePath as string | undefined;
      const relDir =
        rel && rel.includes('/') ? rel.split('/').slice(1, -1).join('/') : '';
      const subDir = dir ?? [subjectName, relDir].filter(Boolean).join('/');
      setProgress({ current: i + 1, total: fileList.length, pct: 0 });
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('subjectId', uploadSubject);
        form.append('visibility', uploadVisibility);
        form.append('path', subDir);
        const d = await apiUpload<{ key: string }>('/api/upload', form, (pct) =>
          setProgress({ current: i + 1, total: fileList.length, pct })
        );
        if (d?.key) ok++;
        else fail++;
      } catch (err: any) {
        fail++;
        firstError = firstError || err.message || '上传失败';
      }
    }
    toast(fail === 0 ? `已上传 ${ok} 个文件` : `成功 ${ok} 个，失败 ${fail} 个：${firstError}`, fail === 0 ? 'success' : 'error');
    setProgress(null);
    setUploading(false);
    loadFiles();
  };

  const toggleVisibility = async (f: TeacherFile, published: boolean) => {
    try {
      await fetch('/api/file', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: f.key, visibility: published ? 'published' : 'private' }),
      });
      setFiles((prev) => prev?.map((x) => (x.key === f.key ? { ...x, visibility: published ? 'published' : 'private' } : x)) ?? null);
      toast(published ? '已对学生开放' : '已取消开放', 'success');
    } catch {
      toast('操作失败', 'error');
    }
  };

  const saveTitle = async () => {
    if (!editing) return;
    try {
      await fetch('/api/file', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: editing.key, title: editTitle }),
      });
      setFiles((prev) => prev?.map((x) => (x.key === editing.key ? { ...x, title: editTitle } : x)) ?? null);
      setEditing(null);
      toast('标题已更新', 'success');
    } catch {
      toast('保存失败', 'error');
    }
  };

  const removeFile = async (f: TeacherFile) => {
    if (!confirm(`确定删除「${f.title}」？此操作不可恢复。`)) return;
    try {
      await apiDelete(`/api/delete?key=${encodeURIComponent(f.key)}`);
      setFiles((prev) => prev?.filter((x) => x.key !== f.key) ?? null);
      toast('已删除', 'success');
    } catch (err: any) {
      toast(err.message || '删除失败', 'error');
    }
  };

  const fileListName = (p: { current: number; total: number }) =>
    p.total > 1 ? `第 ${p.current} 个文件` : '文件';

  const visibleFiles = (files ?? []).filter((f) => {
    if (selectedSubject && f.subject !== mySubjects.find((s) => s.id === selectedSubject)?.name) return false;
    if (publishedOnly === 'published' && f.visibility !== 'published') return false;
    if (publishedOnly === 'private' && f.visibility !== 'private') return false;
    return true;
  });

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-8">
      <h1 className="text-h1 font-semibold text-ink dark:text-gray-100">老师工作台</h1>
      <p className="mt-1 mb-6 text-[14px] text-ink-secondary dark:text-gray-500">上传资料到你的科目，并控制是否对学生开放</p>

      {/* 上传区 */}
      <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Select label="上传到科目" value={uploadSubject} onChange={(e) => setUploadSubject(e.target.value)}>
            <option value="">选择科目…</option>
            {mySubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select label="可见性" value={uploadVisibility} onChange={(e) => setUploadVisibility(e.target.value)}>
            <option value="private">不开放（仅自己可见）</option>
            <option value="published">开放（学生可见）</option>
          </Select>
        </div>
        <UploadZone onFiles={upload} onFolder={(files) => upload(files)} disabled={uploading}>
          {progress && (
            <div className="w-full mt-4">
              <div className="flex items-center justify-between text-[12px] text-ink-secondary dark:text-gray-400 mb-1">
                <span>
                  上传中 {progress.current}/{progress.total} · {fileListName(progress)}
                </span>
                <span className="tabular-nums">{progress.pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full bg-primary dark:bg-indigo-500 transition-all duration-150 ease-out"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          )}
        </UploadZone>
      </div>

      {/* 我的文件 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <h2 className="text-h3 font-semibold text-ink dark:text-gray-100 flex-1">我的文件</h2>
        <Select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          className="!w-auto min-w-[140px]"
        >
          <option value="">全部科目</option>
          {mySubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={publishedOnly} onChange={(e) => setPublishedOnly(e.target.value)} className="!w-auto min-w-[120px]">
          <option value="all">全部状态</option>
          <option value="published">已开放</option>
          <option value="private">未开放</option>
        </Select>
      </div>

      {!files ? (
        <ListSkeleton count={4} />
      ) : visibleFiles.length === 0 ? (
        <EmptyState icon={FileText} title="还没有文件" description="通过上方上传区添加你的第一份资料" />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card overflow-hidden">
          {/* 桌面表格 / 移动卡片 */}
          <div className="hidden md:block">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-[12px] font-medium text-ink-secondary dark:text-gray-500">
                  <th className="text-left font-medium px-5 py-3">文件名</th>
                  <th className="text-left font-medium px-5 py-3">科目</th>
                  <th className="text-left font-medium px-5 py-3 tabular-nums">大小</th>
                  <th className="text-left font-medium px-5 py-3 tabular-nums">上传时间</th>
                  <th className="text-center font-medium px-5 py-3">开放</th>
                  <th className="text-right font-medium px-5 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleFiles.map((f) => (
                  <tr key={f.key} className="border-t border-line dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150 ease-out">
                    <td className="px-5 py-3 text-ink dark:text-gray-100 max-w-[260px] truncate">{f.title}</td>
                    <td className="px-5 py-3 text-ink-secondary dark:text-gray-400">{f.subject ?? '—'}</td>
                    <td className="px-5 py-3 text-ink-secondary dark:text-gray-400 tabular-nums">{formatSize(f.size)}</td>
                    <td className="px-5 py-3 text-ink-secondary dark:text-gray-400 tabular-nums">{formatTime(f.uploadedAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-center">
                        <Switch checked={f.visibility === 'published'} onChange={(v) => toggleVisibility(f, v)} />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(f);
                          setEditTitle(f.title);
                        }}
                      >
                        编辑
                      </Button>
                      <Button variant="danger" size="sm" className="ml-1" onClick={() => removeFile(f)}>
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden flex flex-col">
            {visibleFiles.map((f) => (
              <div key={f.key} className="border-b border-line dark:border-gray-800 p-4 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] font-medium text-ink dark:text-gray-100 flex-1 min-w-0 truncate">{f.title}</p>
                  <Badge tone={f.visibility === 'published' ? 'published' : 'private'}>
                    {f.visibility === 'published' ? '已开放' : '未开放'}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-ink-secondary dark:text-gray-500 tabular-nums">
                  {f.subject ?? '—'} · {formatSize(f.size)} · {formatTime(f.uploadedAt)}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <Switch checked={f.visibility === 'published'} onChange={(v) => toggleVisibility(f, v)} />
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(f);
                        setEditTitle(f.title);
                      }}
                    >
                      编辑
                    </Button>
                    <Button variant="danger" size="sm" className="ml-1" onClick={() => removeFile(f)}>
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 编辑标题 */}
      <Modal open={!!editing} title="编辑标题" onClose={() => setEditing(null)}>
        <Input label="文件标题" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(null)}>
            取消
          </Button>
          <Button onClick={saveTitle}>保存</Button>
        </div>
      </Modal>
    </div>
  );
}
