import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Plus,
  TrendingUp,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { useAppCtx } from "../context/AppContext";
import { useBills, usePayments, usePayPayment, type EnrichedPayment } from "../api/queries";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { Progress } from "../components/Progress";
import { getPaymentState, DEFAULT_UPCOMING_THRESHOLD_DAYS } from "@hornbill/core";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCents(cents: number, currency = "USD"): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency });
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Skeleton card for loading states ──────────────────────────────────────

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-surface-warm rounded-md border border-border-warm p-4 animate-pulse ${className}`}>
      <div className="h-3 w-28 bg-surface-raised rounded mb-3" />
      <div className="h-8 w-36 bg-surface-raised rounded" />
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export function DashboardView() {
  const { currentAccount, openAddModal, notify } = useAppCtx();
  const todayStr = new Date().toISOString().split("T")[0];

  const billsQuery = useBills(currentAccount?.id);
  const bills = billsQuery.data ?? [];

  const paymentsQuery = usePayments(currentAccount?.id, billsQuery.data);
  const payments = paymentsQuery.data ?? [];

  const payPaymentMut = usePayPayment();

  const {
    activeBills,
    monthlySpendingByCurrency,
    defaultCurrency,
    overduePayments,
    pendingPayments,
    paymentProgressRate,
    doneBillsCount,
  } = useMemo(() => {
    const activeBills = bills.filter((b) => b.active);

    // Group monthly cost by currency (approximate monthly cost with yearly bills divided by 12)
    const monthlySpendingByCurrency: Record<string, number> = {};
    activeBills.forEach((b) => {
      const cents = b.recurrence.type === "yearly" ? Math.round(b.amount_cents / 12) : b.amount_cents;
      monthlySpendingByCurrency[b.currency] = (monthlySpendingByCurrency[b.currency] || 0) + cents;
    });

    const defaultCurrency = bills[0]?.currency ?? "USD";

    // Group payments by bill_id to find the latest payment for each active bill
    const paymentsByBill = new Map<string, EnrichedPayment[]>();
    payments.forEach((p) => {
      const list = paymentsByBill.get(p.bill_id) || [];
      list.push(p);
      paymentsByBill.set(p.bill_id, list);
    });

    let doneBillsCount = 0;
    activeBills.forEach((b) => {
      const billPayments = paymentsByBill.get(b.id) || [];
      if (billPayments.length === 0) {
        return; // Treated as not done/pending
      }
      const latestPayment = billPayments.reduce((latest, current) => {
        return current.due_date > latest.due_date ? current : latest;
      });
      const threshold = b.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
      const { status } = getPaymentState(latestPayment, todayStr, threshold);
      if (status === "paid" || status === "paid_late" || status === "upcoming") {
        doneBillsCount++;
      }
    });

    const paymentProgressRate = activeBills.length > 0
      ? Math.round((doneBillsCount / activeBills.length) * 100)
      : 0;

    const unpaid = payments.filter((p) => !p.paid_at);
    const overduePayments: EnrichedPayment[] = [];
    const pendingPayments: EnrichedPayment[] = [];
    const upcomingPayments: EnrichedPayment[] = [];

    unpaid.forEach((p) => {
      const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
      const { status } = getPaymentState(p, todayStr, threshold);
      if (status === "overdue") {
        overduePayments.push(p);
      } else if (status === "due_soon") {
        pendingPayments.push(p);
      } else if (status === "upcoming") {
        upcomingPayments.push(p);
      }
    });

    overduePayments.sort((a, b) => a.due_date.localeCompare(b.due_date));
    pendingPayments.sort((a, b) => a.due_date.localeCompare(b.due_date));
    upcomingPayments.sort((a, b) => a.due_date.localeCompare(b.due_date));

    return {
      activeBills,
      monthlySpendingByCurrency,
      defaultCurrency,
      overduePayments,
      pendingPayments,
      paymentProgressRate,
      doneBillsCount,
    };
  }, [bills, payments, todayStr]);

  // ── Handle pay ───────────────────────────────────────────────────────────

  function handlePay(paymentId: string, billName: string) {
    if (!currentAccount) return;
    payPaymentMut.mutate(
      { paymentId, accountId: currentAccount.id },
      {
        onSuccess: () => notify(`"${billName}" marked as paid.`, "success"),
        onError: (err: any) =>
          notify(err.message ?? "Could not pay payment.", "error"),
      }
    );
  }

  const isLoading = billsQuery.isPending || paymentsQuery.isPending;

  // ── No-account guard ─────────────────────────────────────────────────────

  if (!currentAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-raised flex items-center justify-center">
          <Activity className="w-6 h-6 text-text-secondary" />
        </div>
        <p className="text-[16px] text-text-secondary font-semibold">
          Select or create an account to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Metric cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

        {isLoading ? (
          <>
            <SkeletonCard className="h-32" />
            <SkeletonCard className="h-32" />
            <SkeletonCard className="h-32" />
          </>
        ) : (
          <>
            {/* Monthly cost */}
            <Card hoverable className="flex flex-col justify-between min-h-[128px] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">
                  Monthly Cost
                </span>
                <TrendingUp className="w-4 h-4 text-text-secondary" />
              </div>
              <div className="mt-3 flex-1 flex flex-col justify-end">
                {Object.keys(monthlySpendingByCurrency).length === 0 ? (
                  <div className="font-display font-bold text-[30px] text-primary leading-none">
                    {formatCents(0, defaultCurrency)}
                  </div>
                ) : (
                  <div className="space-y-1.5 animate-ember">
                    {Object.entries(monthlySpendingByCurrency).map(([curr, cents]) => (
                      <div key={curr} className="font-display font-bold text-[28px] text-primary leading-none">
                        {formatCents(cents, curr)}
                      </div>
                    ))}
                  </div>
                )}
                <span className="text-[13px] font-semibold text-text-secondary mt-1 block">
                  / month estimated
                </span>
              </div>
            </Card>

            {/* Overdue */}
            <Card hoverable className="flex flex-col justify-between min-h-[128px] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">
                  Overdue Bills
                </span>
                <AlertTriangle className={`w-4 h-4 ${overduePayments.length > 0 ? "text-error" : "text-text-secondary"}`} />
              </div>
              <div className="font-display font-bold text-[30px] leading-none">
                {overduePayments.length > 0 ? (
                  <span className="text-error">{overduePayments.length} overdue</span>
                ) : (
                  <span className="text-success">All clear</span>
                )}
              </div>
            </Card>

            {/* Active bills */}
            <Card hoverable className="flex flex-col justify-between min-h-[128px] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">
                  Active Bills
                </span>
                <Activity className="w-4 h-4 text-text-secondary" />
              </div>
              <div>
                <div className="font-display font-bold text-[30px] text-text-primary leading-none">
                  {activeBills.length}
                  <span className="text-[14px] font-body font-semibold text-text-secondary ml-1.5">
                    active
                  </span>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* ── Overdue alert banner ─────────────────────────────── */}
      {!isLoading && overduePayments.length > 0 && (
        <Card
          hoverable={false}
          className="border-l-4 border-l-error bg-[#FEF2F2] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 animate-ember"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-error mt-0.5 shrink-0" />
            <div>
              <h3 className="font-display font-bold text-[18px] text-text-primary">
                Attention Required
              </h3>
              <p className="text-[14px] text-text-secondary font-semibold mt-0.5">
                {overduePayments.length} bill{overduePayments.length > 1 ? "s are" : " is"} overdue. Review and pay to stay on track.
              </p>
            </div>
          </div>
          <Link to="/payments">
            <Button variant="secondary" size="small" className="shrink-0">
              View Payments
            </Button>
          </Link>
        </Card>
      )}

      {/* ── Payment progress ──────────────────────────────── */}
      {!isLoading && activeBills.length > 0 && paymentProgressRate < 100 && (
        <Card hoverable={false} className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-[18px] text-text-primary">
              Payment Progress
            </h3>
            <span className="text-[13px] font-semibold text-text-secondary">
              {doneBillsCount} of {activeBills.length} bills paid
            </span>
          </div>
          <Progress value={paymentProgressRate} label="Overall payment progress" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-[13px] font-semibold">
            <span className="flex items-center gap-1.5 text-warning">
              <Clock className="w-4 h-4" />
              {pendingPayments.length} Due Soon
            </span>
            {overduePayments.length > 0 && (
              <span className="flex items-center gap-1.5 text-error">
                <AlertTriangle className="w-4 h-4" />
                {overduePayments.length} Overdue
              </span>
            )}
          </div>
        </Card>
      )}

      {/* ── Main grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">

        {/* Upcoming / urgent bills (left, 2-col) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-[20px] text-text-primary">
              Urgent Bills
            </h3>
            <Link to="/payments">
              <button className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer">
                View all <ChevronRight className="w-4 h-4" />
              </button>
            </Link>
          </div>

          <Card hoverable={false} className="divide-y divide-border-warm">
            {isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : overduePayments.length === 0 && pendingPayments.length === 0 ? (
              <div className="py-14 text-center">
                <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
                <p className="text-[15px] font-semibold text-text-secondary">
                  All bills are up to date.
                </p>
              </div>
            ) : (
              // Show overdue first, then pending, capped at 5
              [...overduePayments, ...pendingPayments].slice(0, 5).map((p) => {
                const threshold = p.bill?.upcoming_threshold_days ?? currentAccount?.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS;
                const { status } = getPaymentState(p, todayStr, threshold);
                const isPaying =
                  payPaymentMut.isPending &&
                  (payPaymentMut.variables as any)?.paymentId === p.id;

                return (
                  <div
                    key={p.id}
                    className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold text-text-primary flex items-center gap-2.5 flex-wrap">
                        <span className="truncate">{p.bill?.name ?? "—"}</span>
                        {status === "overdue" ? (
                          <Chip variant="status" severity="error">Overdue</Chip>
                        ) : status === "due_soon" ? (
                          <Chip variant="status" severity="warning">Due Soon</Chip>
                        ) : (
                          <Chip variant="status" severity="info">Upcoming</Chip>
                        )}
                      </div>
                      <span className="text-[12px] text-text-secondary font-mono mt-0.5 block">
                        Due: {formatDate(p.due_date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-[15px] font-mono font-semibold text-text-primary">
                        {formatCents(p.amount_cents, p.bill?.currency ?? "USD")}
                      </span>
                      <Button
                        variant="secondary"
                        size="small"
                        disabled={isPaying}
                        onClick={() => handlePay(p.id, p.bill?.name ?? "Bill")}
                      >
                        {isPaying ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Pay"
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        </div>

        {/* Quick actions (right, 1-col) */}
        <div className="space-y-4">
          <h3 className="font-display font-bold text-[20px] text-text-primary">
            Quick Actions
          </h3>
          <Card hoverable={false} className="flex flex-col gap-4 p-5">
            <div>
              <h4 className="font-display font-semibold text-[16px] text-text-primary mb-1.5">
                Add Bill
              </h4>
              <p className="text-[14px] text-text-secondary leading-relaxed font-medium">
                Track a new recurring bill, SaaS license, or utility expense.
              </p>
            </div>
            <div className="pt-4 border-t border-border-warm">
              <Button
                variant="primary"
                size="medium"
                onClick={openAddModal}
                className="w-full gap-2"
                disabled={!currentAccount}
              >
                <Plus className="w-4 h-4" />
                Add Bill
              </Button>
            </div>
          </Card>

          {/* Account summary card */}
          {currentAccount && !isLoading && (
            <Card hoverable={false} className="p-5 space-y-3">
              <h4 className="font-display font-semibold text-[15px] text-text-primary">
                Account Overview
              </h4>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-text-secondary font-semibold">Account</span>
                  <span className="text-text-primary font-semibold truncate max-w-[140px] text-right">{currentAccount.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary font-semibold">Active Bills</span>
                  <span className="text-text-primary font-semibold">{activeBills.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary font-semibold">Total Payments</span>
                  <span className="text-text-primary font-semibold">{payments.length}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-text-secondary font-semibold">Monthly est.</span>
                  <div className="text-right space-y-1">
                    {Object.keys(monthlySpendingByCurrency).length === 0 ? (
                      <span className="text-primary font-semibold font-mono">{formatCents(0, defaultCurrency)}</span>
                    ) : (
                      Object.entries(monthlySpendingByCurrency).map(([curr, cents]) => (
                        <div key={curr} className="text-primary font-semibold font-mono">
                          {formatCents(cents, curr)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}
