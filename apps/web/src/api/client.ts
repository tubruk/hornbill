import type { Account, Bill, Payment, ExportPayload } from "@hornbill/core";

const BASE = "/api/v1";

// ── Helpers ────────────────────────────────────────────────────────────────

let refreshPromise: Promise<string | null> | null = null;

async function doTokenRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem("hb_refresh_token");
  if (!refreshToken) {
    return null;
  }
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      throw new Error("Refresh failed");
    }
    const data = await res.json();
    if (data.auth_token) {
      localStorage.setItem("hb_auth_token", data.auth_token);
      if (data.refresh_token) {
        localStorage.setItem("hb_refresh_token", data.refresh_token);
      }
      return data.auth_token;
    }
    return null;
  } catch (err) {
    console.error("Token refresh failed:", err);
    return null;
  }
}

function getOrRefreshAuthToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = doTokenRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  const token = localStorage.getItem("hb_auth_token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res = await fetch(`${BASE}${url}`, {
    ...init,
    headers,
  });

  const isAuthRoute = url.startsWith("/auth/login") || url.startsWith("/auth/register") || url.startsWith("/auth/refresh");

  if (res.status === 401 && !isAuthRoute) {
    const refreshToken = localStorage.getItem("hb_refresh_token");
    if (refreshToken) {
      const newToken = await getOrRefreshAuthToken();
      if (newToken) {
        const retryHeaders = new Headers(init?.headers || {});
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
        res = await fetch(`${BASE}${url}`, {
          ...init,
          headers: retryHeaders,
        });
      }
    }
  }

  if (res.status === 401 && !isAuthRoute) {
    localStorage.removeItem("hb_auth_token");
    localStorage.removeItem("hb_refresh_token");
    localStorage.removeItem("hb_auth_email");
    window.dispatchEvent(new CustomEvent("hb_session_expired"));
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ───────────────────────────────────────────────────────────────────

export function loginUser(email: string, password: string): Promise<{ auth_token: string; refresh_token: string }> {
  return apiFetch<{ auth_token: string; refresh_token: string }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function registerUser(email: string, password: string, password_repeat: string): Promise<any> {
  return apiFetch<any>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, password_repeat }),
  });
}

// ── Accounts ───────────────────────────────────────────────────────────────

export function fetchAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>("/accounts");
}

export function fetchAccount(id: string): Promise<Account> {
  return apiFetch<Account>(`/accounts/${id}`);
}

export function createAccount(name: string): Promise<Account> {
  return apiFetch<Account>("/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function updateAccount(
  id: string,
  updates: Partial<Omit<Account, "id" | "created_at" | "updated_at">>
): Promise<Account> {
  return apiFetch<Account>(`/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function deleteAccount(id: string): Promise<void> {
  return apiFetch<void>(`/accounts/${id}`, { method: "DELETE" });
}

// ── Bills ──────────────────────────────────────────────────────────────────

export function fetchBills(accountId?: string): Promise<Bill[]> {
  const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return apiFetch<Bill[]>(`/bills${qs}`);
}

export interface CreateBillPayload {
  account_id: string;
  name: string;
  currency: string;
  amount_cents: number;
  amount_type: "fixed" | "variable";
  recurrence: Bill["recurrence"];
  start_date: string;
  active: boolean;
  upcoming_threshold_days?: number | null;
  notes?: string | null;
}

export function createBill(payload: CreateBillPayload): Promise<Bill> {
  return apiFetch<Bill>("/bills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type UpdateBillPayload = Partial<
  Pick<Bill, "name" | "amount_cents" | "currency" | "recurrence" | "start_date" | "active" | "notes" | "upcoming_threshold_days">
>;

export function updateBill(id: string, updates: UpdateBillPayload): Promise<Bill> {
  return apiFetch<Bill>(`/bills/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function deleteBill(id: string): Promise<void> {
  return apiFetch<void>(`/bills/${id}`, { method: "DELETE" });
}

// ── Payments ───────────────────────────────────────────────────────────────

export function fetchPayments(billId?: string): Promise<Payment[]> {
  const qs = billId ? `?billId=${encodeURIComponent(billId)}` : "";
  return apiFetch<Payment[]>(`/payments${qs}`);
}

export function payPayment(id: string, paidAt?: string | number, amountCents?: number): Promise<Payment> {
  const body: Record<string, any> = {};
  if (paidAt !== undefined) body.paid_at = paidAt;
  if (amountCents !== undefined) body.amount_cents = amountCents;
  return apiFetch<Payment>(`/payments/${id}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Jobs ───────────────────────────────────────────────────────────────────

export function triggerSync(): Promise<{ processed: number; generated: number }> {
  return apiFetch("/jobs/sync", { method: "POST" });
}

// Scoped sync for a specific account
export function triggerAccountSync(accountId: string): Promise<{ processed: number; generated: number }> {
  return apiFetch(`/jobs/sync/account/${encodeURIComponent(accountId)}`, { method: "POST" });
}

// ── Export / Import ────────────────────────────────────────────────────────

export function exportAccount(accountId: string): Promise<ExportPayload> {
  return apiFetch<ExportPayload>(`/accounts/${encodeURIComponent(accountId)}/export`);
}

export function importAccount(payload: ExportPayload, regenerateIds: boolean): Promise<Account> {
  return apiFetch<Account>(`/accounts/import?regenerate_ids=${regenerateIds}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}


