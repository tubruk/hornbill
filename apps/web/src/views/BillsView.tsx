import { Loader2, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";
import { useAppCtx } from "../context/AppContext";
import { useBills, useUpdateBill, useDeleteBill } from "../api/queries";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { Tooltip } from "../components/Tooltip";
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
                  className={`py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0 transition-opacity ${isBusy ? "opacity-60" : ""}`}
                >
                  {/* Bill info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-text-primary flex items-center gap-2.5 flex-wrap">
                      <span className={`truncate ${!bill.active ? "text-text-secondary line-through decoration-neutral-muted" : ""}`}>
                        {bill.name}
                      </span>
                      <Chip variant="status" severity={bill.active ? "success" : "error"}>
                        {bill.active ? "Active" : "Inactive"}
                      </Chip>
                    </div>
                    <p className="text-[13px] text-text-secondary font-medium mt-0.5">
                      {recurrenceLabel(bill)}
                      {bill.notes && (
                        <span className="text-neutral-muted"> · {bill.notes}</span>
                      )}
                    </p>
                  </div>

                  {/* Amount + actions */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <span className="text-[15px] font-mono font-semibold text-text-primary block">
                        {formatCents(bill.amount_cents, bill.currency)}
                      </span>
                      <span className="text-[11px] text-text-secondary font-bold uppercase tracking-wider block mt-0.5">
                        {bill.currency} · {bill.recurrence.type}
                      </span>
                    </div>

                    {/* Toggle active */}
                    <Tooltip content={bill.active ? "Deactivate bill" : "Activate bill"}>
                      <button
                        onClick={() => handleToggleActive(bill)}
                        disabled={isBusy}
                        aria-label={bill.active ? `Deactivate ${bill.name}` : `Activate ${bill.name}`}
                        className="p-1.5 rounded-sm text-text-secondary hover:text-primary hover:bg-surface-raised transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isToggling ? (
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        ) : bill.active ? (
                          <ToggleRight className="w-5 h-5 text-success" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-text-secondary" />
                        )}
                      </button>
                    </Tooltip>

                    {/* Delete */}
                    <Tooltip content="Delete bill">
                      <Button
                        variant="destructive"
                        size="small"
                        onClick={() => handleDelete(bill.id, bill.name)}
                        disabled={isBusy}
                        className="!w-8 !h-8 !p-0"
                        aria-label={`Delete ${bill.name}`}
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

    </div>
  );
}
