import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/** Bottom sheet on phones, centred dialog on desktop. Escape closes it. */
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center">
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[100dvh] sm:max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl`}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 h-16 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 truncate">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-12 h-12 shrink-0 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <X className="w-6 h-6" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
