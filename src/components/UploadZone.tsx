import { useCallback, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import type { ReactNode } from 'react';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  onFolder?: (files: File[]) => void;
  disabled?: boolean;
  children?: ReactNode;
}

/** 虚线边框拖拽上传区，hover 变主色边框 */
export function UploadZone({ onFiles, onFolder, disabled = false, children }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [disabled, onFiles]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center gap-2 py-10 px-6 rounded-card border-2 border-dashed cursor-pointer transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 ${
        dragging
          ? 'border-primary bg-primary-soft dark:bg-indigo-950/40'
          : 'border-line dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-primary'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <UploadCloud size={28} className="text-ink-muted dark:text-gray-500" strokeWidth={1.5} />
      <p className="text-[14px] text-ink dark:text-gray-200">点击或拖拽文件到此处上传</p>
      <p className="text-[12px] text-ink-muted dark:text-gray-500">支持 Markdown / PPT / Word / 图片</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
      />
      <p className="text-[12px] text-ink-muted dark:text-gray-500">
        {onFolder ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) folderRef.current?.click();
            }}
            className="text-primary dark:text-indigo-400 underline underline-offset-2 cursor-pointer"
          >
            或选择整个文件夹上传（保留目录结构）
          </button>
        ) : (
          '支持 Markdown / PPT / Word / Excel / 图片'
        )}
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
      />
      {onFolder && (
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          // @ts-expect-error 非标准属性，Chrome/Edge 支持目录选择
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0 && onFolder) onFolder(files);
            e.target.value = '';
          }}
        />
      )}
      {children}
    </div>
  );
}
