import type { ReactNode } from 'react';

type Tone = 'published' | 'private' | 'role' | 'neutral' | 'danger';

const toneCls: Record<Tone, string> = {
  published: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  private: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  role: 'bg-primary-soft text-primary dark:bg-indigo-950 dark:text-indigo-400',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-tag px-2 py-0.5 text-[12px] font-medium ${toneCls[tone]}`}>
      {children}
    </span>
  );
}
