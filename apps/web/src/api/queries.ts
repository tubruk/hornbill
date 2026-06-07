import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type { Account, Bill, Payment, ExportPayload, ApiKey } from "@hornbill/core";
import {
  fetchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  fetchBills,
  createBill,
  updateBill,
  deleteBill,
  fetchPayments,
  payPayment,
  createPayment,

  triggerAccountSync,
  importAccount,
  fetchApiKeys,
  createApiKey,
  deleteApiKey,
  type CreateBillPayload,
  type UpdateBillPayload,
  type CreatePaymentPayload,
} from "./client";

// ── Query Key Factories ────────────────────────────────────────────────────
// Centralised so invalidation is always consistent.

export const qk = {
  accounts: () => ["accounts"] as const,
  bills: (accountId: string | undefined) => ["bills", accountId] as const,
  payments: (accountId: string | undefined) => ["payments", accountId] as const,
  apiKeys: () => ["apiKeys"] as const,
} as const;

// ── Enriched payment type ──────────────────────────────────────────────────

export type EnrichedPayment = Payment & { bill: Bill | null };

// ── Accounts ───────────────────────────────────────────────────────────────

export function useAccounts(
  options?: Partial<UseQueryOptions<Account[]>>
) {
  return useQuery<Account[]>({
    queryKey: qk.accounts(),
    queryFn: fetchAccounts,
    staleTime: 60_000,
    retry: 1,
    ...options,
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createAccount(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.accounts() });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string } & Partial<Omit<Account, "id" | "created_at" | "updated_at">>) =>
      updateAccount(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.accounts() });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.accounts() });
    },
  });
}

// ── Bills ──────────────────────────────────────────────────────────────────

export function useBills(accountId: string | undefined) {
  return useQuery<Bill[]>({
    queryKey: qk.bills(accountId),
    queryFn: () => fetchBills(accountId),
    enabled: !!accountId,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useCreateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBillPayload) => createBill(payload),
    onSuccess: (_newBill, vars) => {
      // Invalidate bills for the account this bill belongs to
      qc.invalidateQueries({ queryKey: qk.bills(vars.account_id) });
      // Also invalidate payments since a new payment cycle is generated on create
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useUpdateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; accountId: string; updates: UpdateBillPayload }) =>
      updateBill(id, updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.bills(vars.accountId) });
      qc.invalidateQueries({ queryKey: qk.payments(vars.accountId) });
    },
  });
}

export function useDeleteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; accountId: string }) => deleteBill(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.bills(vars.accountId) });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

// ── Payments ───────────────────────────────────────────────────────────────
// Fetch all payments then enrich + filter to the current account's bills
// client-side (the API has no account-level payment filter endpoint).

export function usePayments(
  accountId: string | undefined,
  bills: Bill[] | undefined
) {
  return useQuery<EnrichedPayment[]>({
    queryKey: qk.payments(accountId),
    queryFn: async () => {
      const all = await fetchPayments();
      const billMap = new Map(
        (bills ?? []).map((b) => [b.id, b])
      );
      // Filter to this account's bills and enrich with full bill details
      return all
        .filter((p) => billMap.has(p.bill_id))
        .map((p) => {
          const bill = billMap.get(p.bill_id);
          return { ...p, bill: bill || null };
        });
    },
    // Only run when we have both an accountId and loaded bills
    enabled: !!accountId && Array.isArray(bills),
    staleTime: 30_000,
    retry: 1,
  });
}

export function usePayPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, paidAt, amountCents }: { paymentId: string; accountId: string; paidAt?: string | number; amountCents?: number }) =>
      payPayment(paymentId, paidAt, amountCents),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.payments(vars.accountId) });
    },
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePaymentPayload) => createPayment(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bills"] });
    },
  });
}

// ── Jobs ───────────────────────────────────────────────────────────────────

// Scoped sync for a specific account
export function useTriggerAccountSync(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => triggerAccountSync(accountId),
    onSuccess: () => {
      // After sync new payments may have been generated
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

// ── Export / Import ────────────────────────────────────────────────────────

export function useImportAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, regenerateIds }: { payload: ExportPayload; regenerateIds: boolean }) =>
      importAccount(payload, regenerateIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.accounts() });
    },
  });
}

// ── API Keys ───────────────────────────────────────────────────────────────

export function useApiKeys(options?: Partial<UseQueryOptions<ApiKey[]>>) {
  return useQuery<ApiKey[]>({
    queryKey: qk.apiKeys(),
    queryFn: fetchApiKeys,
    staleTime: 30_000,
    retry: 1,
    ...options,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createApiKey(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.apiKeys() });
    },
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteApiKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.apiKeys() });
    },
  });
}
