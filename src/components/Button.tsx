import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

const sizeCls: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-[14px]',
  lg: 'h-10 px-5 text-[14px]',
};

const variantCls: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:bg-indigo-500 dark:hover:bg-indigo-600',
  secondary:
    'bg-white dark:bg-gray-800 border border-line dark:border-gray-700 text-ink dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-indigo-500/30',
  ghost:
    'bg-transparent text-ink-secondary dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-indigo-500/30',
  danger:
    'bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 focus-visible:ring-2 focus-visible:ring-red-500/30',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-btn font-medium transition-all duration-150 ease-out focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sizeCls[size]} ${variantCls[variant]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {loading ? '处理中…' : children}
    </button>
  );
}
