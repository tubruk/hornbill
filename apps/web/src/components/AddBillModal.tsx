import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";
import { Radio } from "./Radio";
import { Checkbox } from "./Checkbox";
import { DEFAULT_CURRENCY, DEFAULT_UPCOMING_THRESHOLD_DAYS, type Bill } from "@hornbill/core";
import { useAccounts } from "../api/queries";

interface Props {
  accountId: string;
  accountThreshold?: number;
  initialStartDate?: string;
  bill?: Bill;
  onSubmit: (payload: BillFormPayload) => Promise<void>;
  onClose: () => void;
  isSubmitting?: boolean;
}

export interface BillFormPayload {
  account_id: string;
  name: string;
  currency: string;
  amount_cents: number;
  recurrence: Bill["recurrence"];
  start_date: string;
  last_payment_date?: string;
  active: boolean;
  upcoming_threshold_days: number | null;
  notes: string | null;
}

const today = () => new Date().toISOString().split("T")[0];

export function AddBillModal({ accountId, accountThreshold, initialStartDate, bill, onSubmit, onClose, isSubmitting }: Props) {
  const { data: accounts = [] } = useAccounts();
  const currentAccount = accounts.find((a) => a.id === accountId);

  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState(bill ? (bill.amount_cents / 100).toString() : "");
  const [currency, setCurrency] = useState<string>(
    bill?.currency ?? currentAccount?.default_currency ?? DEFAULT_CURRENCY
  );

  const [prevBill, setPrevBill] = useState(bill);
  const [prevAccount, setPrevAccount] = useState(currentAccount);

  if (bill?.id !== prevBill?.id || currentAccount?.id !== prevAccount?.id) {
    setPrevBill(bill);
    setPrevAccount(currentAccount);
    if (bill) {
      setCurrency(bill.currency);
    } else if (currentAccount) {
      setCurrency(currentAccount.default_currency ?? DEFAULT_CURRENCY);
    }
  }

  const [startDate, setStartDate] = useState(bill?.start_date ?? initialStartDate ?? today());
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [lastPaymentDate, setLastPaymentDate] = useState(today());
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [recurrenceType, setRecurrenceType] = useState<"monthly" | "yearly" | "interval">(
    bill?.recurrence.type ?? "monthly"
  );
  const [monthlyDay, setMonthlyDay] = useState(
    bill?.recurrence.type === "monthly" ? bill.recurrence.monthly.day : 1
  );
  const [yearlyMonth, setYearlyMonth] = useState(
    bill?.recurrence.type === "yearly" ? bill.recurrence.yearly.month : 1
  );
  const [yearlyDay, setYearlyDay] = useState(
    bill?.recurrence.type === "yearly" ? bill.recurrence.yearly.day : 1
  );
  const [intervalEvery, setIntervalEvery] = useState(
    bill?.recurrence.type === "interval" ? bill.recurrence.interval.every : 1
  );
  const [intervalUnit, setIntervalUnit] = useState<"days" | "weeks" | "months">(
    bill?.recurrence.type === "interval" ? bill.recurrence.interval.unit : "months"
  );
  const [intervalFrom, setIntervalFrom] = useState<"due_date" | "paid_at">(
    bill?.recurrence.type === "interval" ? bill.recurrence.interval.from : "paid_at"
  );
  const [hasThresholdOverride, setHasThresholdOverride] = useState(
    bill?.upcoming_threshold_days !== null && bill?.upcoming_threshold_days !== undefined
  );
  const [thresholdDays, setThresholdDays] = useState(
    bill?.upcoming_threshold_days ?? accountThreshold ?? DEFAULT_UPCOMING_THRESHOLD_DAYS
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};

    if (!name.trim()) errs.name = "Bill name is required.";
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) errs.amount = "Enter a valid positive amount.";

    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});

    let recurrence: Bill["recurrence"];
    if (recurrenceType === "monthly") {
      recurrence = { type: "monthly", monthly: { day: monthlyDay } };
    } else if (recurrenceType === "yearly") {
      recurrence = { type: "yearly", yearly: { month: yearlyMonth, day: yearlyDay } };
    } else {
      recurrence = { type: "interval", interval: { every: intervalEvery, unit: intervalUnit, from: intervalFrom } };
    }

    await onSubmit({
      account_id: accountId,
      name: name.trim(),
      currency,
      amount_cents: Math.round(parsed * 100),
      recurrence,
      start_date: alreadyPaid && !bill ? lastPaymentDate : startDate,
      ...(alreadyPaid && !bill ? { last_payment_date: lastPaymentDate } : {}),
      active: bill ? bill.active : true,
      upcoming_threshold_days: hasThresholdOverride ? Number(thresholdDays) : null,
      notes: notes.trim() || null,
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card
        hoverable={false}
        className="w-full max-w-xl relative bg-background-warm border border-border-warm shadow-lg overflow-y-auto max-h-[92vh] animate-scaleIn"
      >
        {/* Header */}
        <div className="pb-5 border-b border-border-warm mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="font-display font-bold text-[22px] text-text-primary flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                {bill ? "Edit Bill" : "Add Bill"}
              </h3>
              {accounts.length > 1 && currentAccount && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-surface-raised text-text-secondary border border-border-warm">
                  {currentAccount.name}
                </span>
              )}
            </div>
            <p className="text-[14px] text-text-secondary font-medium mt-0.5">
              {bill ? "Update the recurring bill or service charge." : "Track a new recurring bill or service charge."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Bill Name"
            placeholder="Adobe CC, GitHub, AWS..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={!!errors.name}
            errorText={errors.name}
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="font-body text-[14px] font-semibold text-text-primary mb-1.5 block">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!!bill}
                className={`w-full rounded-sm p-3 text-[16px] font-body border border-border-warm h-[46px] outline-none ${
                  bill
                    ? "bg-surface-raised opacity-50 cursor-not-allowed"
                    : "bg-surface-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary"
                }`}
              >
                {(currentAccount?.currencies ?? ["IDR", "USD"]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Input
                label={`Amount (${currency})`}
                placeholder="49.99"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                error={!!errors.amount}
                errorText={errors.amount}
              />
            </div>
            <div>
              {alreadyPaid && !bill ? (
                <Input
                  label="Last Payment Date"
                  type="date"
                  value={lastPaymentDate}
                  onChange={(e) => setLastPaymentDate(e.target.value)}
                />
              ) : (
                <Input
                  label="Start Date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={!!bill}
                />
              )}
            </div>
          </div>

          {!bill && (
            <div className="space-y-3 pt-2">
              <Checkbox
                label="Already paid before? (Mark first payment as paid and schedule next cycle)"
                checked={alreadyPaid}
                onChange={(e) => setAlreadyPaid(e.target.checked)}
              />
            </div>
          )}

          <Input
            label="Notes"
            placeholder="Personal account, team seat…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {/* Warning Threshold Override */}
          <div className="space-y-3 pt-2">
            <Checkbox
              label={`Override warning threshold (Account default: ${accountThreshold ?? DEFAULT_UPCOMING_THRESHOLD_DAYS} days)`}
              checked={hasThresholdOverride}
              onChange={(e) => setHasThresholdOverride(e.target.checked)}
            />
            {hasThresholdOverride && (
              <div className="p-3 bg-surface-warm rounded-sm border border-border-warm animate-fadeIn max-w-[220px]">
                <Input
                  label="Days before due"
                  type="number"
                  min="1"
                  value={thresholdDays}
                  onChange={(e) => setThresholdDays(Math.max(1, Number(e.target.value)))}
                />
              </div>
            )}
          </div>

          {/* Recurrence type */}
          <div className="space-y-3">
            <span className="font-body text-[14px] font-semibold text-text-primary block">
              Billing Cycle
            </span>
            <div className="flex flex-col sm:flex-row gap-4">
              <Radio label="Monthly" name="recurrence" checked={recurrenceType === "monthly"} onChange={() => setRecurrenceType("monthly")} />
              <Radio label="Yearly" name="recurrence" checked={recurrenceType === "yearly"} onChange={() => setRecurrenceType("yearly")} />
              <Radio label="Custom Interval" name="recurrence" checked={recurrenceType === "interval"} onChange={() => setRecurrenceType("interval")} />
            </div>
          </div>

          {/* Cycle sub-options */}
          {recurrenceType === "monthly" && (
            <div className="p-3 bg-surface-warm rounded-sm border border-border-warm animate-fadeIn">
              <Input
                label="Day of month billed (1–31)"
                type="number" min="1" max="31"
                value={monthlyDay}
                onChange={(e) => setMonthlyDay(Math.max(1, Math.min(31, Number(e.target.value))))}
              />
            </div>
          )}

          {recurrenceType === "yearly" && (
            <div className="p-3 bg-surface-warm rounded-sm border border-border-warm grid grid-cols-2 gap-4 animate-fadeIn">
              <Input label="Month (1–12)" type="number" min="1" max="12"
                value={yearlyMonth}
                onChange={(e) => setYearlyMonth(Math.max(1, Math.min(12, Number(e.target.value))))}
              />
              <Input label="Day (1–31)" type="number" min="1" max="31"
                value={yearlyDay}
                onChange={(e) => setYearlyDay(Math.max(1, Math.min(31, Number(e.target.value))))}
              />
            </div>
          )}

          {recurrenceType === "interval" && (
            <div className="p-3 bg-surface-warm rounded-sm border border-border-warm space-y-4 animate-fadeIn">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Input label="Every…" type="number" min="1"
                    value={intervalEvery}
                    onChange={(e) => setIntervalEvery(Math.max(1, Number(e.target.value)))}
                  />
                </div>
                <div className="flex-1">
                  <label className="font-body text-[14px] font-semibold text-text-primary mb-1.5 block">Unit</label>
                  <select
                    value={intervalUnit}
                    onChange={(e) => setIntervalUnit(e.target.value as "days" | "weeks" | "months")}
                    className="w-full bg-surface-warm rounded-sm p-3 text-[16px] font-body border border-border-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary h-[46px] outline-none"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-body text-[14px] font-semibold text-text-primary mb-1.5 block">
                  Calculate Next Due Date From
                </label>
                <select
                  value={intervalFrom}
                  onChange={(e) => setIntervalFrom(e.target.value as "due_date" | "paid_at")}
                  className="w-full bg-surface-warm rounded-sm p-3 text-[16px] font-body border border-border-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary h-[46px] outline-none"
                >
                  <option value="paid_at">Actual payment date (when paid)</option>
                  <option value="due_date">Scheduled due date (original due date)</option>
                </select>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-5 border-t border-border-warm flex items-center justify-end gap-3">
            <Button variant="ghost" size="medium" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="medium" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (bill ? "Saving…" : "Adding…") : (bill ? "Save Changes" : "Add Bill")}
            </Button>
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}
