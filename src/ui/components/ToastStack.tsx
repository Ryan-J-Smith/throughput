import { useEffect } from 'react';
import type { ToastView } from '../types';

export type ToastStackProps = {
  toasts: readonly ToastView[];
  onDismiss: (toastId: string) => void;
  durationMs?: number;
};

function Toast({ toast, onDismiss, durationMs }: { toast: ToastView; onDismiss: (id: string) => void; durationMs: number }) {
  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), durationMs);
    return () => clearTimeout(id);
  }, [toast.id, onDismiss, durationMs]);

  return (
    <li className={`toast toast--${toast.kind}`}>
      <button type="button" className="toast__button" onClick={() => onDismiss(toast.id)}>
        {toast.message}
      </button>
    </li>
  );
}

/** Transient banners. Each dismisses itself after `durationMs`, or on click. */
export function ToastStack({ toasts, onDismiss, durationMs = 2200 }: ToastStackProps) {
  return (
    <ol className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} durationMs={durationMs} />
      ))}
    </ol>
  );
}
