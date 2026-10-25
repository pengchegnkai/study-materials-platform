import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';

const baseCls =
  'w-full h-10 px-3.5 rounded-btn border border-line dark:border-gray-700 bg-white dark:bg-gray-800 text-[14px] text-ink dark:text-gray-100 placeholder:text-ink-muted dark:placeholder:text-gray-600 transition-all duration-150 ease-out focus:outline-none focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-400 dark:focus:border-indigo-500 disabled:opacity-50';

interface FieldProps {
  label?: string;
  error?: string;
  children: ReactNode;
}

function Field({ label, error, children }: FieldProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-[12px] text-ink-secondary dark:text-gray-400 mb-1.5">{label}</label>}
      {children}
      {error && <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = '', ...rest },
  ref
) {
  return (
    <Field label={label} error={error}>
      <input ref={ref} className={`${baseCls} ${error ? 'border-red-400 dark:border-red-700' : ''} ${className}`} {...rest} />
    </Field>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className = '', children, ...rest }: SelectProps) {
  return (
    <Field label={label} error={error}>
      <select className={`${baseCls} cursor-pointer ${error ? 'border-red-400' : ''} ${className}`} {...rest}>
        {children}
      </select>
    </Field>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', ...rest }: TextareaProps) {
  return (
    <Field label={label} error={error}>
      <textarea className={`${baseCls} h-auto min-h-[80px] py-2 ${error ? 'border-red-400' : ''} ${className}`} {...rest} />
    </Field>
  );
}
