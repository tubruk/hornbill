import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useAppCtx } from "../context/AppContext";
import { useBills, usePayments, usePayPayment } from "../api/queries";
import { PayPaymentModal } from "../components/PayPaymentModal";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { getPaymentState, DEFAULT_UPCOMING_THRESHOLD_DAYS } from "@hornbill/core";

type Filter = "unpaid" | "settled";

function formatCents(cents: number, currency = "USD"): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency });
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function PaymentsView() {
  const { currentAccount, notify } = useAppCtx();
  const [filter, setFilter] = useState<Filter>("unpaid");
  const [payingPayment, setPayingPayment] = useState<{ id: string; name: string } | null>(null);
  const todayStr = new Date().toISOString().split("T")[0];

  const search = useSearch({ from: "/payments" });
  const navigate = useNavigate({ from: "/payments" });
  const billId = search.billId;

  const billsQuery = useBills(currentAccount?.id);
  const paymentsQuery = usePayments(currentAccount?.id, billsQuery.data);
  const payments = paymentsQuery.data ?? [];

  const payMut = usePayPayment();

  const displayed = payments
    .filter((p) => {
      if (billId && p.bill_id !== billId) return false;

      const isSettled = !!p.paid_at;

      if (filter === "unpaid") {
        return !isSettled;
      }
      if (filter === "settled") {
        return isSettled;
      }
      return true;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  function handlePay(paymentId: string, billName: string) {
    setPayingPayment({ id: paymentId, name: billName });
  }

  async function handlePayConfirm(paidAtDate?: string) {
    if (!payingPayment || !currentAccount) return;
    await payMut.mutateAsync(
      { paymentId: payingPayment.id, accountId: currentAccount.id, paidAt: paidAtDate },
      {
        onSuccess: () => {
          notify(`"${payingPayment.name}" marked as paid.`, "success");
          setPayingPayment(null);
        },
        onError: (err: any) => notify(err.message ?? "Failed to mark as paid.", "error"),
      }
    );
  }

  if (!currentAccount) {
    return (
      <div className="py-20 text-center text-text-secondary font-semibold">
        Select an account to view payments.
      </div>
    );
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "unpaid", label: "Active" },
    { key: "settled", label: "Past" },
  ];

  return (
    <div className="space-y-6">

      {/* Controls / Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left controls: Tabs + Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full md:w-auto">
          {/* Status filter pills (conjoined) */}
          <div className="flex bg-surface-raised border border-border-warm p-0.5 rounded-full shrink-0">
            {FILTERS.map(({ key, label }) => {
              const isActive = filter === key;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`text-[12px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-secondary hover:bg-stone-300/40 hover:text-text-primary"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Bill filter selector */}
          <select
            id="bill-filter"
            aria-label="Filter by bill"
            value={billId || "all"}
            onChange={(e) => {
              const val = e.target.value;
              navigate({
                search: (prev) => ({
                  ...prev,
                  billId: val === "all" ? undefined : val,
                }),
              });
            }}
            className="w-full sm:w-56 bg-surface-raised border border-border-warm rounded-full px-4 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary hover:bg-stone-300/40 outline-none cursor-pointer h-[34px] transition-all"
          >
            <option value="all" className="bg-background-warm">All Bills</option>
            {billsQuery.data?.map((b) => (
              <option key={b.id} value={b.id} className="bg-background-warm">
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clear Filter button */}
        {billId && (
          <button
            onClick={() => {
              navigate({
                search: (prev) => ({
                  ...prev,
                  billId: undefined,
                }),
              });
            }}
            className="text-[12px] font-semibold uppercase tracking-wider text-primary hover:text-primary-hover cursor-pointer self-start sm:self-auto"
          >
            Clear Filter
          </button>
        )}
      </div>

      <Card hoverable={false}>
        {paymentsQuery.isPending ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-16 text-center text-[15px] text-text-secondary font-semibold">
            No {filter === "unpaid" ? "active" : "past"} payments found.
          </div>
        ) : (
          <div className="divide-y divide-border-warm">
            {displayed.map((p) => {
              const isSettled = !!p.paid_at;
              const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
              const { status } = getPaymentState(p, todayStr, threshold);
              const isPaying =
                payMut.isPending &&
                (payMut.variables as any)?.paymentId === p.id;

              return (
                <div key={p.id} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-text-primary flex items-center gap-2 flex-wrap">
                      <span className="truncate">{p.bill?.name ?? "—"}</span>
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
                            {formatDate(p.due_date)}
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
                            {status === "overdue"
                              ? "Overdue"
                              : status === "due_soon"
                              ? "Due Soon"
                              : "Upcoming"}
                          </span>
                        </>
                      ) : (
                        <>
                          Due: {formatDate(p.due_date)}
                          {p.paid_at && (
                            <span className="ml-2 text-success">
                              · Paid {formatDate(new Date(p.paid_at * 1000).toISOString().split("T")[0])}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-5 shrink-0">
                    <span className="text-[15px] font-mono font-semibold text-text-primary">
                      {formatCents(p.amount_cents, p.bill?.currency ?? "USD")}
                    </span>
                    {!isSettled && (
                      <Button
                        variant="secondary"
                        size="small"
                        disabled={isPaying}
                        onClick={() => handlePay(p.id, p.bill?.name ?? "Bill")}
                      >
                        {isPaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Pay"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {payingPayment && (
        <PayPaymentModal
          billName={payingPayment.name}
          onConfirm={handlePayConfirm}
          onClose={() => setPayingPayment(null)}
          isSubmitting={payMut.isPending}
        />
      )}

    </div>
  );
}
