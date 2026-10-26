import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../utils/api';
import { SubjectCard, type SubjectItem } from '../components/SubjectCard';
import { CardSkeletonGrid } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { BookOpen, FileCheck2, Library, Sparkles } from 'lucide-react';

/** 首页：渐变 Hero 横幅（含统计条）+ 科目卡片网格（桌面 4 列 / 平板 3 列 / 移动 1 列） */
export default function HomePage() {
  const [subjects, setSubjects] = useState<SubjectItem[] | null>(null);

  useEffect(() => {
    apiGet<{ subjects: SubjectItem[] }>('/api/subjects')
      .then((d) => setSubjects(d.subjects))
      .catch(() => setSubjects([]));
  }, []);

  const stats = useMemo(() => {
    const list = subjects ?? [];
    return {
      subjectCount: list.length,
      fileCount: list.reduce((n, s) => n + (s.published_count ?? 0), 0),
    };
  }, [subjects]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-8">
      {/* Hero 渐变横幅 */}
      <section className="relative overflow-hidden rounded-card mb-8 animate-pop-in bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 dark:from-indigo-800 dark:via-indigo-700 dark:to-violet-900 shadow-[0_12px_40px_rgba(79,70,229,0.35)]">
        {/* 装饰光斑 */}
        <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 w-64 h-64 rounded-full bg-violet-300/20 blur-3xl" />

        <div className="relative px-6 py-9 md:px-10 md:py-12">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-[12px] font-medium text-white/95 ring-1 ring-white/25 mb-4">
            <Sparkles size={13} />
            班级共享 · 随时查阅
          </div>
          <h1 className="text-[28px] md:text-[36px] leading-tight font-bold tracking-tight text-white">
            学习资料平台
          </h1>
          <p className="mt-2.5 max-w-[560px] text-[14px] md:text-[15px] leading-relaxed text-white/85">
            按科目浏览老师开放的学习资料，支持 Word / PPT / Excel / PDF / Markdown 在线预览
          </p>

          {/* 统计条 */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-4 py-1.5 text-[13px] font-medium text-white ring-1 ring-white/25">
              <BookOpen size={15} />
              <b className="tabular-nums text-[15px]">{stats.subjectCount}</b> 个科目
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-4 py-1.5 text-[13px] font-medium text-white ring-1 ring-white/25">
              <FileCheck2 size={15} />
              <b className="tabular-nums text-[15px]">{stats.fileCount}</b> 份已开放资料
            </span>
            <span className="hidden sm:inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-4 py-1.5 text-[13px] font-medium text-white ring-1 ring-white/25">
              全天候在线访问
            </span>
          </div>
        </div>
      </section>

      {!subjects ? (
        <CardSkeletonGrid count={8} />
      ) : subjects.length === 0 ? (
        <EmptyState icon={Library} title="暂无科目" description="管理员尚未创建科目" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {subjects.map((s, i) => (
            <div key={s.id} className="animate-pop-in" style={{ animationDelay: `${Math.min(i, 8) * 35}ms`, animationFillMode: 'both' }}>
              <SubjectCard subject={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
