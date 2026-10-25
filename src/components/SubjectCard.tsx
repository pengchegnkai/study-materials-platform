import { Link } from 'react-router-dom';
import { ArrowUpRight, FolderOpen } from 'lucide-react';

export interface SubjectItem {
  id: string;
  name: string;
  slug: string;
  published_count: number;
}

/** 科目配色轮换：不同科目有各自的强调色，界面更活泼 */
const PALETTE = [
  { chip: 'from-indigo-500 to-violet-500', soft: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300', ring: 'ring-indigo-200/70 dark:ring-indigo-900' },
  { chip: 'from-sky-500 to-cyan-500', soft: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300', ring: 'ring-sky-200/70 dark:ring-sky-900' },
  { chip: 'from-emerald-500 to-teal-500', soft: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300', ring: 'ring-emerald-200/70 dark:ring-emerald-900' },
  { chip: 'from-amber-500 to-orange-500', soft: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300', ring: 'ring-amber-200/70 dark:ring-amber-900' },
  { chip: 'from-rose-500 to-pink-500', soft: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300', ring: 'ring-rose-200/70 dark:ring-rose-900' },
  { chip: 'from-violet-500 to-fuchsia-500', soft: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300', ring: 'ring-violet-200/70 dark:ring-violet-900' },
];

function paletteFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** 科目卡片：彩色图标块 + 文件数 + 悬浮上的箭头 */
export function SubjectCard({ subject }: { subject: SubjectItem }) {
  const p = paletteFor(subject.name);
  return (
    <Link
      to={`/subject/${subject.slug}`}
      className="group relative overflow-hidden bg-white dark:bg-gray-900 border border-line dark:border-gray-800 rounded-card p-5 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 ease-out cursor-pointer ring-1 ring-transparent hover:ring-indigo-200/60 dark:hover:ring-indigo-900"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <span className={`shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${p.chip} text-white flex items-center justify-center shadow-[0_4px_12px_rgba(79,70,229,0.25)]`}>
          <FolderOpen size={19} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink dark:text-gray-100 truncate">{subject.name}</p>
          <p className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ${p.soft} ${p.ring} tabular-nums`}>
            {subject.published_count} 个已开放文件
          </p>
        </div>
        <ArrowUpRight
          size={17}
          className="shrink-0 text-ink-muted dark:text-gray-600 transition-all duration-200 group-hover:text-primary dark:group-hover:text-indigo-400 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}
