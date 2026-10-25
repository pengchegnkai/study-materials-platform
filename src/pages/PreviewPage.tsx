import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '../components/Badge';
import { useToast } from '../components/Toast';
import { apiGet } from '../utils/api';
import { kindFromType, renderPreview } from '../utils/preview';

/** 预览页：顶部工具条 + 白底圆角预览容器占满剩余高度可滚动 */
export default function PreviewPage() {
  const [params] = useSearchParams();
  const key = params.get('key') ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<{ title: string; type: string } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    if (!key) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const manifest = await apiGet<{ files: { key: string; title: string; type: string }[] }>('/api/manifest');
      const file = manifest.files.find((f) => f.key === key);
      if (!file) {
        setStatus('error');
        return;
      }
      setMeta({ title: file.title, type: file.type });

      const resp = await fetch(`/api/file?key=${encodeURIComponent(key)}`, { credentials: 'include' });
      if (!resp.ok) throw new Error('加载失败');
      const buffer = await resp.arrayBuffer();

      const container = containerRef.current;
      if (!container) return;
      await renderPreview(kindFromType(file.type), buffer, container, manifest.files, file.key);
      setStatus('ready');
    } catch {
      setStatus('error');
      toast('预览加载失败', 'error');
    }
  }, [key, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="max-w-[1200px] w-full mx-auto px-4 md:px-6 py-4 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="h-10 w-10 flex items-center justify-center rounded-btn text-ink-secondary dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150 ease-out cursor-pointer"
          aria-label="返回"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 min-w-0 truncate text-[15px] font-medium text-ink dark:text-gray-100">
          {meta?.title ?? '加载中…'}
        </h1>
        {meta && <Badge tone="role">{meta.type.toUpperCase()}</Badge>}
      </div>

      <div className="max-w-[1200px] w-full mx-auto px-4 md:px-6 pb-6 flex-1 min-h-0">
        <div className="h-full bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card overflow-y-auto">
          {status === 'loading' && (
            <div className="p-8 flex flex-col gap-3">
              <div className="bg-gray-200 dark:bg-gray-800 h-5 w-1/3 rounded animate-pulse" />
              <div className="bg-gray-200 dark:bg-gray-800 h-4 w-2/3 rounded animate-pulse" />
              <div className="bg-gray-200 dark:bg-gray-800 h-4 w-1/2 rounded animate-pulse" />
              <div className="bg-gray-200 dark:bg-gray-800 h-4 w-3/4 rounded animate-pulse" />
            </div>
          )}
          {status === 'error' && (
            <div className="p-12 text-center text-[14px] text-ink-secondary dark:text-gray-500">
              无法加载预览，请确认有权限或稍后重试。
            </div>
          )}
          <div ref={containerRef} className={status === 'ready' ? '' : 'hidden'} />
        </div>
      </div>
    </div>
  );
}
