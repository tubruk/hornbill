import { CheckCircle, AlertCircle, Info, X } from "lucide-react";
import type { Toast } from "../context/AppContext";

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const icons = {
  success: <CheckCircle className="w-4 h-4 text-success shrink-0" />,
  error: <AlertCircle className="w-4 h-4 text-error shrink-0" />,
  info: <Info className="w-4 h-4 text-accent shrink-0" />,
};

const styles = {
  success: "border-l-success bg-[#F0FDF4]",
  error: "border-l-error bg-[#FEF2F2]",
  info: "border-l-accent bg-[#FFFBEB]",
};

export function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto animate-slideUp flex items-center gap-3 px-4 py-3 rounded-md border border-border-warm border-l-4 shadow-md ${styles[toast.type]}`}
        >
          {icons[toast.type]}
          <span className="text-[14px] font-semibold text-text-primary flex-1 leading-snug">
            {toast.text}
          </span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
