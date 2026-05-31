import { Loader2, Plus, Trash2 } from "lucide-react";
import { useAppCtx } from "../context/AppContext";
import { useBills, useDeleteBill } from "../api/queries";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { Tooltip } from "../components/Tooltip";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function recurrenceLabel(bill: { recurrence: any }): string {
  const r = bill.recurrence;
  if (r.type === "monthly") return `Monthly on day ${r.monthly.day}`;
  if (r.type === "yearly") return `Yearly on ${r.yearly.month}/${r.yearly.day}`;
  if (r.type === "interval") return `Every ${r.interval.every} ${r.interval.unit}`;
  return "—";
}

export function SubscriptionsView() {
  const { currentAccount, openAddModal, notify } = useAppCtx();

  const billsQuery = useBills(currentAccount?.id);
  const bills = billsQuery.data ?? [];

  const deleteBillMut = useDeleteBill();

  function handleDelete(id: string, name: string) {
    if (!currentAccount) return;
    if (!confirm(`Stop tracking "${name}"? This cannot be undone.`)) return;
    deleteBillMut.mutate(
      { id, accountId: currentAccount.id },
      {
        onSuccess: () => notify(`"${name}" removed.`, "success"),
        onError: (err: any) => notify(err.message ?? "Failed to delete.", "error"),
      }
    );
  }

  if (!currentAccount) {
    return (
      <div className="py-20 text-center text-text-secondary font-semibold">
        Select an account to view subscriptions.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-[20px] text-text-primary">All Subscriptions</h3>
        <Button variant="primary" size="small" onClick={openAddModal} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Subscription
        </Button>
      </div>

      <Card hoverable={false}>
        {billsQuery.isPending ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : bills.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[15px] font-semibold text-text-secondary mb-4">
              No subscriptions yet. Add one to start tracking.
            </p>
            <Button variant="primary" size="small" onClick={openAddModal} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Subscription
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border-warm">
            {bills.map((bill) => (
              <div key={bill.id} className="py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-text-primary flex items-center gap-2.5 flex-wrap">
                    <span className="truncate">{bill.name}</span>
                    <Chip variant="status" severity={bill.active ? "success" : "error"}>
                      {bill.active ? "Active" : "Inactive"}
                    </Chip>
                  </div>
                  <p className="text-[13px] text-text-secondary font-medium mt-0.5">
                    {recurrenceLabel(bill)}
                    {bill.notes && <span className="text-neutral-muted"> · {bill.notes}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-5 shrink-0">
                  <div className="text-right">
                    <span className="text-[15px] font-mono font-semibold text-text-primary block">
                      {formatCents(bill.amount_cents)}
                    </span>
                    <span className="text-[11px] text-text-secondary font-bold uppercase tracking-wider block mt-0.5">
                      {bill.currency}
                    </span>
                  </div>
                  <Tooltip content="Delete subscription">
                    <Button
                      variant="destructive"
                      size="small"
                      onClick={() => handleDelete(bill.id, bill.name)}
                      disabled={deleteBillMut.isPending && (deleteBillMut.variables as any)?.id === bill.id}
                      className="!w-8 !h-8 !p-0"
                      aria-label={`Delete ${bill.name}`}
                    >
                      {deleteBillMut.isPending && (deleteBillMut.variables as any)?.id === bill.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
