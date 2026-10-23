import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** 居中：线性图标 40px 灰色 + 主文案 + 辅助文案 + 可选操作；不使用插画 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <Icon size={40} className="text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
      <p className="mt-4 text-[15px] font-medium text-ink dark:text-gray-200">{title}</p>
      {description && <p className="mt-1 text-[13px] text-ink-secondary dark:text-gray-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
