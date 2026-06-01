import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";

interface Props {
  billName: string;
  dueDate: string;
  isUpcoming: boolean;
  onConfirm: (paidAtDate?: string) => Promise<void>;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function PayPaymentModal({ billName, dueDate, isUpcoming, onConfirm, onClose, isSubmitting }: Props) {
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  };

  const getDaysUntilDue = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + "T00:00:00");
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const [customDate, setCustomDate] = useState(getYesterdayStr());
  const [error, setError] = useState("");

  const yesterdayStr = getYesterdayStr();
  const daysUntilDue = getDaysUntilDue();

  const handlePaidToday = () => {
    onConfirm(undefined);
  };

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDate) {
      setError("Please select a date.");
      return;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    if (customDate >= todayStr) {
      setError("Custom date must be before today.");
      return;
    }
    setError("");
    onConfirm(customDate);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card
        hoverable={false}
        className="w-full max-w-md relative bg-background-warm border border-border-warm shadow-lg p-6 animate-scaleIn"
      >
        {/* Header */}
        <div className="pb-4 border-b border-border-warm mb-5 flex items-start justify-between">
          <div>
            <h3 className="font-display font-bold text-[18px] text-text-primary">
              Record Payment
            </h3>
            <p className="text-[13px] text-text-secondary font-semibold mt-1">
              Mark <span className="text-primary font-bold">&quot;{billName}&quot;</span> as paid.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isUpcoming && (
          <div className="mb-5 p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-sm text-[13px] text-[#92400E] font-semibold animate-fadeIn leading-relaxed">
            ⚠️ <span className="font-bold">Upcoming Payment:</span> This bill is still far from its due date. It is due in <span className="font-bold text-[#78350F]">{daysUntilDue} days</span> (on {new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}).
          </div>
        )}

        {/* Content options */}
        <div className="space-y-4">
          <Button
            variant="primary"
            size="medium"
            onClick={handlePaidToday}
            disabled={isSubmitting}
            className="w-full justify-center h-[46px]"
          >
            Paid Today
          </Button>

          {/* Divider */}
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-border-warm"></div>
            <span className="flex-shrink mx-4 text-text-secondary text-[11px] font-bold uppercase tracking-wider">
              or pay on another day
            </span>
            <div className="flex-grow border-t border-border-warm"></div>
          </div>

          {/* Custom Date selection */}
          <form onSubmit={handleCustomDateSubmit} className="space-y-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  label="Select Past Date"
                  type="date"
                  max={yesterdayStr}
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setError("");
                  }}
                  error={!!error}
                  errorText={error}
                />
              </div>
              <Button
                variant="secondary"
                size="medium"
                type="submit"
                disabled={isSubmitting}
                className="h-[46px]"
              >
                Record Date
              </Button>
            </div>
          </form>
        </div>

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-border-warm flex justify-end">
          <Button
            variant="ghost"
            size="small"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </Card>
    </div>,
    document.body
  );
}
