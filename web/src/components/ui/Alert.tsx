import React from 'react';

interface AlertProps {
  type?: 'error' | 'warning' | 'success' | 'info';
  title?: string;
  message: string;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  message,
  className = ''
}) => {
  const styles = {
    error: 'bg-rose-50 border-rose-200 text-rose-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-sky-50 border-sky-200 text-sky-800'
  };

  return (
    <div className={`rounded-xl border p-4 text-sm flex gap-3 ${styles[type]} ${className}`}>
      <div className="flex-1">
        {title && <h5 className="font-semibold mb-0.5">{title}</h5>}
        <p className="leading-relaxed">{message}</p>
      </div>
    </div>
  );
};

