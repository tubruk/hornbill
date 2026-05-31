import { useState, useEffect, createContext, useContext } from "react";
import { 
  CreditCard, 
  RefreshCw,
  LayoutDashboard,
  Settings,
  ChevronDown,
  Trash2,
  Plus,
  Shield,
  Activity,
  Layers,
  CalendarDays,
  Sparkles,
  Info,
  ChevronRight
} from "lucide-react";
import type { Bill, Payment, Account } from "@hornbill/core";

// Reusable Ember Studio Components
import { Button } from "./components/Button";
import { Card } from "./components/Card";
import { Input } from "./components/Input";
import { Chip } from "./components/Chip";
import { Radio } from "./components/Radio";
import { Tooltip } from "./components/Tooltip";
import { Progress } from "./components/Progress";
import { Avatar } from "./components/Avatar";

import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  Link,
  useLocation,
} from "@tanstack/react-router";

// --- Curated Mock Data for Fallback ---

const MOCK_BILLS: Bill[] = [
  { id: "1", name: "Adobe Creative Cloud", amount_cents: 5499, currency: "USD", active: true, recurrence: { type: "monthly", monthly: { day: 15 } }, start_date: "2026-01-15", notes: "Design suite subscription", created_at: 0, updated_at: 0, account_id: "00000000-0000-0000-0000-000000000000", amount_type: "fixed" },
  { id: "2", name: "Figma Professional", amount_cents: 1500, currency: "USD", active: true, recurrence: { type: "monthly", monthly: { day: 8 } }, start_date: "2026-01-08", notes: "Team collaboration tool", created_at: 0, updated_at: 0, account_id: "00000000-0000-0000-0000-000000000000", amount_type: "fixed" },
  { id: "3", name: "Fontstand Library", amount_cents: 900, currency: "USD", active: true, recurrence: { type: "monthly", monthly: { day: 22 } }, start_date: "2026-01-22", notes: "Typography subscription", created_at: 0, updated_at: 0, account_id: "00000000-0000-0000-0000-000000000000", amount_type: "fixed" },
  { id: "4", name: "AWS Cloud Sandbox", amount_cents: 2900, currency: "USD", active: true, recurrence: { type: "monthly", monthly: { day: 1 } }, start_date: "2026-01-01", notes: "Portfolio hosting", created_at: 0, updated_at: 0, account_id: "00000000-0000-0000-0000-000000000000", amount_type: "fixed" }
];

const MOCK_PAYMENTS: (Payment & { bill?: { name: string } })[] = [
  { id: "p1", bill_id: "1", due_date: "2026-06-15", amount_cents: 5499, paid_at: null, created_at: 0, updated_at: 0, bill: { name: "Adobe Creative Cloud" } },
  { id: "p2", bill_id: "2", due_date: "2026-06-08", amount_cents: 1500, paid_at: null, created_at: 0, updated_at: 0, bill: { name: "Figma Professional" } },
  { id: "p3", bill_id: "3", due_date: "2026-05-22", amount_cents: 900, paid_at: null, created_at: 0, updated_at: 0, bill: { name: "Fontstand Library" } }, // Overdue
  { id: "p4", bill_id: "4", due_date: "2026-06-01", amount_cents: 2900, paid_at: 1717200000, created_at: 0, updated_at: 0, bill: { name: "AWS Cloud Sandbox" } } // Settled
];

interface AppState {
  bills: Bill[];
  setBills: React.Dispatch<React.SetStateAction<Bill[]>>;
  payments: (Payment & { bill?: { name: string } })[];
  setPayments: React.Dispatch<React.SetStateAction<(Payment & { bill?: { name: string } })[]>>;
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  currentAccount: Account | null;
  setCurrentAccount: React.Dispatch<React.SetStateAction<Account | null>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isApiConnected: boolean;
  setIsApiConnected: React.Dispatch<React.SetStateAction<boolean>>;
  notification: { type: "success" | "info" | "error"; text: string } | null;
  setNotification: React.Dispatch<React.SetStateAction<{ type: "success" | "info" | "error"; text: string } | null>>;
  isWorkspaceMenuOpen: boolean;
  setIsWorkspaceMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFilter: "all" | "pending" | "settled";
  setSelectedFilter: React.Dispatch<React.SetStateAction<"all" | "pending" | "settled">>;
  showAddModal: boolean;
  setShowAddModal: React.Dispatch<React.SetStateAction<boolean>>;
  formErrors: Record<string, string>;
  setFormErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  billName: string;
  setBillName: React.Dispatch<React.SetStateAction<string>>;
  billAmount: string;
  setBillAmount: React.Dispatch<React.SetStateAction<string>>;
  recurrenceType: "monthly" | "yearly" | "interval";
  setRecurrenceType: React.Dispatch<React.SetStateAction<"monthly" | "yearly" | "interval">>;
  monthlyDay: number;
  setMonthlyDay: React.Dispatch<React.SetStateAction<number>>;
  yearlyMonth: number;
  setYearlyMonth: React.Dispatch<React.SetStateAction<number>>;
  yearlyDay: number;
  setYearlyDay: React.Dispatch<React.SetStateAction<number>>;
  intervalEvery: number;
  setIntervalEvery: React.Dispatch<React.SetStateAction<number>>;
  intervalUnit: "days" | "weeks" | "months";
  setIntervalUnit: React.Dispatch<React.SetStateAction<"days" | "weeks" | "months">>;
  startDate: string;
  setStartDate: React.Dispatch<React.SetStateAction<string>>;
  billNotes: string;
  setBillNotes: React.Dispatch<React.SetStateAction<string>>;
  
