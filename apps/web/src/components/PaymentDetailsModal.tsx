import { createPortal } from "react-dom";
import { X, Clock, AlertCircle, Check, Edit2 } from "lucide-react";
import { Button } from "./Button";
import { Card } from "./Card";
import { getPaymentState, DEFAULT_UPCOMING_THRESHOLD_DAYS } from "@hornbill/core";
import { type EnrichedPayment } from "../api/queries";

interface Props {
  payment: EnrichedPayment;
  onClose: () => void;
  onEdit: () => void;
  onPay: () => void;
  upcomingThreshold?: number;
}

function formatCents(cents: number, currency = "USD"): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency });
}

function formatPrettyDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function getRelativeDateString(iso: string): string | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(iso + "T00:00:00");
  date.setHours(0, 0, 0, 0);

  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Tomorrow";
  }
  if (diffDays === -1) {
    return "Yesterday";
  }
  if (diffDays > 1) {
    return `In ${diffDays} days`;
  }
  if (diffDays < -1) {
    return `${Math.abs(diffDays)} days ago`;
  }
  return null;
}

export function PaymentDetailsModal({
  payment,
  onClose,
  onEdit,
  onPay,
  upcomingThreshold,
}: Props) {
  const isProjected = payment.id.startsWith("projected-");
  const isSettled = !!payment.paid_at;
  const todayStr = new Date().toISOString().split("T")[0];
  const threshold = payment.bill?.upcoming_threshold_days ?? upcomingThreshold ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
  const { status, paidLateByDays, unpaidOverdueByDays } = getPaymentState(payment, todayStr, threshold);

  // Status Badge Styling
  let badgeClass = "text-text-secondary bg-surface-raised border border-border-warm";
  let prefixIcon = null;
  let statusLabel = "";

  if (isProjected) {
    statusLabel = "Projected";
    badgeClass = "text-text-secondary border border-dashed border-neutral bg-background-warm/30 italic";
  } else if (status === "paid_late") {
    statusLabel = `Paid Late by ${paidLateByDays} ${paidLateByDays === 1 ? "day" : "days"}`;
    badgeClass = "text-warning bg-[#FEF3C7]/40 border border-[#FDE68A]/60 font-semibold";
    prefixIcon = <Check className="w-3.5 h-3.5 shrink-0" />;
  } else if (status === "paid") {
    statusLabel = "Paid (On Time)";
    badgeClass = "text-success bg-[#DCFCE7]/40 border border-[#BBF7D0]/60 font-semibold";
    prefixIcon = <Check className="w-3.5 h-3.5 shrink-0" />;
  } else if (status === "overdue") {
    statusLabel = `Overdue by ${unpaidOverdueByDays} ${unpaidOverdueByDays === 1 ? "day" : "days"}`;
    badgeClass = "text-error bg-[#FEE2E2]/60 border border-[#FCA5A5]/60 font-semibold";
    prefixIcon = <AlertCircle className="w-3.5 h-3.5 shrink-0 animate-pulse" />;
  } else if (status === "due_soon") {
    statusLabel = "Due Soon";
    badgeClass = "text-warning bg-[#FEF3C7]/60 border border-[#FDE68A]/60 font-semibold";
    prefixIcon = <Clock className="w-3.5 h-3.5 shrink-0" />;
  } else {
    statusLabel = "Upcoming";
    badgeClass = "text-text-secondary bg-[#F5F5F4] border border-[#D6D3D1] font-semibold";
  }

  const relativeDate = getRelativeDateString(payment.due_date);

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
            <h3 className="font-display font-bold text-[22px] text-text-primary">
              Payment Details
            </h3>
            <p className="text-[13px] text-text-secondary font-semibold mt-1">
              For bill <span className="text-primary font-bold">&quot;{payment.bill?.name ?? "—"}&quot;</span>
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

        {/* Content */}
        <div className="space-y-4 font-body text-text-primary text-[15px] mb-6">
          <div className="flex justify-between items-baseline py-2.5 border-b border-border-warm/60">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">Amount</span>
            <span className="text-[20px] font-mono font-bold">
              {formatCents(payment.amount_cents, payment.bill?.currency)}
            </span>
          </div>

          <div className="flex justify-between items-center py-2.5 border-b border-border-warm/60">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">Status</span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-[12px] ${badgeClass}`}>
              {prefixIcon}
              <span>{statusLabel}</span>
            </span>
          </div>

          <div className="flex justify-between items-center py-2.5 border-b border-border-warm/60">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">Due Date</span>
            <span className="font-medium text-right">
              {formatPrettyDate(payment.due_date)}
              {relativeDate && (
                <span className="text-text-secondary text-[13px] block sm:inline sm:ml-1.5">
                  ({relativeDate})
                </span>
              )}
            </span>
          </div>

          {isSettled && payment.paid_at && (
            <div className="flex justify-between items-center py-2.5 border-b border-border-warm/60">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">Paid Date</span>
              <span className="font-medium text-success text-right">
                {formatPrettyDate(new Date(payment.paid_at * 1000).toISOString().split("T")[0])}
              </span>
            </div>
          )}

          {payment.bill?.recurrence && (
            <div className="flex justify-between items-center py-2.5 border-b border-border-warm/60">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">Recurrence</span>
              <span className="font-medium capitalize text-right">
                {payment.bill.recurrence.type}
              </span>
            </div>
          )}

          {payment.notes && (
            <div className="pt-2">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary block mb-2">Notes</span>
              <div className="p-3 bg-surface-raised border border-border-warm rounded-sm text-[14px] italic text-text-secondary">
                &quot;{payment.notes}&quot;
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-border-warm flex justify-between gap-3 items-center">
          <Button
            variant="secondary"
            size="medium"
            onClick={onEdit}
            className="flex items-center gap-1.5"
          >
            <Edit2 className="w-4 h-4" />
            <span>Edit</span>
          </Button>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="medium"
              onClick={onClose}
            >
              Close
            </Button>
            
            {!isSettled && (
              <Button
                variant="primary"
                size="medium"
                onClick={onPay}
              >
                {isProjected ? "Record Pay" : "Mark Paid"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>,
    document.body
  );
}
