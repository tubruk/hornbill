import { useState } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useAppCtx } from "../context/AppContext";
import { useBills, usePayments, usePayPayment, useUpdatePayment, useDeletePayment, usePayPeriod, type EnrichedPayment } from "../api/queries";
import { PayPaymentModal } from "../components/PayPaymentModal";
import { Card } from "../components/Card";
import { PaymentRow } from "../components/PaymentRow";
import { BillRowSkeleton } from "../components/Skeleton";
import { DEFAULT_UPCOMING_THRESHOLD_DAYS } from "@hornbill/core";

type Filter = "unpaid" | "settled";

export function PaymentsView() {
  const { currentAccount, notify } = useAppCtx();
  const [payingPayment, setPayingPayment] = useState<{
    id: string;
    name: string;
    dueDate: string;
    isUpcoming: boolean;
    amountCents: number;
    currency: string;
    notes: string | null;
  } | null>(null);
  const [editingPayment, setEditingPayment] = useState<{
    id: string;
    billName: string;
    dueDate: string;
    amountCents: number;
    currency: string;
    paidAtDate: string | null;
    notes: string;
  } | null>(null);
  const todayStr = new Date().toISOString().split("T")[0];

  const search = useSearch({ from: "/payments" });
  const navigate = useNavigate({ from: "/payments" });
  const billId = search.billId;
  const filter = search.filter || "unpaid";

  const setFilter = (newFilter: Filter) => {
    navigate({
      search: (prev) => ({
        ...prev,
        filter: newFilter === "unpaid" ? undefined : newFilter,
        billId: newFilter === "settled" ? prev.billId : undefined,
      }),
    });
  };

  const billsQuery = useBills(currentAccount?.id);
  const paymentsQuery = usePayments(currentAccount?.id, billsQuery.data);
  const payments = paymentsQuery.data ?? [];

  const [paydayCycleFilter, setPaydayCycleFilter] = useState<"current_cycle" | "all">("current_cycle");
  const payPeriodQuery = usePayPeriod(currentAccount?.id, undefined, { enabled: !!currentAccount?.payday_config?.enabled });

  const payMut = usePayPayment();
  const updateMut = useUpdatePayment();
  const deleteMut = useDeletePayment();

  const displayed = payments
    .filter((p) => {
      if (billId && p.bill_id !== billId) return false;

      if (currentAccount?.payday_config?.enabled && paydayCycleFilter === "current_cycle" && payPeriodQuery.data) {
        const { start_date, end_date } = payPeriodQuery.data.bounds;
        const isCurrentCycle = p.due_date >= start_date && p.due_date <= end_date;
        const isOverdueUnpaid = p.due_date < start_date && !p.paid_at;
        if (!isCurrentCycle && !isOverdueUnpaid) return false;
      }

      const isSettled = !!p.paid_at;

      if (filter === "unpaid") {
        return !isSettled;
      }
      if (filter === "settled") {
        return isSettled;
      }
      return true;
    })
    .sort((a, b) => {
      if (filter === "settled") {
        return b.due_date.localeCompare(a.due_date);
      }
      return a.due_date.localeCompare(b.due_date);
    });

  function handlePay(payment: EnrichedPayment, isUpcoming: boolean) {
    setPayingPayment({
      id: payment.id,
      name: payment.bill?.name ?? "Bill",
      dueDate: payment.due_date,
      isUpcoming,
      amountCents: payment.bill?.amount_cents ?? payment.amount_cents,
      currency: payment.bill?.currency ?? "USD",
      notes: payment.notes || null,
    });
  }

  async function handlePayConfirm(amountCents: number, paidAtDate?: string, _dueDate?: string, notes?: string) {
    if (!payingPayment || !currentAccount) return;
    await payMut.mutateAsync(
      { paymentId: payingPayment.id, accountId: currentAccount.id, paidAt: paidAtDate, amountCents, notes },
      {
        onSuccess: () => {
          notify(`"${payingPayment.name}" marked as paid.`, "success");
          setPayingPayment(null);
        },
        onError: (err: unknown) => notify(err instanceof Error ? err.message : "Failed to mark as paid.", "error"),
      }
    );
  }

  function handleEdit(payment: EnrichedPayment) {
    const paidAtDate = payment.paid_at
      ? new Date(payment.paid_at * 1000).toISOString().split("T")[0]
      : null;
    setEditingPayment({
      id: payment.id,
      billName: payment.bill?.name ?? "Bill",
      dueDate: payment.due_date,
      amountCents: payment.amount_cents,
      currency: payment.bill?.currency ?? "USD",
      paidAtDate,
      notes: payment.notes || "",
    });
  }

  async function handleEditConfirm(amountCents: number, paidAtDate?: string, dueDate?: string, notes?: string) {
    if (!editingPayment || !currentAccount) return;
    await updateMut.mutateAsync(
      {
        id: editingPayment.id,
        accountId: currentAccount.id,
        updates: {
          amount_cents: amountCents,
          paid_at: paidAtDate,
          due_date: dueDate,
          notes: notes || null,
        },
      },
      {
        onSuccess: () => {
          notify(`Payment for "${editingPayment.billName}" updated.`, "success");
          setEditingPayment(null);
        },
        onError: (err: unknown) => notify(err instanceof Error ? err.message : "Failed to update payment.", "error"),
      }
    );
  }

  async function handleEditDelete() {
    if (!editingPayment || !currentAccount) return;
    if (!window.confirm("Are you sure you want to delete this payment record? This cannot be undone.")) {
      return;
    }
    await deleteMut.mutateAsync(
      { id: editingPayment.id, accountId: currentAccount.id },
      {
        onSuccess: () => {
          notify(`Payment record deleted.`, "success");
          setEditingPayment(null);
        },
        onError: (err: unknown) => notify(err instanceof Error ? err.message : "Failed to delete payment.", "error"),
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

          {currentAccount?.payday_config?.enabled && (
            <div className="flex bg-surface-raised border border-border-warm p-0.5 rounded-full shrink-0">
              <button
                onClick={() => setPaydayCycleFilter("current_cycle")}
                className={`text-[12px] font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                  paydayCycleFilter === "current_cycle"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-secondary hover:bg-stone-300/40 hover:text-text-primary"
                }`}
              >
                Payday Cycle
              </button>
              <button
                onClick={() => setPaydayCycleFilter("all")}
                className={`text-[12px] font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                  paydayCycleFilter === "all"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-secondary hover:bg-stone-300/40 hover:text-text-primary"
                }`}
              >
                All Dates
              </button>
            </div>
          )}

          {/* Bill filter selector */}
          {filter === "settled" && (
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
          )}
        </div>

        {/* Clear Filter button */}
        {filter === "settled" && billId && (
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
          <div className="divide-y divide-border-warm">
            <BillRowSkeleton />
            <BillRowSkeleton />
            <BillRowSkeleton />
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-16 text-center text-[15px] text-text-secondary font-semibold">
            No {filter === "unpaid" ? "active" : "past"} payments found.
          </div>
        ) : (
          <div className="divide-y divide-border-warm">
            {displayed.map((p) => {
              const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
              const isPaying = payMut.isPending && payMut.variables?.paymentId === p.id;

              return (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  todayStr={todayStr}
                  upcomingThreshold={threshold}
                  isPaying={isPaying}
                  onPay={handlePay}
                  onEdit={handleEdit}
                />
              );
            })}
          </div>
        )}
      </Card>

      {payingPayment && (
        <PayPaymentModal
          billName={payingPayment.name}
          dueDate={payingPayment.dueDate}
          isUpcoming={payingPayment.isUpcoming}
          amountCents={payingPayment.amountCents}
          currency={payingPayment.currency}
          initialNotes={payingPayment.notes}
          onConfirm={handlePayConfirm}
          onClose={() => setPayingPayment(null)}
          isSubmitting={payMut.isPending}
        />
      )}

      {editingPayment && (
        <PayPaymentModal
          billName={editingPayment.billName}
          dueDate={editingPayment.dueDate}
          isUpcoming={false}
          amountCents={editingPayment.amountCents}
          currency={editingPayment.currency}
          isEditing={true}
          initialNotes={editingPayment.notes}
          paidAtDate={editingPayment.paidAtDate}
          onConfirm={handleEditConfirm}
          onClose={() => setEditingPayment(null)}
          onDelete={handleEditDelete}
          isSubmitting={updateMut.isPending || deleteMut.isPending}
        />
      )}

    </div>
  );
}