  // Handlers & Helpers
  triggerNotification: (text: string, type?: "success" | "info" | "error") => void;
  loadData: () => Promise<void>;
  handlePay: (paymentId: string, name: string) => Promise<void>;
  handleCreateBill: (e: React.FormEvent) => Promise<void>;
  handleDeleteBill: (billId: string, name: string) => Promise<void>;
  triggerSyncJob: () => Promise<void>;
  resetForm: () => void;
  formatCents: (cents: number) => string;
  getFilteredPayments: () => (Payment & { bill?: { name: string } })[];
  todayStr: string;
  monthlySpendingCents: number;
  overduePayments: (Payment & { bill?: { name: string } })[];
  activeBills: Bill[];
  settleRate: number;
  unpaidPayments: (Payment & { bill?: { name: string } })[];
}

const AppStateContext = createContext<AppState | null>(null);

const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
};

// --- VIEW: DASHBOARD ---
function DashboardView() {
  const {
    formatCents,
    monthlySpendingCents,
    overduePayments,
    activeBills,
    settleRate,
    unpaidPayments,
    handlePay,
    setShowAddModal,
    todayStr,
  } = useAppState();

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Summary metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <Card hoverable={true} className="flex flex-col justify-between h-32">
          <div className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">Monthly Cost</div>
          <div className="font-display font-bold text-[28px] text-primary mt-1">
            {formatCents(monthlySpendingCents)}
            <span className="text-[14px] font-body font-semibold text-text-secondary ml-1">/ mo</span>
          </div>
        </Card>

        <Card hoverable={true} className="flex flex-col justify-between h-32">
          <div className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">Overdue Bills</div>
          <div className="font-display font-bold text-[28px] mt-1 text-text-primary">
            {overduePayments.length > 0 ? (
              <span className="text-error">{overduePayments.length} due</span>
            ) : (
              <span className="text-success">0 remaining</span>
            )}
          </div>
        </Card>

        <Card hoverable={true} className="flex flex-col justify-between h-32">
          <div className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">Active Subscriptions</div>
          <div className="font-display font-bold text-[28px] text-text-primary mt-1">
            {activeBills.length}
            <span className="text-[14px] font-body font-semibold text-text-secondary ml-1.5">active</span>
          </div>
        </Card>

      </div>

      {/* Amber Accent Highlight Card */}
      {overduePayments.length > 0 && (
        <Card className="border-l-[4px] border-l-error bg-surface-warm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-6">
          <div>
            <h3 className="font-display font-bold text-[20px] text-text-primary mb-1">Attention Required</h3>
            <p className="text-[14px] text-text-secondary font-semibold">
              You have {overduePayments.length} overdue bills. Please make payments to keep your accounts current.
            </p>
          </div>
          <Link to="/payments">
            <Button variant="secondary" size="small">
              Review Calendar
            </Button>
          </Link>
        </Card>
      )}

      {/* Progress metrics */}
      <Card hoverable={false} className="p-6">
        <Progress value={settleRate} label="Overall Payment Progress" />
      </Card>

      {/* Main Grid: Pending Action Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left side: urgent bills list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-[20px] text-text-primary">Urgent Bills Due</h3>
            <Link to="/payments">
              <Button variant="ghost" size="small" className="text-primary hover:text-primary-hover font-semibold">
                View All <ChevronRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </Link>
          </div>

          <Card hoverable={false}>
            {unpaidPayments.length === 0 ? (
              <div className="text-center py-10 text-text-secondary font-semibold">
                All bills have been paid.
              </div>
            ) : (
              <div className="divide-y divide-border-warm">
                {unpaidPayments.slice(0, 3).map((p) => {
                  const isOverdue = p.due_date < todayStr;
                  return (
                    <div key={p.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                      <div>
                        <div className="text-[16px] font-semibold text-text-primary flex items-center gap-2">
                          {p.bill?.name}
                          {isOverdue && <Chip variant="status" severity="error">Overdue</Chip>}
                        </div>
                        <span className="text-[12px] text-text-secondary font-mono mt-0.5 block">Due: {p.due_date}</span>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <span className="text-[16px] font-mono font-semibold text-text-primary">{formatCents(p.amount_cents)}</span>
                        <Button 
                          variant="secondary" 
                          size="small"
                          onClick={() => handlePay(p.id, p.bill?.name || "Task")}
                        >
                          Pay
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right side: CTAs */}
        <div className="space-y-4">
          <h3 className="font-display font-bold text-[20px] text-text-primary">Subscription Operations</h3>
          <Card hoverable={false} className="h-full flex flex-col justify-between">
            <div>
              <h4 className="font-display font-semibold text-[16px] text-text-primary mb-2">Add Subscription</h4>
              <p className="text-[14px] text-text-secondary leading-relaxed mb-6 font-medium">
                Add subscriptions, software licenses, or recurring utilities to trace your expenses.
              </p>
            </div>
            
            <div className="pt-4 border-t border-border-warm">
              <Button 
                variant="primary" 
                size="medium" 
                onClick={() => setShowAddModal(true)}
                className="w-full gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Subscription
              </Button>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}

