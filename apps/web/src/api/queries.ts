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
  updatePayment,
  deletePayment,

  triggerAccountSync,
  importAccount,
  fetchApiKeys,
  createApiKey,
  deleteApiKey,
  type CreateBillPayload,
  type UpdateBillPayload,
  type CreatePaymentPayload,
  type UpdatePaymentPayload,
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
    staleTime: 300_000, // 5 minutes
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
    staleTime: 120_000, // 2 minutes
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
      qc.invalidateQueries({ queryKey: qk.payments(vars.account_id) });
    },
  });
}

export function useUpdateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; accountId: string; updates: UpdateBillPayload }) =>
      updateBill(id, updates),
    onMutate: async ({ id, accountId, updates }) => {
      await qc.cancelQueries({ queryKey: qk.bills(accountId) });
      const previousBills = qc.getQueryData<Bill[]>(qk.bills(accountId));
      qc.setQueryData<Bill[]>(qk.bills(accountId), (old) =>
        old ? old.map((b) => (b.id === id ? { ...b, ...updates } : b)) : []
      );
      return { previousBills };
    },
    onError: (_err, variables, context) => {
      if (context?.previousBills) {
        qc.setQueryData(qk.bills(variables.accountId), context.previousBills);
      }
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: qk.bills(variables.accountId) });
      qc.invalidateQueries({ queryKey: qk.payments(variables.accountId) });
    },
  });
}

export function useDeleteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; accountId: string }) => deleteBill(id),
    onMutate: async ({ id, accountId }) => {
      await qc.cancelQueries({ queryKey: qk.bills(accountId) });
      const previousBills = qc.getQueryData<Bill[]>(qk.bills(accountId));
      qc.setQueryData<Bill[]>(qk.bills(accountId), (old) =>
        old ? old.filter((b) => b.id !== id) : []
      );
      return { previousBills };
    },
    onError: (_err, variables, context) => {
      if (context?.previousBills) {
        qc.setQueryData(qk.bills(variables.accountId), context.previousBills);
      }
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: qk.bills(variables.accountId) });
      qc.invalidateQueries({ queryKey: qk.payments(variables.accountId) });
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
    staleTime: 120_000, // 2 minutes
    retry: 1,
  });
}

export function usePayPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, paidAt, amountCents, notes }: { paymentId: string; accountId: string; paidAt?: string | number; amountCents?: number; notes?: string | null }) =>
      payPayment(paymentId, paidAt, amountCents, notes),
    onMutate: async ({ paymentId, accountId, paidAt, amountCents, notes }) => {
      await qc.cancelQueries({ queryKey: qk.payments(accountId) });
      const previousPayments = qc.getQueryData<EnrichedPayment[]>(qk.payments(accountId));
      const finalPaidAt = paidAt !== undefined 
        ? (typeof paidAt === "number" ? paidAt : Math.floor(new Date(paidAt).getTime() / 1000))
        : Math.floor(Date.now() / 1000);

      qc.setQueryData<EnrichedPayment[]>(qk.payments(accountId), (old) =>
        old
          ? old.map((p) =>
              p.id === paymentId
                ? {
                    ...p,
                    paid_at: finalPaidAt,
                    ...(amountCents !== undefined ? { amount_cents: amountCents } : {}),
                    ...(notes !== undefined ? { notes } : {}),
                  }
                : p
            )
          : []
      );
      return { previousPayments };
    },
    onError: (_err, variables, context) => {
      if (context?.previousPayments) {
        qc.setQueryData(qk.payments(variables.accountId), context.previousPayments);
      }
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: qk.payments(variables.accountId) });
    },
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payload }: { payload: CreatePaymentPayload; accountId: string }) => createPayment(payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.payments(vars.accountId) });
      qc.invalidateQueries({ queryKey: qk.bills(vars.accountId) });
    },
  });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; accountId: string; updates: UpdatePaymentPayload }) =>
      updatePayment(id, updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.payments(vars.accountId) });
      qc.invalidateQueries({ queryKey: qk.bills(vars.accountId) });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; accountId: string }) => deletePayment(id),
    onMutate: async ({ id, accountId }) => {
      await qc.cancelQueries({ queryKey: qk.payments(accountId) });
      const previousPayments = qc.getQueryData<EnrichedPayment[]>(qk.payments(accountId));
      qc.setQueryData<EnrichedPayment[]>(qk.payments(accountId), (old) =>
        old ? old.filter((p) => p.id !== id) : []
      );
      return { previousPayments };
    },
    onError: (_err, variables, context) => {
      if (context?.previousPayments) {
        qc.setQueryData(qk.payments(variables.accountId), context.previousPayments);
      }
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: qk.payments(variables.accountId) });
      qc.invalidateQueries({ queryKey: qk.bills(variables.accountId) });
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
      qc.invalidateQueries({ queryKey: qk.payments(accountId) });
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
    staleTime: 300_000, // 5 minutes
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
