import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface InfoTipProps {
  title?: string;
  text: string;
  align?: 'left' | 'right' | 'center';
}

export const InfoTip: React.FC<InfoTipProps> = ({
  title,
  text,
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : 'left-0';

  return (
    <span ref={containerRef} className="relative inline-flex items-center ml-1.5 align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        title={text}
        aria-label={title || 'More information'}
        className="w-4 h-4 rounded-full bg-slate-100 hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 inline-flex items-center justify-center transition-colors border border-slate-200/80"
      >
        <Info className="w-2.5 h-2.5" />
      </button>

      {open && (
        <span
          onClick={(e) => e.stopPropagation()}
          className={`absolute z-50 top-full mt-1.5 w-64 p-2.5 rounded-xl bg-slate-900 text-white text-[11px] font-medium leading-relaxed shadow-xl border border-slate-700 ${alignClass}`}
        >
          {title && (
            <span className="block font-bold text-indigo-300 mb-0.5 text-[11px]">
              {title}
            </span>
          )}
          <span className="block text-slate-200">{text}</span>
        </span>
      )}
    </span>
  );
};
