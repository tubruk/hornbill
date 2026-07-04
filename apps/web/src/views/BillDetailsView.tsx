import { useState } from "react";
import { useParams, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, Edit2, Trash2, ToggleLeft, ToggleRight, Loader2, CreditCard } from "lucide-react";
import { useAppCtx } from "../context/AppContext";
import {
  useBills,
  usePayments,
  useUpdateBill,
  useDeleteBill,
  useCreatePayment,
  usePayPayment,
  useUpdatePayment,
  useDeletePayment,
  type EnrichedPayment
} from "../api/queries";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { AddBillModal } from "../components/AddBillModal";
import { PayPaymentModal } from "../components/PayPaymentModal";
import { PaymentRow } from "../components/PaymentRow";
import { BillRowSkeleton } from "../components/Skeleton";
import { DEFAULT_UPCOMING_THRESHOLD_DAYS, type Bill } from "@hornbill/core";

function formatCents(cents: number, currency = "USD"): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency });
}

function recurrenceLabel(bill: Bill): string {
  const r = bill.recurrence;
  if (r.type === "monthly")  return `Monthly on day ${r.monthly.day}`;
  if (r.type === "yearly")   return `Yearly on ${r.yearly.month}/${r.yearly.day}`;
  if (r.type === "interval") return `Every ${r.interval.every} ${r.interval.unit}`;
  return "—";
}

