import React from 'react';
import type { ToastItem } from '../../types';

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div className="toast-area" id="toastArea" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast"
          onClick={() => onRemove(t.id)}
          style={{ cursor: 'pointer' }}
        >
          <i>✓</i>
          <div>
            {t.title}
            {t.note && <small>{t.note}</small>}
          </div>
        </div>
      ))}
    </div>
  );
};
