import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
let addToastRef: ((toast: ToastItem) => void) | null = null;

export function showToast(message: string, type: ToastType = 'info') {
  if (addToastRef) {
    addToastRef({ id: ++toastId, message, type });
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => [...prev, toast]);
  }, []);

  useEffect(() => {
    addToastRef = addToast;
    return () => {
      addToastRef = null;
    };
  }, [addToast]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItemView key={toast.id} onClose={() => removeToast(toast.id)} toast={toast} />
      ))}
    </div>
  );
}

function ToastItemView({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icon =
    toast.type === 'success' ? (
      <CheckCircle2 size={16} className="text-tertiary" />
    ) : toast.type === 'error' ? (
      <AlertCircle size={16} className="text-error" />
    ) : (
      <Info size={16} className="text-primary" />
    );

  const borderColor =
    toast.type === 'success'
      ? 'border-tertiary/30'
      : toast.type === 'error'
        ? 'border-error/30'
        : 'border-primary/30';

  const bgColor =
    toast.type === 'success'
      ? 'bg-tertiary-container/10'
      : toast.type === 'error'
        ? 'bg-error-container/10'
        : 'bg-primary-container/10';

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 min-w-[280px] max-w-[420px] rounded-lg border p-3.5 shadow-lg backdrop-blur-md ${borderColor} ${bgColor} bg-surface-container-lowest/95 animate-in slide-in-from-right fade-in`}
    >
      {icon}
      <p className="flex-1 text-sm text-on-surface leading-snug">{toast.message}</p>
      <button
        className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
        onClick={onClose}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}
