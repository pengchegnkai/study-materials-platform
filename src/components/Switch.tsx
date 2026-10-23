interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/** 发布开关（主色），触控区 ≥40px */
export function Switch({ checked, onChange, disabled = false, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer p-1 ${
        checked ? 'bg-primary dark:bg-indigo-500' : 'bg-gray-300 dark:bg-gray-700'
      }`}
      {...rest}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-all duration-150 ease-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
