import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const barCls: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-primary',
  warning: 'bg-amber-500',
};

function Icon({ type }: { type: ToastType }) {
  switch (type) {
    case 'success':
      return <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />;
    case 'error':
      return <XCircle size={16} className="text-red-600 dark:text-red-400" />;
    case 'warning':
      return <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />;
    default:
      return <Info size={16} className="text-primary dark:text-indigo-400" />;
  }
}

const MAX_TOASTS = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, type, message }]);
      setTimeout(() => remove(id), 2500);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-[320px] max-w-[calc(100vw-32px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 bg-white dark:bg-gray-900 rounded-card shadow-card-hover overflow-hidden animate-toast-in"
          >
            <div className={`w-1 self-stretch ${barCls[t.type]}`} />
            <div className="flex items-center gap-2 py-3 pr-3 flex-1 min-w-0">
              <Icon type={t.type} />
              <span className="text-[13px] text-ink dark:text-gray-200 truncate">{t.message}</span>
            </div>
            <button
              onClick={() => remove(t.id)}
              className="h-10 w-10 pr-3 flex items-center justify-center text-ink-muted hover:text-ink transition-all duration-150 ease-out cursor-pointer"
              aria-label="关闭"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
