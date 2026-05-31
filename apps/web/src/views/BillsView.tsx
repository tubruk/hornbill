import { useState } from "react";
import { Loader2, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw, History, Edit2, MoreVertical } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAppCtx } from "../context/AppContext";
import { useBills, useUpdateBill, useDeleteBill } from "../api/queries";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { Tooltip } from "../components/Tooltip";
import { AddBillModal } from "../components/AddBillModal";
import type { Bill } from "@hornbill/core";

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── BillsView ──────────────────────────────────────────────────────────────

export function BillsView() {
  const { currentAccount, openAddModal, notify } = useAppCtx();
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // ── Queries & mutations ────────────────────────────────────────────────

  const billsQuery   = useBills(currentAccount?.id);
  const bills        = billsQuery.data ?? [];
  const updateBillMut = useUpdateBill();
  const deleteBillMut = useDeleteBill();

  // ── Handlers ───────────────────────────────────────────────────────────

  function handleToggleActive(bill: Bill) {
    if (!currentAccount) return;
    const next = !bill.active;
    updateBillMut.mutate(
      { id: bill.id, accountId: currentAccount.id, updates: { active: next } },
      {
        onSuccess: () =>
          notify(
            `"${bill.name}" ${next ? "activated" : "deactivated"}.`,
            "success"
          ),
        onError: (err: any) =>
          notify(err.message ?? "Failed to update bill.", "error"),
      }
    );
  }

  function handleDelete(id: string, name: string) {
    if (!currentAccount) return;
    if (!confirm(`Stop tracking "${name}"? This cannot be undone.`)) return;
    deleteBillMut.mutate(
      { id, accountId: currentAccount.id },
      {
        onSuccess: () => notify(`"${name}" removed.`, "success"),
        onError: (err: any) =>
          notify(err.message ?? "Failed to delete.", "error"),
      }
    );
  }

  // ── Guards ─────────────────────────────────────────────────────────────

  if (!currentAccount) {
    return (
      <div className="py-20 text-center text-text-secondary font-semibold">
        Select an account to view bills.
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const activeBills   = bills.filter(b => b.active);
  const inactiveBills = bills.filter(b => !b.active);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-[20px] text-text-primary">
            All Bills
          </h3>
          {!billsQuery.isPending && (
            <p className="text-[13px] text-text-secondary font-medium mt-0.5">
              {activeBills.length} active · {inactiveBills.length} inactive
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Refresh">
            <button
              onClick={() => billsQuery.refetch()}
              disabled={billsQuery.isFetching}
              className="p-2 border border-border-warm bg-surface-warm rounded-sm text-text-secondary hover:bg-surface-raised transition-colors cursor-pointer disabled:opacity-50"
              aria-label="Refresh bills"
            >
              <RefreshCw className={`w-4 h-4 ${billsQuery.isFetching ? "animate-spin text-primary" : ""}`} />
            </button>
          </Tooltip>
          <Button variant="primary" size="small" onClick={openAddModal} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Bill
          </Button>
        </div>
      </div>

      {/* Bills list */}
      <Card hoverable={false}>
        {billsQuery.isPending ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>

        ) : billsQuery.isError ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-[15px] font-semibold text-error">
              Failed to load bills.
            </p>
            <Button variant="secondary" size="small" onClick={() => billsQuery.refetch()}>
              Retry
            </Button>
          </div>

        ) : bills.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[15px] font-semibold text-text-secondary mb-4">
              No bills yet. Add one to start tracking.
            </p>
            <Button variant="primary" size="small" onClick={openAddModal} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Bill
            </Button>
          </div>

        ) : (
          <div className="divide-y divide-border-warm">
            {bills.map((bill) => {
              const isToggling =
                updateBillMut.isPending &&
                (updateBillMut.variables as any)?.id === bill.id;
              const isDeleting =
                deleteBillMut.isPending &&
                (deleteBillMut.variables as any)?.id === bill.id;
              const isBusy = isToggling || isDeleting;

              return (
                <div
                  key={bill.id}
                  className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0 transition-opacity ${isBusy ? "opacity-60" : ""}`}
                >
                  {/* Bill info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-text-primary flex items-center gap-2.5 flex-wrap">
                      <span className={`truncate ${!bill.active ? "text-text-secondary line-through decoration-neutral-muted" : ""}`}>
                        {bill.name}
                      </span>
                      <Chip variant="status" severity={bill.active ? "success" : "error"} size="small">
                        {bill.active ? "Active" : "Inactive"}
                      </Chip>
                    </div>
                    {bill.notes && (
                      <p className="text-[13px] text-text-secondary font-medium mt-0.5">
                        {bill.notes}
                      </p>
                    )}
                  </div>

                  {/* Amount + actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t border-border-warm/40 sm:border-0">
                    <div className="text-left sm:text-right">
                      <span className="text-[15px] font-mono font-semibold text-text-primary block">
                        {formatCents(bill.amount_cents, bill.currency)}
                      </span>
                      <span className="text-[11px] text-text-secondary font-bold uppercase tracking-wider block mt-0.5">
                        {recurrenceLabel(bill)}
                      </span>
                    </div>

                    {/* More actions dropdown */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setActiveDropdown(activeDropdown === bill.id ? null : bill.id)}
                        disabled={isBusy}
                        className="p-1.5 rounded-sm text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors cursor-pointer"
                        aria-label="More actions"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>

                      {activeDropdown === bill.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setActiveDropdown(null)}
                          />
                          <div className="absolute right-0 mt-1.5 w-44 bg-surface-raised border border-border-warm rounded-sm shadow-md py-1.5 z-20 animate-slideDown">
                            <button
                              onClick={() => {
                                setActiveDropdown(null);
                                setEditingBill(bill);
                              }}
                              className="w-full text-left px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:bg-stone-300/40 flex items-center gap-2.5 cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4 text-text-secondary" />
                              Edit Bill
                            </button>

                            <Link
                              to="/payments"
                              search={{ billId: bill.id }}
                              onClick={() => setActiveDropdown(null)}
                              className="w-full text-left px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:bg-stone-300/40 flex items-center gap-2.5 cursor-pointer"
                            >
                              <History className="w-4 h-4 text-text-secondary" />
                              View History
                            </Link>

                            <button
                              onClick={() => {
                                setActiveDropdown(null);
                                handleToggleActive(bill);
                              }}
                              className="w-full text-left px-3.5 py-2 text-[13px] font-semibold text-text-primary hover:bg-stone-300/40 flex items-center gap-2.5 cursor-pointer"
                            >
                              {isToggling ? (
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              ) : bill.active ? (
                                <>
                                  <ToggleRight className="w-4 h-4 text-success" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="w-4 h-4 text-text-secondary" />
                                  Activate
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => {
                                setActiveDropdown(null);
                                handleDelete(bill.id, bill.name);
                              }}
                              className="w-full text-left px-3.5 py-2 text-[13px] font-semibold text-error hover:bg-red-50 flex items-center gap-2.5 cursor-pointer border-t border-border-warm mt-1.5 pt-1.5"
                            >
                              {isDeleting ? (
                                <Loader2 className="w-4 h-4 animate-spin text-error" />
                              ) : (
                                <Trash2 className="w-4 h-4 text-error" />
                              )}
                              Delete Bill
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
            } catch (err: any) {
              notify(err.message ?? "Failed to update bill.", "error");
            }
          }}
          onClose={() => setEditingBill(null)}
          isSubmitting={updateBillMut.isPending}
        />
      )}

    </div>
  );
}
