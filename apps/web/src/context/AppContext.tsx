import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Account } from "@hornbill/core";

// ── Toast notification ─────────────────────────────────────────────────────

export interface Toast {
  id: string;
  type: "success" | "info" | "error";
  text: string;
}

// ── App UI state ───────────────────────────────────────────────────────────

interface AppCtx {
  // Account selection
  currentAccount: Account | null;
  setCurrentAccount: (account: Account | null) => void;

  // Toast notifications
  toasts: Toast[];
  notify: (text: string, type?: Toast["type"]) => void;
  dismissToast: (id: string) => void;

  // Add-bill modal
  showAddModal: boolean;
  addModalDefaultDate?: string;
  openAddModal: (defaultDate?: string | unknown) => void;
  closeAddModal: () => void;
}

const AppContext = createContext<AppCtx | null>(null);

export function useAppCtx(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppCtx must be used inside AppProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalDefaultDate, setAddModalDefaultDate] = useState<string | undefined>(undefined);

  const notify = useCallback(
    (text: string, type: Toast["type"] = "success") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, type, text }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    []
  );

  const openAddModal = useCallback((defaultDate?: string | unknown) => {
    const dateStr = typeof defaultDate === "string" ? defaultDate : undefined;
    setAddModalDefaultDate(dateStr);
    setShowAddModal(true);
  }, []);
  const closeAddModal = useCallback(() => {
    setAddModalDefaultDate(undefined);
    setShowAddModal(false);
  }, []);

  // Close dropdown / modals on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAddModal(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      notify("Session expired. Please log in again.", "error");
    };
    window.addEventListener("hb_session_expired", handleExpired);
    return () => window.removeEventListener("hb_session_expired", handleExpired);
  }, [notify]);

  return (
    <AppContext.Provider
      value={{
        currentAccount,
        setCurrentAccount,
        toasts,
        notify,
        dismissToast,
        showAddModal,
        addModalDefaultDate,
        openAddModal,
        closeAddModal,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
