import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
    ) : toast.type === 'error' ? (
      <AlertCircle size={16} className="text-destructive" />
    ) : (
      <Info size={16} className="text-primary" />
    );

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 min-w-[280px] max-w-[420px] rounded-lg border p-3.5 shadow-lg backdrop-blur-md bg-card/95 animate-in slide-in-from-right fade-in",
        toast.type === 'success' && "border-emerald-500/30",
        toast.type === 'error' && "border-destructive/30",
        toast.type === 'info' && "border-primary/30"
      )}
    >
      {icon}
      <p className="flex-1 text-sm text-foreground leading-snug">{toast.message}</p>
      <button
        className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        onClick={onClose}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}
