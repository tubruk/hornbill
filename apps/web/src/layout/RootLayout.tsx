import { useEffect } from "react";
import { Outlet, useLocation } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useAppCtx } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { AuthView } from "../views/AuthView";
import {
  useAccounts,
  useCreateAccount,
  useBills,
  usePayments,
  useCreateBill,
  qk,
} from "../api/queries";
import { fetchBills } from "../api/client";
import { Sidebar } from "./Sidebar";
import { AddBillModal } from "../components/AddBillModal";
import { ToastStack } from "../components/ToastStack";

// Page titles by route
const ROUTE_META: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Dashboard",
    subtitle: "A unified overview of your recurring bills and active subscriptions.",
  },
  "/bills": {
    title: "Bills",
    subtitle: "Manage recurring bills, services, and subscription plans.",
  },
  "/payments": {
    title: "Payments",
    subtitle: "Record, track, and settle your recurring bill payments.",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Configure system settings, databases, and synchronisation parameters.",
  },
};

export function RootLayout() {
  const { token, email, logout } = useAuth();
  const { currentAccount, setCurrentAccount, toasts, notify, dismissToast, showAddModal, closeAddModal } = useAppCtx();
  const location = useLocation();
  const qc = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────

  const accountsQuery = useAccounts({ enabled: !!token });
  const accounts = accountsQuery.data ?? [];
  const isApiConnected = !accountsQuery.isError;

  const billsQuery = useBills(currentAccount?.id);
  const bills = billsQuery.data;

  const paymentsQuery = usePayments(currentAccount?.id, bills);

  // ── Auto-select first account once loaded ───────────────────────────────

  useEffect(() => {
    if (token && !currentAccount && accounts.length > 0) {
      setCurrentAccount(accounts[0]);
    }
  }, [accounts, currentAccount, setCurrentAccount, token]);

  const createAccountMut = useCreateAccount();

  // ── Handlers ─────────────────────────────────────────────────────────────

  const createBillMut = useCreateBill();

  async function handleCreateBill(payload: Parameters<typeof createBillMut.mutateAsync>[0]) {
    await createBillMut.mutateAsync(payload, {
      onSuccess: () => {
        closeAddModal();
        notify("Bill added successfully.", "success");
      },
      onError: (err: any) => {
        notify(err.message ?? "Failed to add bill.", "error");
      },
    });
  }

  function handleSelectAccount(acc: Parameters<typeof setCurrentAccount>[0]) {
    setCurrentAccount(acc);
    // Prefetch bills for the new account so the view loads instantly on switch
    if (acc) {
      qc.prefetchQuery({
        queryKey: qk.bills(acc.id),
        queryFn: () => fetchBills(acc.id),
      });
    }
  }

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: qk.bills(currentAccount?.id) });
    qc.invalidateQueries({ queryKey: qk.payments(currentAccount?.id) });
    qc.invalidateQueries({ queryKey: qk.accounts() });
  }

  if (!token) {
    return <AuthView />;
  }

  // ── Route metadata ────────────────────────────────────────────────────────

  const meta = ROUTE_META[location.pathname] ?? ROUTE_META["/"];
  const isRefreshing = billsQuery.isFetching || paymentsQuery.isFetching || accountsQuery.isFetching;
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-background-warm text-text-primary font-body flex flex-col md:flex-row">

      {/* ── Sidebar ───────────────────────────────────────── */}
      <Sidebar
        accounts={accounts}
        currentAccount={currentAccount}
        isApiConnected={isApiConnected}
        isLoadingAccounts={accountsQuery.isPending}
        onSelectAccount={handleSelectAccount}
        onCreateAccount={(name) => {
          createAccountMut.mutate(name, {
            onSuccess: (newAcc) => {
              setCurrentAccount(newAcc);
              notify(`Account "${name}" created.`, "success");
            },
            onError: () => notify("Failed to create account.", "error"),
          });
        }}
        isCreatingAccount={createAccountMut.isPending}
        email={email}
        onLogout={logout}
      />

      {/* ── Main workspace ────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto py-10 px-6 md:px-12 flex flex-col">
        <div className="max-w-[1200px] w-full mx-auto flex flex-col flex-1 gap-8">

          {/* Page header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-border-warm">
            <div>
              <h2 className="font-display font-bold text-[28px] text-text-primary leading-tight mb-1">
                {meta.title}
              </h2>
              <p className="text-[14px] text-text-secondary font-medium">
                {meta.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[12px] font-semibold px-3 py-1.5 rounded-sm bg-surface-warm border border-border-warm text-text-secondary font-mono select-none">
                {todayStr}
              </span>
              <button
                onClick={handleRefresh}
                className="p-2 border border-border-warm bg-surface-warm rounded-sm transition-colors hover:bg-surface-raised cursor-pointer text-text-secondary"
                title="Refresh data"
                aria-label="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 transition-transform ${isRefreshing ? "animate-spin text-primary" : ""}`} />
              </button>
            </div>
          </div>

          {/* No-account loading state */}
          {accountsQuery.isPending && (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-[16px] text-text-secondary font-semibold">Loading your workspace…</p>
            </div>
          )}

          {/* API error banner (only if truly unreachable) */}
          {accountsQuery.isError && (
            <div className="bg-[#FEF3C7] border border-[#FCD34D] border-l-4 border-l-warning rounded-sm px-4 py-3 text-[14px] font-semibold text-[#92400E] animate-ember">
              ⚠ API is unreachable — showing mock data for preview.
            </div>
          )}

          {/* Route content */}
          {!accountsQuery.isPending && (
            <div className="flex-1 animate-fadeIn">
              <Outlet />
            </div>
          )}

        </div>
      </main>

      {/* ── Add Bill Modal ────────────────────────────────── */}
      {showAddModal && currentAccount && (
        <AddBillModal
          accountId={currentAccount.id}
          accountThreshold={currentAccount.upcoming_threshold_days}
          onSubmit={handleCreateBill}
          onClose={closeAddModal}
          isSubmitting={createBillMut.isPending}
        />
      )}

      {/* ── Toast notifications ───────────────────────────── */}
      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
      />
    </div>
  );
}