// --- VIEW: SUBSCRIPTIONS ---
function SubscriptionsView() {
  const {
    bills,
    formatCents,
    handleDeleteBill,
    setShowAddModal,
  } = useAppState();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-[20px] text-text-primary">Subscriptions</h3>
        <Button variant="primary" size="small" onClick={() => setShowAddModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Subscription
        </Button>
      </div>

      <Card hoverable={false}>
        {bills.length === 0 ? (
          <div className="text-center py-16 text-text-secondary font-semibold">
            No active subscriptions configured. Press "Add Subscription" to start.
          </div>
        ) : (
          <div className="divide-y divide-border-warm">
            {bills.map((bill) => (
              <div key={bill.id} className="py-4 flex items-center justify-between first:pt-0 last:pb-0">
                <div>
                  <div className="text-[16px] font-semibold text-text-primary flex items-center gap-3">
                    {bill.name}
                    <Chip variant="status" severity={bill.active ? "success" : "error"}>
                      {bill.active ? "Active" : "Inactive"}
                    </Chip>
                  </div>
                  <p className="text-[14px] text-text-secondary font-medium mt-1">
                    {bill.recurrence.type === "monthly" && `Billed monthly on day ${bill.recurrence.monthly.day}`}
                    {bill.recurrence.type === "yearly" && `Billed yearly on ${bill.recurrence.yearly.month}/${bill.recurrence.yearly.day}`}
                    {bill.recurrence.type === "interval" && `Billed every ${bill.recurrence.interval.every} ${bill.recurrence.interval.unit}`}
                    {bill.notes && ` • "${bill.notes}"`}
                  </p>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-[16px] font-mono font-semibold text-text-primary block">{formatCents(bill.amount_cents)}</span>
                    <span className="text-[11px] text-text-secondary font-bold uppercase tracking-wider block mt-0.5">USD</span>
                  </div>
                  <Tooltip content="Delete subscription">
                    <Button
                      variant="destructive"
                      size="small"
                      onClick={() => handleDeleteBill(bill.id, bill.name)}
                      className="w-8 h-8 !p-0 font-semibold"
                    >
                      <Trash2 className="w-4 h-4 text-white mx-auto" />
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

// --- VIEW: BILLS & PAYMENTS ---
function PaymentsView() {
  const {
    selectedFilter,
    setSelectedFilter,
    getFilteredPayments,
    todayStr,
    formatCents,
    handlePay,
  } = useAppState();

  return (
    <div className="space-y-6 animate-fadeIn">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="font-display font-bold text-[20px] text-text-primary">Bills & Payments</h3>
        
        <div className="flex gap-1 bg-surface-warm border border-border-warm p-1 rounded-sm">
          <button 
            onClick={() => setSelectedFilter("all")}
            className={`text-[12px] font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-sm transition-colors cursor-pointer ${
              selectedFilter === "all" ? "bg-surface-raised text-primary" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            All
          </button>
          <button 
            onClick={() => setSelectedFilter("pending")}
            className={`text-[12px] font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-sm transition-colors cursor-pointer ${
              selectedFilter === "pending" ? "bg-surface-raised text-primary" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Pending
          </button>
          <button 
            onClick={() => setSelectedFilter("settled")}
            className={`text-[12px] font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-sm transition-colors cursor-pointer ${
              selectedFilter === "settled" ? "bg-surface-raised text-primary" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Paid
          </button>
        </div>
      </div>

      <Card hoverable={false}>
        {getFilteredPayments().length === 0 ? (
          <div className="text-center py-16 text-text-secondary font-semibold">
            No transactions registered under this filter.
          </div>
        ) : (
          <div className="divide-y divide-border-warm">
            {getFilteredPayments().map((p) => {
              const isSettled = !!p.paid_at;
              const isOverdue = !isSettled && p.due_date < todayStr;
              return (
                <div key={p.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                  <div>
                    <div className="text-[16px] font-semibold text-text-primary flex items-center gap-2">
                      {p.bill?.name}
                      {isSettled ? (
                        <Chip variant="status" severity="success">Paid</Chip>
                      ) : isOverdue ? (
                        <Chip variant="status" severity="error">Overdue</Chip>
                      ) : (
                        <Chip variant="status" severity="warning">Pending</Chip>
                      )}
                    </div>
                    <span className="text-[12px] text-text-secondary font-mono mt-0.5 block">
                      Due date: {p.due_date}
                      {p.paid_at && ` • Paid on ${new Date(p.paid_at * 1000).toLocaleDateString()}`}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <span className="text-[16px] font-mono font-semibold text-text-primary">{formatCents(p.amount_cents)}</span>
                    {!isSettled && (
                      <Button 
                        variant="secondary" 
                        size="small"
                        onClick={() => handlePay(p.id, p.bill?.name || "Bill")}
                      >
                        Pay
                      </Button>
                    )}
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

// --- VIEW: SETTINGS ---
function SettingsView() {
  const {
    triggerNotification,
    isApiConnected,
    triggerSyncJob,
  } = useAppState();

  return (
    <div className="space-y-6 animate-fadeIn">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Maintenance */}
        <Card hoverable={false}>
          <h4 className="font-display font-semibold text-[18px] text-text-primary mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Database Maintenance
          </h4>
          <p className="text-[14px] text-text-secondary leading-relaxed mb-6 font-medium">
            Resets database cache levels and clears recent transactions. SQLite data configurations will remain intact.
          </p>
          <div>
            <Button 
              variant="secondary" 
              size="medium"
              onClick={() => {
                if (confirm("Reset local workshop cache configurations?")) {
                  triggerNotification("Run 'make db-reset' locally in your shell terminal.", "info");
                }
              }}
            >
              Clear Local Cache
            </Button>
          </div>
        </Card>

        {/* API Details */}
        <Card hoverable={false}>
          <h4 className="font-display font-semibold text-[18px] text-text-primary mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            System Properties
          </h4>
          
          <div className="space-y-4 pt-2">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-text-secondary uppercase">API Gateway</span>
              <span className="px-3 py-2 rounded-sm bg-surface-raised border border-border-warm text-[14px] text-text-primary font-mono select-all">
                {isApiConnected ? "http://localhost:3000" : "Mock In-Memory Gateway"}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-text-secondary uppercase">Data Directory</span>
              <span className="px-3 py-2 rounded-sm bg-surface-raised border border-border-warm text-[14px] text-text-primary font-mono select-all">
                packages/db/traildepot/
              </span>
            </div>
          </div>
        </Card>

      </div>

      <Card hoverable={false} className="border border-border-warm bg-surface-warm p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <h4 className="font-display font-semibold text-[16px] text-text-primary mb-1">System Sync</h4>
          <p className="text-[14px] text-text-secondary font-medium">Manually trigger the billing cron synchronization immediately.</p>
        </div>
        <Button variant="primary" size="medium" onClick={triggerSyncJob}>
          Sync Now
        </Button>
      </Card>

    </div>
  );
}

// --- ROOT ROUTE LAYOUT ---
function RootLayout() {
  const {
    currentAccount,
    isWorkspaceMenuOpen,
    setIsWorkspaceMenuOpen,
    accounts,
    setCurrentAccount,
    todayStr,
    loading,
    loadData,
    notification,
    isApiConnected,
    showAddModal,
    setShowAddModal,
    billName,
    setBillName,
    billAmount,
    setBillAmount,
    startDate,
    setStartDate,
    billNotes,
    setBillNotes,
    recurrenceType,
    setRecurrenceType,
    monthlyDay,
    setMonthlyDay,
    yearlyMonth,
    setYearlyMonth,
    yearlyDay,
    setYearlyDay,
    intervalEvery,
    setIntervalEvery,
    intervalUnit,
    setIntervalUnit,
    formErrors,
    handleCreateBill,
    resetForm,
  } = useAppState();

  const location = useLocation();
  const activePath = location.pathname;

  let title = "Dashboard";
  let subtitle = "A unified overview of recurring bills and active subscriptions.";

  if (activePath === "/subscriptions") {
    title = "Subscriptions";
    subtitle = "Manage recurring bills, services, and subscription plans.";
  } else if (activePath === "/payments") {
    title = "Bills & Payments";
    subtitle = "Record, track, and pay your recurring bills.";
  } else if (activePath === "/settings") {
    title = "Settings";
    subtitle = "Configure system settings, databases, and synchronization parameters.";
  }

  return (
    <div className="min-h-screen bg-background-warm text-text-primary font-body flex flex-col md:flex-row">
      
      {/* --- SIDEBAR NAVIGATION (256px width) --- */}
      <aside className="w-full md:w-64 bg-background-warm border-b md:border-b-0 md:border-r border-border-warm flex flex-col z-20 shrink-0 select-none">
        
        {/* Workspace Brand / Profile */}
        <div className="p-6 border-b border-border-warm flex items-center justify-between md:block relative">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary text-white rounded-sm flex items-center justify-center font-display font-bold text-lg shadow-sm">
              H
            </div>
            <div>
              <h1 className="font-display font-bold text-[20px] text-text-primary tracking-tight leading-none">
                Hornbill
              </h1>
              <span className="text-[11px] font-semibold text-neutral-muted uppercase tracking-wider block mt-1">Default Account</span>
            </div>
          </div>

          {/* Workspace Switcher */}
          <div className="mt-6 relative w-full md:block">
            <button 
              onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
              className="w-full h-10 px-3 bg-surface-warm border border-border-warm rounded-sm text-left text-[14px] font-semibold text-text-primary flex items-center justify-between hover:bg-surface-raised transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                <Layers className="w-4 h-4 text-primary" />
                {currentAccount?.name || "Select Account"}
              </span>
              <ChevronDown className="w-4 h-4 text-text-secondary" />
            </button>

            {isWorkspaceMenuOpen && accounts.length > 1 && (
              <div className="absolute left-0 right-0 mt-2 p-1 bg-surface-warm border border-border-warm rounded-sm shadow-md z-30 space-y-1">
                {accounts.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      setCurrentAccount(ws);
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className={`w-full h-9 px-3 rounded-sm text-left text-[14px] font-semibold transition-colors cursor-pointer block ${
                      currentAccount?.id === ws.id 
                        ? "bg-surface-raised text-primary" 
                        : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                    }`}
                  >
                    {ws.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Nav Items with left terracotta stripe on active */}
        <nav className="p-4 space-y-1 flex-1 hidden md:block">
          <Link 
            to="/"
            activeProps={{ className: "bg-surface-raised text-primary border-l-2 border-primary" }}
            inactiveProps={{ className: "text-text-secondary hover:bg-surface-raised hover:text-text-primary" }}
            className="w-full h-10 px-3 rounded-sm text-left text-[14px] font-semibold flex items-center gap-3 transition-colors relative cursor-pointer"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          
          <Link 
            to="/subscriptions"
            activeProps={{ className: "bg-surface-raised text-primary border-l-2 border-primary" }}
            inactiveProps={{ className: "text-text-secondary hover:bg-surface-raised hover:text-text-primary" }}
            className="w-full h-10 px-3 rounded-sm text-left text-[14px] font-semibold flex items-center gap-3 transition-colors relative cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            Subscriptions
          </Link>

          <Link 
            to="/payments"
            activeProps={{ className: "bg-surface-raised text-primary border-l-2 border-primary" }}
            inactiveProps={{ className: "text-text-secondary hover:bg-surface-raised hover:text-text-primary" }}
            className="w-full h-10 px-3 rounded-sm text-left text-[14px] font-semibold flex items-center gap-3 transition-colors relative cursor-pointer"
          >
            <CalendarDays className="w-4 h-4" />
            Bills & Payments
          </Link>

          <Link 
            to="/settings"
            activeProps={{ className: "bg-surface-raised text-primary border-l-2 border-primary" }}
            inactiveProps={{ className: "text-text-secondary hover:bg-surface-raised hover:text-text-primary" }}
            className="w-full h-10 px-3 rounded-sm text-left text-[14px] font-semibold flex items-center gap-3 transition-colors relative cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
        </nav>

        {/* Sidebar Footer with Stacked Avatars */}
        <div className="p-6 border-t border-border-warm hidden md:block bg-surface-warm/40">
          
          {/* User profile with Avatar */}
          <div className="flex items-center gap-3 mb-4">
            <Avatar fallback="AK" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-text-primary truncate">Alexander K.</div>
              <span className="text-[11px] text-text-secondary uppercase tracking-wider block">Lead Artisan</span>
            </div>
          </div>

          {/* Connection Status indicator */}
          <div className="flex items-center justify-between text-[12px] font-semibold text-text-secondary">
            <span>Sync Status:</span>
            <span className={`inline-flex items-center gap-1.5 font-bold ${isApiConnected ? "text-success" : "text-warning"}`}>
              <span className={`w-2 h-2 rounded-full ${isApiConnected ? "bg-success" : "bg-warning"}`}></span>
              {isApiConnected ? "Connected" : "Offline Sandbox"}
            </span>
          </div>

        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden items-center justify-around border-t border-border-warm py-2.5 px-4 bg-surface-warm shadow-inner z-20">
          <Link 
            to="/" 
            activeProps={{ className: "text-primary" }}
            inactiveProps={{ className: "text-text-secondary" }}
            className="flex flex-col items-center gap-1 text-[12px] font-semibold"
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </Link>
          <Link 
            to="/subscriptions" 
            activeProps={{ className: "text-primary" }}
            inactiveProps={{ className: "text-text-secondary" }}
            className="flex flex-col items-center gap-1 text-[12px] font-semibold"
          >
            <CreditCard className="w-5 h-5" />
            Subscriptions
          </Link>
          <Link 
            to="/payments" 
            activeProps={{ className: "text-primary" }}
            inactiveProps={{ className: "text-text-secondary" }}
            className="flex flex-col items-center gap-1 text-[12px] font-semibold"
          >
            <CalendarDays className="w-5 h-5" />
            Calendar
          </Link>
          <Link 
            to="/settings" 
            activeProps={{ className: "text-primary" }}
            inactiveProps={{ className: "text-text-secondary" }}
            className="flex flex-col items-center gap-1 text-[12px] font-semibold"
          >
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </div>

      </aside>

      {/* --- MAIN WORKSPACE PANEL --- */}
      <main className="flex-1 min-w-0 overflow-y-auto relative z-10 py-10 px-6 md:px-12 flex flex-col justify-start">
        
        {/* Container limit: max 1200px with padding */}
        <div className="max-w-[1200px] w-full mx-auto space-y-8 flex-1 flex flex-col justify-start">
          
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-border-warm">
            <div>
              <h2 className="font-display font-bold text-[28px] text-text-primary leading-tight mb-1">
                {title}
              </h2>
              <p className="text-[14px] text-text-secondary font-medium">
                {subtitle}
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[12px] font-semibold px-3 py-1.5 rounded-sm bg-surface-warm border border-border-warm text-text-secondary font-mono select-none">
                {todayStr}
              </span>
              <button 
                onClick={loadData}
                className="p-2 border border-border-warm bg-surface-warm rounded-sm transition-colors hover:bg-surface-raised cursor-pointer text-text-secondary"
                title="Refresh Cache"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-primary" : ""}`} />
              </button>
            </div>
          </div>

          {/* Toast notification banner */}
          {notification && (
            <div className="animate-ember">
              <Card className="!p-3.5 border-l-[4px] border-l-accent bg-surface-warm flex items-center gap-3 shadow-sm select-none">
                <Info className="w-5 h-5 text-accent shrink-0" />
                <span className="text-[14px] font-semibold text-text-primary">
                  {notification.text}
                </span>
              </Card>
            </div>
          )}

          {/* VIEW CONTROLLER */}
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <h3 className="font-display text-[20px] text-text-secondary">Loading...</h3>
            </div>
          ) : (
            <div className="space-y-8 flex-1">
              <Outlet />
            </div>
          )}

        </div>

      </main>

      {/* --- ADD SERVICE DIALOG MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          
          <Card hoverable={false} className="w-full max-w-xl relative bg-background-warm border border-border-warm shadow-lg overflow-y-auto max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="pb-4 border-b border-border-warm mb-6">
              <h3 className="font-display font-bold text-[22px] text-text-primary flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Add Subscription
              </h3>
              <p className="text-[14px] text-text-secondary font-medium">
                Add a subscription strategy to track monthly costs.
              </p>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateBill} className="space-y-6">
              
              <Input
                label="Subscription Name"
                placeholder="Adobe CC, Figma, GitHub..."
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
                error={!!formErrors.name}
                errorText={formErrors.name}
              />

              <Input
                label="Amount (USD)"
                placeholder="49.99"
                type="number"
                step="0.01"
                min="0"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                error={!!formErrors.amount}
                errorText={formErrors.amount}
              />

              <Input
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />

              <Input
                label="Notes"
                placeholder="Personal account, design team seat, etc."
                value={billNotes}
                onChange={(e) => setBillNotes(e.target.value)}
              />

              {/* Recurrence Type Selector */}
              <div className="space-y-2">
                <span className="font-body text-[14px] font-semibold text-text-primary block">
                  Cycle Frequency
                </span>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Radio
                    label="Monthly"
                    name="recurrence"
                    checked={recurrenceType === "monthly"}
                    onChange={() => setRecurrenceType("monthly")}
                  />
                  <Radio
                    label="Yearly"
                    name="recurrence"
                    checked={recurrenceType === "yearly"}
                    onChange={() => setRecurrenceType("yearly")}
                  />
                  <Radio
                    label="Custom Interval"
                    name="recurrence"
                    checked={recurrenceType === "interval"}
                    onChange={() => setRecurrenceType("interval")}
                  />
                </div>
              </div>

              {/* Sub-inputs depending on recurrence type */}
              {recurrenceType === "monthly" && (
                <div className="p-3 bg-surface-warm rounded-sm border border-border-warm animate-fadeIn">
                  <Input
                    label="Day of Month billed (1 to 31)"
                    type="number"
                    min="1"
                    max="31"
                    value={monthlyDay}
                    onChange={(e) => setMonthlyDay(Math.max(1, Math.min(31, Number(e.target.value))))}
                  />
                </div>
              )}

              {recurrenceType === "yearly" && (
                <div className="p-3 bg-surface-warm rounded-sm border border-border-warm grid grid-cols-2 gap-4 animate-fadeIn">
                  <Input
                    label="Month (1-12)"
                    type="number"
                    min="1"
                    max="12"
                    value={yearlyMonth}
                    onChange={(e) => setYearlyMonth(Math.max(1, Math.min(12, Number(e.target.value))))}
                  />
                  <Input
                    label="Day of Month (1-31)"
                    type="number"
                    min="1"
                    max="31"
                    value={yearlyDay}
                    onChange={(e) => setYearlyDay(Math.max(1, Math.min(31, Number(e.target.value))))}
                  />
                </div>
              )}

              {recurrenceType === "interval" && (
                <div className="p-3 bg-surface-warm rounded-sm border border-border-warm flex gap-4 items-end animate-fadeIn">
                  <div className="flex-1">
                    <Input
                      label="Billed every..."
                      type="number"
                      min="1"
                      value={intervalEvery}
                      onChange={(e) => setIntervalEvery(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                  <div className="flex-1 flex flex-col items-start">
                    <label className="font-body text-[14px] font-semibold text-text-primary mb-1.5">
                      Unit
                    </label>
                    <select
                      value={intervalUnit}
                      onChange={(e) => setIntervalUnit(e.target.value as any)}
                      className="w-full bg-surface-warm rounded-sm p-3 text-[16px] font-body border border-border-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary h-[46px]"
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Form Buttons */}
              <div className="pt-6 border-t border-border-warm flex items-center justify-end gap-3">
                <Button 
                  variant="ghost" 
                  size="medium" 
                  type="button" 
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="medium" type="submit">
                  Add Subscription
                </Button>
              </div>

            </form>

          </Card>
        </div>
      )}

    </div>
  );
}

// --- TANSTACK ROUTER CONFIGURATION ---
const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardView,
});

const subscriptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/subscriptions",
  component: SubscriptionsView,
});

const paymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments",
  component: PaymentsView,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsView,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  subscriptionsRoute,
  paymentsRoute,
  settingsRoute,
]);

const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// --- MAIN WRAPPER WITH STATE ---
function App() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<(Payment & { bill?: { name: string } })[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [isApiConnected, setIsApiConnected] = useState<boolean>(false);
  
  // Minimal Notification state
  const [notification, setNotification] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);
  
  // Navigation & Filter
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<"all" | "pending" | "settled">("all");
  
  // Modals & Form values
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [billName, setBillName] = useState<string>("");
  const [billAmount, setBillAmount] = useState<string>("");
  const [recurrenceType, setRecurrenceType] = useState<"monthly" | "yearly" | "interval">("monthly");
  const [monthlyDay, setMonthlyDay] = useState<number>(1);
  const [yearlyMonth, setYearlyMonth] = useState<number>(1);
  const [yearlyDay, setYearlyDay] = useState<number>(1);
  const [intervalEvery, setIntervalEvery] = useState<number>(1);
  const [intervalUnit, setIntervalUnit] = useState<"days" | "weeks" | "months">("days");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [billNotes, setBillNotes] = useState<string>("");

  const triggerNotification = (text: string, type: "success" | "info" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load data from Hono API (or fallback to Mock)
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Accounts
      const accountsRes = await fetch("/api/v1/accounts");
      if (!accountsRes.ok) throw new Error("API Offline");
      let accountsData: Account[] = await accountsRes.json();
      
      // Seed a default account if empty
      if (accountsData.length === 0) {
        const createAccountRes = await fetch("/api/v1/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Primary Account 🎨" })
        });
        if (createAccountRes.ok) {
          const newAcc = await createAccountRes.json();
          accountsData = [newAcc];
        }
      }
      
      setAccounts(accountsData);
      const activeAcc = accountsData[0] || null;
      setCurrentAccount(activeAcc);

      // 2. Fetch Bills
      const billsRes = await fetch("/api/v1/bills" + (activeAcc ? `?accountId=${activeAcc.id}` : ""));
      const billsData: Bill[] = await billsRes.json();
      
      // 3. Fetch Payments
      const paymentsRes = await fetch("/api/v1/payments");
      const paymentsData: Payment[] = await paymentsRes.json();

      if (billsData.length === 0 && activeAcc) {
        setBills(MOCK_BILLS);
        setPayments(MOCK_PAYMENTS);
      } else {
        setBills(billsData);
        
        // Enrich payments with bill names for display
        const enrichedPayments = paymentsData.map((p) => {
          const bill = billsData.find((b) => b.id === p.bill_id);
          return { ...p, bill: bill ? { name: bill.name } : { name: "Unknown Subscription" } };
        });
        setPayments(enrichedPayments);
      }
      setIsApiConnected(true);
    } catch (err) {
      // Offline fallback
      setBills(MOCK_BILLS);
      setPayments(MOCK_PAYMENTS);
      setAccounts([{ id: "mock-account-id", name: "Offline Account ☕", created_at: 0, updated_at: 0 }]);
      setCurrentAccount({ id: "mock-account-id", name: "Offline Account ☕", created_at: 0, updated_at: 0 });
      setIsApiConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Settle Payment
  const handlePay = async (paymentId: string, name: string) => {
    triggerNotification("Updating task record...", "info");

    if (isApiConnected) {
      try {
        const res = await fetch(`/api/v1/payments/${paymentId}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (res.ok) {
          await loadData();
          triggerNotification(`"${name}" settled successfully.`, "success");
        } else {
          const data = await res.json();
          triggerNotification(`Oops, try again! ${data.error || "Failed to pay"}`, "error");
        }
      } catch (err) {
        console.error("Failed to pay", err);
        triggerNotification("Connection failed. Oops, try again!", "error");
      }
    } else {
      setPayments(prev => prev.map(p => {
        if (p.id === paymentId) {
          return { ...p, paid_at: Math.floor(Date.now() / 1000) };
        }
        return p;
      }));
      triggerNotification(`"${name}" marked as paid (Sandbox).`, "success");
    }
  };

  // Create Bill
  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    
    if (!billName.trim()) {
      errors.name = "Enter a subscription name.";
    }
    
    const parsedAmount = parseFloat(billAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      errors.amount = "Enter a valid amount.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    const amountCents = Math.round(parsedAmount * 100);
    const targetAccountId = currentAccount?.id || "mock-account-id";

    let recurrence: any = { type: recurrenceType };
    if (recurrenceType === "monthly") {
      recurrence.monthly = { day: Number(monthlyDay) };
    } else if (recurrenceType === "yearly") {
      recurrence.yearly = { month: Number(yearlyMonth), day: Number(yearlyDay) };
    } else if (recurrenceType === "interval") {
      recurrence.interval = { every: Number(intervalEvery), unit: intervalUnit, from: "paid_at" };
    }

    const payload = {
      account_id: targetAccountId,
      name: billName.trim(),
      currency: "USD",
      amount_cents: amountCents,
      amount_type: "fixed",
      recurrence,
      start_date: startDate,
      active: true,
      notes: billNotes.trim() || null
    };

    if (isApiConnected) {
      try {
        const res = await fetch("/api/v1/bills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          await loadData();
          setShowAddModal(false);
          resetForm();
          triggerNotification("New subscription added successfully.", "success");
        } else {
          const data = await res.json();
          triggerNotification(`Oops, try again! ${data.error || "Failed to create"}`, "error");
        }
      } catch (err) {
        console.error(err);
        triggerNotification("Connection failed. Oops, try again!", "error");
      }
    } else {
      // Offline add
      const newBill: Bill = {
        id: crypto.randomUUID(),
        account_id: targetAccountId,
        name: payload.name,
        currency: "USD",
        amount_cents: payload.amount_cents,
        amount_type: "fixed",
        recurrence: payload.recurrence,
        start_date: payload.start_date,
        active: true,
        notes: payload.notes,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000)
      };
      
      const newPayment: Payment & { bill?: { name: string } } = {
        id: crypto.randomUUID(),
        bill_id: newBill.id,
        due_date: newBill.start_date,
        amount_cents: newBill.amount_cents,
        paid_at: null,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        bill: { name: newBill.name }
      };

      setBills(prev => [newBill, ...prev]);
      setPayments(prev => [newPayment, ...prev]);
      setShowAddModal(false);
      resetForm();
      triggerNotification("Sandbox: Added subscription details.", "success");
    }
  };

  // Delete Bill
  const handleDeleteBill = async (billId: string, name: string) => {
    if (!confirm(`Are you sure you want to stop tracking "${name}"?`)) return;

    if (isApiConnected) {
      try {
        const res = await fetch(`/api/v1/bills/${billId}`, {
          method: "DELETE"
        });
        if (res.ok) {
          await loadData();
          triggerNotification(`Removed "${name}" registry.`);
        } else {
          triggerNotification("Could not delete this entry.", "error");
        }
      } catch (err) {
        console.error(err);
        triggerNotification("Connection error. Oops, try again!", "error");
      }
    } else {
      setBills(prev => prev.filter(b => b.id !== billId));
      setPayments(prev => prev.filter(p => p.bill_id !== billId));
      triggerNotification(`Removed "${name}" from Sandbox registry.`);
    }
  };

  // Force Sync Job
  const triggerSyncJob = async () => {
    triggerNotification("Executing task synchronization...", "info");
    if (isApiConnected) {
      try {
        const res = await fetch("/api/v1/jobs/sync", {
          method: "POST"
        });
        if (res.ok) {
          const stats = await res.json();
          await loadData();
          triggerNotification(`Synced. Processed ${stats.processed} profiles, updated ${stats.generated} payments.`, "success");
        } else {
          triggerNotification("Sync failed.", "error");
        }
      } catch (err) {
        console.error(err);
        triggerNotification("Sync command connection failed.", "error");
      }
    } else {
      triggerNotification("Sandbox: Checked and synced metrics.", "success");
    }
  };

  const resetForm = () => {
    setBillName("");
    setBillAmount("");
    setRecurrenceType("monthly");
    setMonthlyDay(1);
    setYearlyMonth(1);
    setYearlyDay(1);
    setIntervalEvery(1);
    setIntervalUnit("days");
    setStartDate(new Date().toISOString().split("T")[0]);
    setBillNotes("");
    setFormErrors({});
  };

  const formatCents = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const activeBills = bills.filter(b => b.active);
  
  // Monthly costs
  const monthlySpendingCents = activeBills.reduce((acc, curr) => {
    const cost = curr.amount_cents;
    if (curr.recurrence.type === "yearly") {
      return acc + Math.round(cost / 12);
    }
    return acc + cost;
  }, 0);

  // Settlement Rate logic for Progress Bar display
  const unpaidPayments = payments.filter(p => !p.paid_at);
  const overduePayments = unpaidPayments.filter(p => p.due_date < todayStr);
  const settledPayments = payments.filter(p => !!p.paid_at);
  const settleRate = payments.length > 0 ? Math.round((settledPayments.length / payments.length) * 100) : 0;

  const getFilteredPayments = () => {
    if (selectedFilter === "pending") return payments.filter(p => !p.paid_at);
    if (selectedFilter === "settled") return payments.filter(p => !!p.paid_at);
    return payments;
  };

  const stateVal: AppState = {
    bills, setBills,
    payments, setPayments,
    accounts, setAccounts,
    currentAccount, setCurrentAccount,
    loading, setLoading,
    isApiConnected, setIsApiConnected,
    notification, setNotification,
    isWorkspaceMenuOpen, setIsWorkspaceMenuOpen,
    selectedFilter, setSelectedFilter,
    showAddModal, setShowAddModal,
    formErrors, setFormErrors,
    billName, setBillName,
    billAmount, setBillAmount,
    recurrenceType, setRecurrenceType,
    monthlyDay, setMonthlyDay,
    yearlyMonth, setYearlyMonth,
    yearlyDay, setYearlyDay,
    intervalEvery, setIntervalEvery,
    intervalUnit, setIntervalUnit,
    startDate, setStartDate,
    billNotes, setBillNotes,
    triggerNotification,
    loadData,
    handlePay,
    handleCreateBill,
    handleDeleteBill,
    triggerSyncJob,
    resetForm,
    formatCents,
    getFilteredPayments,
    todayStr,
    monthlySpendingCents,
    overduePayments,
    activeBills,
    settleRate,
    unpaidPayments,
  };

  return (
    <AppStateContext.Provider value={stateVal}>
      <RouterProvider router={router} />
    </AppStateContext.Provider>
  );
}

export default App;
