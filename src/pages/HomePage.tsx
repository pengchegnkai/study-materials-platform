import { useEffect, useState } from 'react';
import { apiGet } from '../utils/api';
import { SubjectCard, type SubjectItem } from '../components/SubjectCard';
import { CardSkeletonGrid } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Library } from 'lucide-react';

/** 首页：标题行 + 科目卡片网格（桌面 3 列 / 平板 2 列 / 移动 1 列） */
export default function HomePage() {
  const [subjects, setSubjects] = useState<SubjectItem[] | null>(null);

  useEffect(() => {
    apiGet<{ subjects: SubjectItem[] }>('/api/subjects')
      .then((d) => setSubjects(d.subjects))
      .catch(() => setSubjects([]));
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-h1 font-semibold text-ink dark:text-gray-100">学习资料</h1>
        <p className="mt-1 text-[14px] text-ink-secondary dark:text-gray-500">按科目浏览老师开放的学习资料</p>
      </div>

      {!subjects ? (
        <CardSkeletonGrid count={6} />
      ) : subjects.length === 0 ? (
        <EmptyState icon={Library} title="暂无科目" description="管理员尚未创建科目" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {subjects.map((s) => (
            <SubjectCard key={s.id} subject={s} />
          ))}
        </div>
      )}
    </div>
  );
}
