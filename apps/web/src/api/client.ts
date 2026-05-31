import type { Account, Bill, Payment } from "@hornbill/core";

const BASE = "/api/v1";

// ── Helpers ────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
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

export function updateAccount(id: string, name: string): Promise<Account> {
  return apiFetch<Account>(`/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
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
  Pick<Bill, "name" | "amount_cents" | "currency" | "recurrence" | "start_date" | "active" | "notes">
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

export function payPayment(id: string): Promise<Payment> {
  return apiFetch<Payment>(`/payments/${id}/pay`, { method: "POST" });
}

// ── Jobs ───────────────────────────────────────────────────────────────────

export function triggerSync(): Promise<{ processed: number; generated: number }> {
  return apiFetch("/jobs/sync", { method: "POST" });
}
