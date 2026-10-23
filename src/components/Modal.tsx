import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** true 时不可通过遮罩/按钮关闭（如密码结果面板） */
  locked?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, onClose, locked = false, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, locked, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(17,24,39,0.4)' }}
      onClick={() => !locked && onClose()}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-modal shadow-modal w-full max-w-[560px] p-6 animate-modal-in max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[18px] font-semibold text-ink dark:text-gray-100">{title}</h3>
          {!locked && (
            <button
              onClick={onClose}
              className="h-10 w-10 -mr-2 flex items-center justify-center rounded-btn text-ink-muted hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150 ease-out cursor-pointer"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          )}
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
