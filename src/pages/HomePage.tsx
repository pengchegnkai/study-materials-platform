import { useEffect, useState } from 'react';
import { apiGet } from '../utils/api';
import { SubjectCard, type SubjectItem } from '../components/SubjectCard';
import { CardSkeletonGrid } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Library, Sparkles } from 'lucide-react';

/** 首页：标题行 + 科目卡片网格（桌面 3 列 / 平板 2 列 / 移动 1 列） */
export default function HomePage() {
  const [subjects, setSubjects] = useState<SubjectItem[] | null>(null);

  useEffect(() => {
    apiGet<{ subjects: SubjectItem[] }>('/api/subjects')
      .then((d) => setSubjects(d.subjects))
      .catch(() => setSubjects([]));
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-8 relative">
      {/* Hero */}
      <div className="mb-8 animate-pop-in">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 dark:bg-gray-900/70 backdrop-blur border border-line dark:border-gray-800 px-3 py-1 text-[12px] font-medium text-indigo-600 dark:text-indigo-300 mb-3 shadow-card">
          <Sparkles size={13} />
          班级共享 · 随时查阅
        </div>
        <h1 className="text-[30px] leading-tight font-bold tracking-tight text-ink dark:text-gray-100">
          学习资料
        </h1>
        <p className="mt-2 text-[14px] text-ink-secondary dark:text-gray-400">
          按科目浏览老师开放的学习资料，支持 Word / PPT / Excel / PDF / Markdown 在线预览
        </p>
      </div>

      {!subjects ? (
        <CardSkeletonGrid count={6} />
      ) : subjects.length === 0 ? (
        <EmptyState icon={Library} title="暂无科目" description="管理员尚未创建科目" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
