import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  Settings,
  ChevronDown,
  Layers,
  Plus,
  Check,
  Loader2,
} from "lucide-react";
import type { Account } from "@hornbill/core";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import logo from "../assets/logo.png";

const NAV_ITEMS = [
  { to: "/",            label: "Dashboard", icon: LayoutDashboard },
  { to: "/bills",       label: "Bills",     icon: Receipt },
  { to: "/payments",   label: "Payments",  icon: Wallet },
  { to: "/settings",   label: "Settings",  icon: Settings },
] as const;

interface Props {
  accounts: Account[];
  currentAccount: Account | null;
  isApiConnected: boolean;
  isLoadingAccounts: boolean;
  onSelectAccount: (account: Account) => void;
  onCreateAccount: (name: string) => void;
  isCreatingAccount?: boolean;
  email?: string | null;
  onLogout?: () => void;
}

export function Sidebar({
  accounts,
  currentAccount,
  isApiConnected,
  isLoadingAccounts,
  onSelectAccount,
  onCreateAccount,
  isCreatingAccount,
  email,
  onLogout,
}: Props) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setShowNewInput(false);
        setNewAccountName("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus input when shown
  useEffect(() => {
    if (showNewInput) inputRef.current?.focus();
  }, [showNewInput]);

  function handleCreateAccount() {
    const name = newAccountName.trim();
    if (!name) return;
    onCreateAccount(name);
    setNewAccountName("");
    setShowNewInput(false);
    setMenuOpen(false);
  }

  return (
    <aside className="w-full md:w-64 bg-background-warm border-b md:border-b-0 md:border-r border-border-warm flex flex-col z-20 shrink-0 select-none">

      {/* ── Brand + Account Switcher ──────────────────────── */}
      <div className="p-5 border-b border-border-warm">

        {/* Brand mark */}
        <div className="flex items-center gap-3 mb-5">
          <img src={logo} alt="Hornbill Logo" className="w-9 h-9 object-contain rounded-sm shadow-sm shrink-0" />
          <div>
            <h1 className="font-display font-bold text-[20px] text-text-primary tracking-tight leading-none">
              Hornbill
            </h1>
            <span className="text-[11px] font-semibold text-neutral-muted uppercase tracking-wider block mt-0.5">
              Bill Tracker
            </span>
          </div>
        </div>

        {/* Account Switcher */}
        <div ref={menuRef} className="relative">
          <button
            id="account-switcher-btn"
            onClick={() => setMenuOpen((v) => !v)}
            className="w-full h-10 px-3 bg-surface-warm border border-border-warm rounded-sm text-left text-[14px] font-semibold text-text-primary flex items-center justify-between hover:bg-surface-raised transition-all cursor-pointer gap-2"
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
          >
            <span className="flex items-center gap-2 truncate min-w-0">
              <Layers className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">
                {isLoadingAccounts
                  ? "Loading…"
                  : currentAccount?.name ?? "Select Account"}
              </span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-text-secondary shrink-0 transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {menuOpen && (
            <div
              className="absolute left-0 right-0 top-full mt-1.5 bg-background-warm border border-border-warm rounded-sm shadow-lg z-30 animate-slideDown overflow-hidden"
              role="listbox"
              aria-label="Accounts"
            >
              {/* Account list */}
              {accounts.length > 0 ? (
                <div className="p-1">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      role="option"
                      aria-selected={currentAccount?.id === acc.id}
                      onClick={() => {
                        onSelectAccount(acc);
                        setMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-sm text-left text-[14px] font-semibold transition-colors cursor-pointer ${
                        currentAccount?.id === acc.id
                          ? "bg-surface-raised text-primary"
                          : "text-text-secondary hover:bg-surface-warm hover:text-text-primary"
                      }`}
                    >
                      <span className="truncate">{acc.name}</span>
                      {currentAccount?.id === acc.id && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-3 text-[13px] text-text-secondary font-medium">
                  No accounts yet.
                </p>
              )}

              {/* Divider */}
              <div className="border-t border-border-warm" />

              {/* New account */}
              <div className="p-2">
                {showNewInput ? (
                  <div className="flex gap-1.5">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateAccount();
                        if (e.key === "Escape") { setShowNewInput(false); setNewAccountName(""); }
                      }}
                      placeholder="Account name…"
                      className="flex-1 min-w-0 bg-surface-warm border border-border-warm rounded-sm px-2.5 py-1.5 text-[13px] font-body text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/12"
                    />
                    <Button
                      variant="primary"
                      size="small"
                      onClick={handleCreateAccount}
                      disabled={!newAccountName.trim() || isCreatingAccount}
                      className="shrink-0 !px-2.5"
                    >
                      {isCreatingAccount ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewInput(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-sm text-[13px] font-semibold text-text-secondary hover:text-primary hover:bg-surface-warm transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New account
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop nav links ─────────────────────────────── */}
      <nav className="p-3 space-y-0.5 flex-1 hidden md:block" aria-label="Main navigation">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`w-full h-10 px-3 rounded-sm text-left text-[14px] font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                isActive
                  ? "bg-surface-raised text-primary border-l-[3px] border-l-primary pl-[9px]"
                  : "text-text-secondary hover:bg-surface-warm hover:text-text-primary"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* ── Desktop sidebar footer ────────────────────────── */}
      <div className="p-5 border-t border-border-warm hidden md:block bg-surface-warm/40">
        <div className="flex items-center gap-3 mb-4">
          <Avatar fallback={email ? email.substring(0, 2).toUpperCase() : "HB"} size={32} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-text-primary truncate">{email || "Hornbill"}</div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="text-[11px] text-primary hover:text-primary-hover font-semibold hover:underline cursor-pointer block mt-0.5 text-left"
              >
                Log Out
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-[12px] font-semibold text-text-secondary">
          <span>API Status:</span>
          <span className={`inline-flex items-center gap-1.5 font-bold ${isApiConnected ? "text-success" : "text-warning"}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${isApiConnected ? "bg-success" : "bg-warning animate-pulse"}`} />
            {isApiConnected ? "Connected" : "Offline"}
          </span>
        </div>
      </div>

      {/* ── Mobile bottom tab bar ─────────────────────────── */}
      <div className="flex md:hidden items-center justify-around border-t border-border-warm py-2.5 px-4 bg-surface-warm shadow-inner z-20">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${isActive ? "text-primary" : "text-text-secondary"}`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          );
        })}
      </div>

    </aside>
  );
}
