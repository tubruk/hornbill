import { Loader2, Edit2 } from "lucide-react";
import { SplitButton } from "./SplitButton";
import { DropdownItem } from "./Dropdown";
import { Button } from "./Button";
import { getPaymentState } from "@hornbill/core";
import type { EnrichedPayment } from "../api/queries";

function formatCents(cents: number, currency = "USD"): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency });
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

interface PaymentRowProps {
  payment: EnrichedPayment;
  todayStr: string;
  upcomingThreshold: number;
  isPaying: boolean;
  onPay: (payment: EnrichedPayment, isUpcoming: boolean) => void;
  onEdit: (payment: EnrichedPayment) => void;
}

export function PaymentRow({
  payment,
  todayStr,
  upcomingThreshold,
  isPaying,
  onPay,
  onEdit,
}: PaymentRowProps) {
  const isSettled = !!payment.paid_at;
  const { status } = getPaymentState(payment, todayStr, upcomingThreshold);

  return (
    <div className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-text-primary flex items-center gap-2 flex-wrap">
          <span className="truncate">{payment.bill?.name ?? "—"}</span>
        </div>
        <span className="text-[12px] text-text-secondary font-mono mt-0.5 block">
          {!isSettled ? (
            <>
              Due:{" "}
              <span
                className={
                  status === "overdue"
                    ? "text-error font-semibold"
                    : status === "due_soon"
                    ? "text-warning font-semibold"
                    : "text-[#1E40AF] font-semibold"
                }
              >
                {formatDate(payment.due_date)}
              </span>
              {" · "}
              <span
                className={
                  status === "overdue"
                    ? "text-error font-bold uppercase tracking-wider text-[10px]"
                    : status === "due_soon"
                    ? "text-warning font-bold uppercase tracking-wider text-[10px]"
                    : "text-[#1E40AF] font-bold uppercase tracking-wider text-[10px]"
                }
              >
                {status === "overdue" ? (() => {
                  const d1 = Date.parse(payment.due_date + "T00:00:00Z");
                  const d2 = Date.parse(todayStr + "T00:00:00Z");
                  const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                  return `Overdue (${diffDays}d)`;
                })() : status === "due_soon" ? "Due Soon" : "Upcoming"}
              </span>
            </>
          ) : (
            <>
              Due: {formatDate(payment.due_date)}
              {payment.paid_at && (() => {
                const paidDateStr = new Date(payment.paid_at * 1000).toISOString().split("T")[0];
                const d1 = Date.parse(payment.due_date + "T00:00:00Z");
                const d2 = Date.parse(paidDateStr + "T00:00:00Z");
                const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                const isLate = diffDays > 0;
                return (
                  <span className={`ml-2 font-semibold ${isLate ? "text-warning" : "text-success"}`}>
                    · Paid {formatDate(paidDateStr)} {isLate && `(${diffDays} ${diffDays === 1 ? "day" : "days"} late)`}
                  </span>
                );
              })()}
            </>
          )}
        </span>
        {isSettled && payment.notes && (
          <span className="text-[13px] text-text-secondary italic mt-1 block max-w-md truncate">
            Note: {payment.notes}
          </span>
        )}
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <span className="text-[15px] font-mono font-semibold text-text-primary">
          {formatCents(payment.amount_cents, payment.bill?.currency ?? "USD")}
        </span>
        {!isSettled ? (
          <SplitButton
            primaryLabel={isPaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark Paid"}
            onPrimaryClick={() => onPay(payment, status === "upcoming")}
            disabled={isPaying}
            dropdownWidthClass="w-32"
            dropdownItems={
              <DropdownItem onClick={() => onEdit(payment)}>
                <Edit2 className="w-4 h-4 text-text-secondary" />
                Edit
              </DropdownItem>
            }
          />
        ) : (
          <Button
            variant="secondary"
            size="small"
            onClick={() => onEdit(payment)}
          >
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}
