import { Link } from 'react-router-dom';
import { ChevronRight, Library } from 'lucide-react';

export interface SubjectItem {
  id: string;
  name: string;
  slug: string;
  published_count: number;
}

/** 科目卡片：科目名 + 已开放文件数 + 右侧箭头，整卡跳转 */
export function SubjectCard({ subject }: { subject: SubjectItem }) {
  return (
    <Link
      to={`/subject/${subject.slug}`}
      className="flex items-center justify-between bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5 shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-150 ease-out cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0 w-10 h-10 rounded-btn bg-primary-soft dark:bg-indigo-950 text-primary dark:text-indigo-400 flex items-center justify-center">
          <Library size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink dark:text-gray-100">{subject.name}</p>
          <p className="mt-0.5 text-[12px] text-ink-secondary dark:text-gray-500 tabular-nums">
            {subject.published_count} 个已开放文件
          </p>
        </div>
      </div>
      <ChevronRight size={18} className="text-ink-muted dark:text-gray-600 shrink-0" />
    </Link>
  );
}
