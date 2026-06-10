import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Calendar } from "lucide-react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";
import { Checkbox } from "./Checkbox";

interface Props {
  billName: string;
  dueDate: string;
  isUpcoming: boolean;
  amountCents: number;
  currency: string;
  onConfirm: (amountCents: number, paidAtDate?: string, dueDate?: string, notes?: string) => Promise<void>;
  onClose: () => void;
  isSubmitting?: boolean;
  isArbitrary?: boolean;
  isEditing?: boolean;
  initialNotes?: string | null;
  paidAtDate?: string | null;
  onDelete?: () => Promise<void>;
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
    return null;
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

export function PayPaymentModal({
  billName,
  dueDate,
  isUpcoming,
  amountCents,
  currency,
  onConfirm,
  onClose,
  isSubmitting,
  isArbitrary,
  isEditing = false,
  initialNotes = "",
  paidAtDate = null,
  onDelete,
}: Props) {
  const getDaysUntilDue = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + "T00:00:00");
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getTodayStr = () => new Date().toISOString().split("T")[0];

  const [amount, setAmount] = useState((amountCents / 100).toString());
  const [amountError, setAmountError] = useState("");
  const [dateOption, setDateOption] = useState<"today" | "custom">(
    isEditing && paidAtDate ? "custom" : "today"
  );
  const [customDate, setCustomDate] = useState(
    isEditing && paidAtDate ? paidAtDate : getTodayStr()
  );
  const [notes, setNotes] = useState(initialNotes || "");
  const [error, setError] = useState("");
  const [specifyDifferentDueDate, setSpecifyDifferentDueDate] = useState(false);
  const [customDueDate, setCustomDueDate] = useState(dueDate || getTodayStr());

  const daysUntilDue = getDaysUntilDue();

