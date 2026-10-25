import type { ReactNode } from 'react';

type Tone = 'published' | 'private' | 'role' | 'neutral' | 'danger';

const toneCls: Record<Tone, string> = {
  published: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-900',
  private: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  role: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/70 dark:bg-indigo-950 dark:text-indigo-400 dark:ring-indigo-900',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  danger: 'bg-red-50 text-red-700 ring-1 ring-red-200/70 dark:bg-red-950 dark:text-red-400 dark:ring-red-900',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold tracking-tight ${toneCls[tone]}`}>
      {children}
    </span>
  );
}