export function BillDetailsView() {
  const { currentAccount, notify } = useAppCtx();
  const { billId } = useParams({ from: "/bills/$billId" });
  const navigate = useNavigate();

  // Modals / Editing state
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [recordingPaymentBill, setRecordingPaymentBill] = useState<Bill | null>(null);
  
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

  // Queries & Mutations
  const billsQuery = useBills(currentAccount?.id);
  const bills = billsQuery.data ?? [];
  const bill = bills.find((b) => b.id === billId);

  const paymentsQuery = usePayments(currentAccount?.id, billsQuery.data);
  const payments = paymentsQuery.data ?? [];

  // Mutations
  const updateBillMut = useUpdateBill();
  const deleteBillMut = useDeleteBill();
  const createPaymentMut = useCreatePayment();
  const payPaymentMut = usePayPayment();
  const updatePaymentMut = useUpdatePayment();
  const deletePaymentMut = useDeletePayment();

  // Actions
  function handleToggleActive() {
    if (!bill || !currentAccount) return;
    const next = !bill.active;
    updateBillMut.mutate(
      { id: bill.id, accountId: currentAccount.id, updates: { active: next } },
      {
        onSuccess: () =>
          notify(
            `"${bill.name}" ${next ? "activated" : "deactivated"}.`,
            "success"
          ),
        onError: (err: unknown) =>
          notify(err instanceof Error ? err.message : "Failed to update bill.", "error"),
      }
    );
  }

  function handleDeleteBill() {
    if (!bill || !currentAccount) return;
    if (!confirm(`Stop tracking "${bill.name}"? This cannot be undone.`)) return;
    deleteBillMut.mutate(
      { id: bill.id, accountId: currentAccount.id },
      {
        onSuccess: () => {
          notify(`"${bill.name}" removed.`, "success");
          navigate({ to: "/bills" });
        },
        onError: (err: unknown) =>
          notify(err instanceof Error ? err.message : "Failed to delete.", "error"),
      }
    );
  }

  async function handleRecordPaymentConfirm(amountCents: number, paidAtDate?: string, dueDate?: string) {
    if (!bill || !currentAccount) return;
    const paidAt = paidAtDate || new Date().toISOString().split("T")[0];
    const due = dueDate || paidAt;

    await createPaymentMut.mutateAsync(
      {
        payload: {
          bill_id: bill.id,
          due_date: due,
          amount_cents: amountCents,
          paid_at: paidAt,
          notes: null,
        },
        accountId: currentAccount.id,
      },
      {
        onSuccess: () => {
          notify(`Payment recorded for "${bill.name}".`, "success");
          setRecordingPaymentBill(null);
        },
        onError: (err: unknown) =>
          notify(err instanceof Error ? err.message : "Could not record payment.", "error"),
      }
    );
  }

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
    await payPaymentMut.mutateAsync(
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

  function handleEditPayment(payment: EnrichedPayment) {
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

  async function handleEditPaymentConfirm(amountCents: number, paidAtDate?: string, dueDate?: string, notes?: string) {
    if (!editingPayment || !currentAccount) return;
    await updatePaymentMut.mutateAsync(
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

  async function handleEditPaymentDelete() {
    if (!editingPayment || !currentAccount) return;
    if (!window.confirm("Are you sure you want to delete this payment record? This cannot be undone.")) {
      return;
    }
    await deletePaymentMut.mutateAsync(
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
        Select an account to view bill details.
      </div>
    );
  }

  if (billsQuery.isPending) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 bg-stone-200 animate-pulse rounded-md" />
        <Card hoverable={false}>
          <div className="space-y-4">
            <div className="h-8 w-64 bg-stone-200 animate-pulse rounded-md" />
            <div className="h-4 w-40 bg-stone-200 animate-pulse rounded-md" />
          </div>
        </Card>
        <Card hoverable={false}>
          <div className="divide-y divide-border-warm">
            <BillRowSkeleton />
            <BillRowSkeleton />
          </div>
        </Card>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="py-20 text-center space-y-4">
        <p className="text-[16px] text-text-secondary font-semibold">Bill not found.</p>
        <Link to="/bills" className="text-primary hover:text-primary-hover font-semibold underline">
          Back to all bills
        </Link>
      </div>
    );
  }

  // Filter payments to this bill, sorted descending by due date
  const billPayments = payments
    .filter((p) => p.bill_id === bill.id)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));

  const isTogglingActive = updateBillMut.isPending && updateBillMut.variables?.id === bill.id;
  const isDeletingBill = deleteBillMut.isPending && deleteBillMut.variables?.id === bill.id;
  const isBusy = isTogglingActive || isDeletingBill;

  return (
    <div className="space-y-6">
      {/* Back breadcrumb */}
      <div>
        <Link
          to="/bills"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text-secondary hover:text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Bills
        </Link>
      </div>

      {/* Bill Overview Card */}
      <Card hoverable={false} className={isBusy ? "opacity-60" : ""}>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3 flex-1 min-w-0">
            {/* Header info */}
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-display font-bold text-[24px] text-text-primary leading-tight truncate">
                {bill.name}
              </h2>
              <Chip variant="status" severity={bill.active ? "success" : "error"} size="small">
                {bill.active ? "Active" : "Inactive"}
              </Chip>
            </div>

            {/* Recurrence and amounts */}
            <div className="flex items-baseline gap-4">
              <span className="text-[28px] font-mono font-bold text-text-primary">
                {formatCents(bill.amount_cents, bill.currency)}
              </span>
              <span className="text-[13px] text-text-secondary font-bold uppercase tracking-wider">
                {recurrenceLabel(bill)}
              </span>
            </div>

            {bill.notes && (
              <div className="p-3 bg-surface-raised border border-border rounded-lg text-[14px] text-text-secondary italic max-w-2xl">
                {bill.notes}
              </div>
            )}
          </div>

          {/* Action Panel */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-auto">
            <Button
              variant="secondary"
              size="small"
              onClick={handleToggleActive}
              disabled={isBusy}
              className="gap-2.5 h-[34px] border-border-warm"
            >
              {isTogglingActive ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : bill.active ? (
                <>
                  <ToggleRight className="w-4 h-4 text-success" />
                  Active
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4 text-text-secondary" />
                  Inactive
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() => setEditingBill(bill)}
              disabled={isBusy}
              className="gap-2 h-[34px] border-border-warm"
            >
              <Edit2 className="w-4 h-4 text-text-secondary" />
              Edit
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={() => setRecordingPaymentBill(bill)}
              disabled={isBusy}
              className="gap-2 h-[34px]"
            >
              <CreditCard className="w-4 h-4" />
              Record Payment
            </Button>
            <Button
              variant="destructive"
              size="small"
              onClick={handleDeleteBill}
              disabled={isBusy}
              className="gap-2 h-[34px]"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </Card>

      {/* Payments History section */}
      <div className="space-y-3">
        <h3 className="font-display font-semibold text-[18px] text-text-primary">
          Payment History
        </h3>
        <Card hoverable={false}>
          {paymentsQuery.isPending ? (
            <div className="divide-y divide-border-warm">
              <BillRowSkeleton />
              <BillRowSkeleton />
            </div>
          ) : billPayments.length === 0 ? (
            <div className="py-12 text-center text-[15px] text-text-secondary font-semibold">
              No payment records found for this bill.
            </div>
          ) : (
            <div className="divide-y divide-border-warm">
              {billPayments.map((p) => {
                const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
                const isPaying = payPaymentMut.isPending && payPaymentMut.variables?.paymentId === p.id;
                return (
                  <PaymentRow
                    key={p.id}
                    payment={p}
                    todayStr={todayStr}
                    upcomingThreshold={threshold}
                    isPaying={isPaying}
                    onPay={handlePay}
                    onEdit={handleEditPayment}
                  />
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Add/Edit Bill Modal */}
      {editingBill && (
        <AddBillModal
          accountId={currentAccount.id}
          accountThreshold={currentAccount.upcoming_threshold_days}
          bill={editingBill}
          onSubmit={async (payload) => {
            try {
              await updateBillMut.mutateAsync({
                id: editingBill.id,
                accountId: currentAccount.id,
                updates: {
                  name: payload.name,
                  amount_cents: payload.amount_cents,
                  recurrence: payload.recurrence,
                  upcoming_threshold_days: payload.upcoming_threshold_days,
                  notes: payload.notes,
                },
              });
              setEditingBill(null);
              notify(`"${payload.name}" updated.`, "success");
            } catch (err: unknown) {
              notify(err instanceof Error ? err.message : "Failed to update bill.", "error");
            }
          }}
          onClose={() => setEditingBill(null)}
          isSubmitting={updateBillMut.isPending}
        />
      )}

      {/* Record Payment Modal */}
      {recordingPaymentBill && (
        <PayPaymentModal
          billName={recordingPaymentBill.name}
          dueDate={new Date().toISOString().split("T")[0]}
          isUpcoming={false}
          amountCents={recordingPaymentBill.amount_cents}
          currency={recordingPaymentBill.currency}
          isArbitrary={true}
          onConfirm={handleRecordPaymentConfirm}
          onClose={() => setRecordingPaymentBill(null)}
          isSubmitting={createPaymentMut.isPending}
        />
      )}

      {/* Pay Payment Modal */}
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
          isSubmitting={payPaymentMut.isPending}
        />
      )}

      {/* Edit Payment Modal */}
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
          onConfirm={handleEditPaymentConfirm}
          onClose={() => setEditingPayment(null)}
          onDelete={handleEditPaymentDelete}
          isSubmitting={updatePaymentMut.isPending || deletePaymentMut.isPending}
        />
      )}
    </div>
  );
}
