import { Link } from 'react-router-dom';
import { Download, FileImage, FileText, Presentation, FileType2 } from 'lucide-react';
import { Badge } from './Badge';
import { formatSize, formatTime, TYPE_LABELS } from '../utils/format';

export interface ManifestFile {
  key: string;
  title: string;
  type: string;
  size: number | null;
  subject: string | null;
  subjectSlug?: string | null;
  uploader: string;
  visibility: string;
  uploadedAt: number;
  canManage: boolean;
}

/** 类型图标：每种文件类型一个专属彩色块，直观好认 */
function TypeIcon({ type }: { type: string }) {
  const map: Record<string, { icon: typeof FileText; cls: string }> = {
    markdown: { icon: FileText, cls: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400' },
    pptx: { icon: Presentation, cls: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400' },
    docx: { icon: FileType2, cls: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400' },
    excel: { icon: FileType2, cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' },
    pdf: { icon: FileType2, cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400' },
    image: { icon: FileImage, cls: 'bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400' },
  };
  const item = map[type] ?? { icon: FileText, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  const Icon = item.icon;
  return (
    <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${item.cls}`}>
      <Icon size={18} strokeWidth={1.8} />
    </span>
  );
}

export function FileCard({ file }: { file: ManifestFile }) {
  return (
    <Link
      to={`/preview?key=${encodeURIComponent(file.key)}`}
      className="group block bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 ease-out cursor-pointer ring-1 ring-transparent hover:ring-indigo-200/60 dark:hover:ring-indigo-900"
    >
      <div className="flex items-start gap-3">
        <TypeIcon type={file.type} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-ink dark:text-gray-100 truncate">{file.title}</p>
          <p className="mt-1 text-[12px] text-ink-secondary dark:text-gray-500 tabular-nums truncate">
            {file.uploader} · {formatSize(file.size)} · {formatTime(file.uploadedAt)}
          </p>
        </div>
        <Badge tone={file.visibility === 'published' ? 'published' : 'private'}>
          {file.visibility === 'published' ? '已开放' : '未开放'}
        </Badge>
      </div>

      {/* 底部：类型标签 + 悬浮操作（预览 / 下载） */}
      <div className="mt-3.5 pt-3 border-t border-line/60 dark:border-gray-800 flex items-center justify-between">
        <p className="text-[12px] text-ink-muted dark:text-gray-600">{TYPE_LABELS[file.type] ?? file.type}</p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <span
            className="h-7 px-2.5 inline-flex items-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300 text-[11.5px] font-medium"
            title="点击卡片在线预览"
          >
            预览
          </span>
          <a
            href={`/api/file?key=${encodeURIComponent(file.key)}&download=1`}
            onClick={(e) => e.stopPropagation()}
            title="下载"
            className="h-7 w-7 inline-flex items-center justify-center rounded-full text-ink-muted dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-primary dark:hover:text-indigo-400 transition-colors duration-150"
          >
            <Download size={14} />
          </a>
        </div>
      </div>
    </Link>
  );
}
