import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

const sizeCls: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-10 px-4 text-[14px]',
  lg: 'h-11 px-5 text-[15px]',
};

const variantCls: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-[0_2px_8px_rgba(79,70,229,0.28)] hover:from-indigo-500 hover:to-indigo-700 hover:shadow-[0_4px_14px_rgba(79,70,229,0.36)] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-indigo-500/40',
  secondary:
    'bg-white dark:bg-gray-800 border border-line dark:border-gray-700 text-ink dark:text-gray-100 shadow-[0_1px_2px_rgba(17,24,39,0.04)] hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-indigo-500/30',
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
