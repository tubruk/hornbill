import { useState, type FormEvent } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";
import { Radio } from "./Radio";
import type { Bill } from "@hornbill/core";

interface Props {
  accountId: string;
  onSubmit: (payload: BillFormPayload) => Promise<void>;
  onClose: () => void;
  isSubmitting?: boolean;
}

export interface BillFormPayload {
  account_id: string;
  name: string;
  currency: string;
  amount_cents: number;
  amount_type: "fixed";
  recurrence: Bill["recurrence"];
  start_date: string;
  active: true;
  notes: string | null;
}

const today = () => new Date().toISOString().split("T")[0];

export function AddBillModal({ accountId, onSubmit, onClose, isSubmitting }: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<"monthly" | "yearly" | "interval">("monthly");
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [yearlyMonth, setYearlyMonth] = useState(1);
  const [yearlyDay, setYearlyDay] = useState(1);
  const [intervalEvery, setIntervalEvery] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<"days" | "weeks" | "months">("months");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};

    if (!name.trim()) errs.name = "Subscription name is required.";
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
      recurrence = { type: "interval", interval: { every: intervalEvery, unit: intervalUnit, from: "paid_at" } };
    }

    await onSubmit({
      account_id: accountId,
      name: name.trim(),
      currency: "USD",
      amount_cents: Math.round(parsed * 100),
      amount_type: "fixed",
      recurrence,
      start_date: startDate,
      active: true,
      notes: notes.trim() || null,
    });
  }

  return (
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
            <h3 className="font-display font-bold text-[22px] text-text-primary flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Add Subscription
            </h3>
            <p className="text-[14px] text-text-secondary font-medium mt-0.5">
              Track a recurring bill or service license.
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
            label="Subscription Name"
            placeholder="Adobe CC, GitHub, AWS..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={!!errors.name}
            errorText={errors.name}
            autoFocus
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount (USD)"
              placeholder="49.99"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={!!errors.amount}
              errorText={errors.amount}
            />
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <Input
            label="Notes"
            placeholder="Personal account, team seat…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

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
            <div className="p-3 bg-surface-warm rounded-sm border border-border-warm flex gap-4 items-end animate-fadeIn">
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
                  onChange={(e) => setIntervalUnit(e.target.value as any)}
                  className="w-full bg-surface-warm rounded-sm p-3 text-[16px] font-body border border-border-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary h-[46px] outline-none"
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
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
              {isSubmitting ? "Adding…" : "Add Subscription"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