  const validateAmount = (): number | null => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) {
      setAmountError("Enter a valid positive amount.");
      return null;
    }
    setAmountError("");
    return Math.round(parsed * 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = validateAmount();
    if (cents === null) return;

    const paidAt = dateOption === "today" ? getTodayStr() : customDate;
    if (dateOption === "custom" && !customDate && (!isEditing || paidAtDate !== null)) {
      setError("Please select a date.");
      return;
    }
    setError("");

    if (isEditing) {
      const editPaidAt = paidAtDate === null ? undefined : paidAt;
      onConfirm(cents, editPaidAt, customDueDate, notes);
    } else if (isArbitrary) {
      const due = specifyDifferentDueDate ? customDueDate : paidAt;
      onConfirm(cents, paidAt, due);
    } else {
      onConfirm(cents, dateOption === "custom" ? customDate : undefined);
    }
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
              {isEditing ? "Edit Payment" : "Record Payment"}
            </h3>
            <p className="text-[13px] text-text-secondary font-semibold mt-1">
              {isEditing ? (
                <>Edit payment details for <span className="text-primary font-bold">&quot;{billName}&quot;</span>.</>
              ) : isArbitrary ? (
                <>Record an arbitrary payment for <span className="text-primary font-bold">&quot;{billName}&quot;</span>.</>
              ) : (
                <>Mark <span className="text-primary font-bold">&quot;{billName}&quot;</span> as paid.</>
              )}
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

        {isUpcoming && !isArbitrary && !isEditing && (
          <div className="mb-5 p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-sm text-[13px] text-[#92400E] font-semibold animate-fadeIn leading-relaxed">
            ⚠️ <span className="font-bold">Upcoming Payment:</span> This bill is still far from its due date. It is due in <span className="font-bold text-[#78350F]">{daysUntilDue} days</span> (on {new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}).
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Amount Paid input */}
          <Input
            label={isEditing && paidAtDate === null ? `Amount (${currency})` : `Amount Paid (${currency})`}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountError("");
            }}
            error={!!amountError}
            errorText={amountError}
            disabled={isSubmitting}
          />

          {/* Date Option Selection & Date Input */}
          {(!isEditing || paidAtDate !== null) && (
            <div className="space-y-3">
              <label className="font-body text-[14px] font-semibold text-text-primary block">
                Payment Date
              </label>
              <div className="flex bg-surface-raised border border-border-warm p-0.5 rounded-full w-fit">
                <button
                  type="button"
                  onClick={() => {
                    setDateOption("today");
                    setError("");
                  }}
                  className={`text-[12px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                    dateOption === "today"
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-secondary hover:bg-stone-300/40 hover:text-text-primary"
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDateOption("custom")}
                  className={`text-[12px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                    dateOption === "custom"
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-secondary hover:bg-stone-300/40 hover:text-text-primary"
                  }`}
                >
                  Custom Date
                </button>
              </div>

              <div
                className={`w-full rounded-sm p-3 border transition-all duration-150 flex items-center justify-between min-h-[46px] relative ${
                  dateOption === "today"
                    ? "bg-surface-raised border-border-warm text-text-secondary cursor-default"
                    : error
                    ? "bg-surface-warm border-error text-text-primary focus-within:ring-3 focus-within:ring-error/12"
                    : "bg-surface-warm border-border-warm text-text-primary hover:border-primary cursor-pointer focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/12"
                }`}
              >
                <span className="font-body text-[16px] font-medium pointer-events-none">
                  {(() => {
                    const selectedDate = dateOption === "today" ? getTodayStr() : customDate;
                    if (!selectedDate) return "Select Date";
                    const pretty = formatPrettyDate(selectedDate);
                    const relative = getRelativeDateString(selectedDate);
                    return relative ? `${pretty} (${relative})` : pretty;
                  })()}
                </span>

                <input
                  type="date"
                  value={dateOption === "today" ? getTodayStr() : customDate}
                  onChange={(e) => {
                    if (dateOption === "custom") {
                      setCustomDate(e.target.value);
                      setError("");
                    }
                  }}
                  disabled={dateOption === "today" || isSubmitting}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default disabled:pointer-events-none"
                  aria-label="Select custom date"
                />

                <Calendar className="w-4 h-4 text-text-secondary pointer-events-none" />
              </div>

              {dateOption === "custom" && error && (
                <span className="font-body text-[12px] text-error mt-1.5 font-medium block">
                  {error}
                </span>
              )}
            </div>
          )}

          {isEditing && (
            <>
              <Input
                label="Cycle Due Date"
                type="date"
                value={customDueDate}
                onChange={(e) => setCustomDueDate(e.target.value)}
                disabled={isSubmitting}
              />
              <Input
                label="Notes"
                type="text"
                placeholder="Optional notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitting}
              />
            </>
          )}

          {isArbitrary && !isEditing && (
            <div className="space-y-3 pt-2">
              <Checkbox
                label="Specify a different cycle due date"
                checked={specifyDifferentDueDate}
                onChange={(e) => setSpecifyDifferentDueDate(e.target.checked)}
                disabled={isSubmitting}
              />
              {specifyDifferentDueDate && (
                <div className="p-3 bg-surface-warm rounded-sm border border-border-warm animate-fadeIn max-w-[220px]">
                  <Input
                    label="Cycle Due Date"
                    type="date"
                    value={customDueDate}
                    onChange={(e) => setCustomDueDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </div>
          )}

          {/* Submit and Cancel buttons */}
          <div className="pt-4 border-t border-border-warm flex justify-end gap-3 items-center">
            {isEditing && onDelete && (
              <div className="mr-auto">
                <Button
                  variant="destructive"
                  size="small"
                  type="button"
                  onClick={onDelete}
                  disabled={isSubmitting}
                >
                  Delete
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="medium"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="medium"
              type="submit"
              disabled={isSubmitting}
            >
              {isEditing ? "Save Changes" : isArbitrary ? "Record Payment" : "Mark as Paid"}
            </Button>
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}
