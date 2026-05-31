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
  openAddModal: () => void;
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

  const openAddModal = useCallback(() => setShowAddModal(true), []);
  const closeAddModal = useCallback(() => setShowAddModal(false), []);

  // Close dropdown / modals on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAddModal(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentAccount,
        setCurrentAccount,
        toasts,
        notify,
        dismissToast,
        showAddModal,
        openAddModal,
        closeAddModal,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
