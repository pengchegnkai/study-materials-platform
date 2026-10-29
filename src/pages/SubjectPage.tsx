import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import { apiGet } from '../utils/api';
import { FileCard, type ManifestFile } from '../components/FileCard';
import { CardSkeletonGrid } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

/** 科目页：面包屑 + 按老师分组的文件区块 */
export default function SubjectPage() {
  const { slug } = useParams<{ slug: string }>();
  const [files, setFiles] = useState<ManifestFile[] | null>(null);
  const [subjectName, setSubjectName] = useState('');

  useEffect(() => {
    setFiles(null);
    apiGet<{ subjects: { slug: string; name: string }[] }>('/api/subjects')
      .then((d) => {
        setSubjectName(d.subjects.find((s) => s.slug === slug)?.name ?? '');
      })
      .catch(() => {});
    apiGet<{ files: ManifestFile[] }>('/api/manifest')
      .then((d) => setFiles(d.files.filter((f) => f.subjectSlug === slug)))
      .catch(() => setFiles([]));
  }, [slug]);

  const groups = useMemo(() => {
    if (!files) return [];
    const map = new Map<string, ManifestFile[]>();
    for (const f of files) {
      const list = map.get(f.uploader) ?? [];
      list.push(f);
      map.set(f.uploader, list);
    }
    return Array.from(map.entries());
  }, [files]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-8">
      <nav className="flex items-center gap-1.5 text-[13px] mb-6">
        <Link to="/" className="text-ink-secondary dark:text-gray-400 hover:text-primary transition-all duration-150 ease-out">
          首页
        </Link>
        <ChevronRight size={14} className="text-ink-muted dark:text-gray-600" />
        <span className="text-ink dark:text-gray-200">{subjectName || '…'}</span>
      </nav>

      {!files ? (
        <CardSkeletonGrid count={4} />
      ) : files.length === 0 ? (
        <EmptyState icon={FileText} title="暂无开放文件" description="老师还没有开放该科目的资料" />
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map(([teacher, list]) => (
            <section key={teacher} className="animate-rise-in">
              <h2 className="text-h3 font-semibold text-ink dark:text-gray-100 mb-4">
                {teacher} · <span className="tabular-nums">{list.length}</span> 个文件
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {list.map((f, fi) => (
                  <div key={f.key} className="animate-rise-in" style={{ animationDelay: `${Math.min(fi, 9) * 45}ms` }}>
                    <FileCard file={f} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
