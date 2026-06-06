import type { Account, Bill, Payment, ApiKey } from "@hornbill/core";
import { verify } from "hono/jwt";
import { readFileSync, existsSync } from "fs";
import type { Context } from "hono";
import { CONFIG } from "./config";


const TRAILBASE_URL = CONFIG.TRAILBASE_URL;
const TRAILBASE_TOKEN = CONFIG.TRAILBASE_TOKEN;

let publicKey: CryptoKey | null = null;

async function getPublicKey(): Promise<CryptoKey> {
  if (publicKey) return publicKey;
  
  const paths = [
    `${CONFIG.TRAILBASE_DATA_DIR}/secrets/keys/public_key.pem`,
    "packages/db/traildepot/secrets/keys/public_key.pem",
    "../db/traildepot/secrets/keys/public_key.pem",
    "../../packages/db/traildepot/secrets/keys/public_key.pem",
    "../../../packages/db/traildepot/secrets/keys/public_key.pem",
    "/app/packages/db/traildepot/secrets/keys/public_key.pem",
  ];
  let pemPath = "";
  for (const p of paths) {
    if (existsSync(p)) {
      pemPath = p;
      break;
    }
  }
  if (!pemPath) {
    throw new Error("Could not find public_key.pem in any of the expected paths");
  }

  const pem = readFileSync(pemPath, "utf8");
  const pemHeader = "-----BEGIN PUBLIC KEY-----";
  const pemFooter = "-----END PUBLIC KEY-----";
  const pemContents = pem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s+/g, "");
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }
  publicKey = await crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    { name: "Ed25519" },
    true,
    ["verify"]
  );
  return publicKey;
}

export interface UserPayload {
  sub: string;
}

export async function verifyToken(token: string): Promise<UserPayload> {
  const jwt = token.startsWith("Bearer ") ? token.substring(7) : token;
  const key = await getPublicKey();
  const payload = await verify(jwt, key, "EdDSA");
  return payload as unknown as UserPayload;
}

interface TrailbaseListResponse<T> {
  records: T[];
  count?: number;
}

interface DbAccount {
  id: string;
  name: string;
  currencies?: string | string[];
  default_currency?: string;
  archived?: number | boolean;
  upcoming_threshold_days?: number;
  notification_provider?: string | Record<string, unknown>;
  notification_reminder?: string | Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

interface DbBill {
  id: string;
  account_id: string | { id: string };
  name: string;
  currency: string;
  amount_cents: number;
  amount_type: string;
  recurrence: string | Record<string, unknown>;
  start_date: string;
  active: number | boolean;
  upcoming_threshold_days: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface DbPayment {
  id: string;
  bill_id: string | { id: string };
  amount_cents: number;
  due_date: string;
  paid_at: number | null;
  created_at: number;
  updated_at: number;
}

interface DbAccountUser {
  id: string;
  account_id: string | { id: string };
  user_id: string | { id: string };
}

interface DbApiKey {
  id: string;
  user_id: string | { id: string };
  name: string;
  token_hash: string;
  created_at: number;
  last_used_at: number | null;
}

export class TrailbaseClient {
  constructor(private token?: string) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${TRAILBASE_URL}${path}`;
    const headers = new Headers(options.headers || {});
    
    headers.set("Content-Type", "application/json");
    
    const activeToken = this.token || TRAILBASE_TOKEN;
    if (activeToken) {
      headers.set("Authorization", activeToken.startsWith("Bearer ") ? activeToken : `Bearer ${activeToken}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Trailbase API error: [${response.status}] ${response.statusText}. Response: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  // --- Accounts CRUD ---
  
  private mapDbAccount(acc: DbAccount): Account {
    let currencies: string[] = ["IDR", "USD"];
    if (acc.currencies) {
      try {
        currencies = typeof acc.currencies === "string" 
          ? JSON.parse(acc.currencies) 
          : acc.currencies;
      } catch {
        currencies = ["IDR", "USD"];
      }
    }
    let notification_provider = { type: "webhook" as const, config: {} };
    if (acc.notification_provider) {
      try {
        notification_provider = typeof acc.notification_provider === "string"
          ? JSON.parse(acc.notification_provider)
          : acc.notification_provider;
      } catch {
        // Use default
      }
    }
    let notification_reminder = { enabled: false, days_before_due: 3, time: "09:00", timezone: "UTC", last_reminded_date: null };
    if (acc.notification_reminder) {
      try {
        notification_reminder = typeof acc.notification_reminder === "string"
          ? JSON.parse(acc.notification_reminder)
          : acc.notification_reminder;
      } catch {
        // Use default
      }
    }
    return {
      ...acc,
      currencies,
      default_currency: acc.default_currency ?? "IDR",
      archived: acc.archived !== undefined ? (Number(acc.archived) === 1) : false,
      upcoming_threshold_days: acc.upcoming_threshold_days ?? 7,
      notification_provider,
      notification_reminder,
    } as Account;
  }

  async listAccounts(): Promise<Account[]> {
    const res = await this.request<TrailbaseListResponse<DbAccount>>("/api/records/v1/accounts");
    return res.records.map(acc => this.mapDbAccount(acc));
  }

  async getAccount(id: string): Promise<Account> {
    const acc = await this.request<DbAccount>(`/api/records/v1/accounts/${id}`);
    return this.mapDbAccount(acc);
  }

  async createAccount(account: Omit<Partial<Account> & { id: string; name: string }, "created_at" | "updated_at">): Promise<Account> {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      ...account,
      upcoming_threshold_days: account.upcoming_threshold_days ?? 7,
      currencies: JSON.stringify(account.currencies ?? ["IDR", "USD"]),
      default_currency: account.default_currency ?? "IDR",
      archived: account.archived ? 1 : 0,
      notification_provider: JSON.stringify(account.notification_provider ?? { type: "webhook", config: {} }),
      notification_reminder: JSON.stringify(account.notification_reminder ?? { enabled: false, days_before_due: 3, time: "09:00", timezone: "UTC", last_reminded_date: null }),
      created_at: now,
      updated_at: now,
    };
    await this.request<unknown>("/api/records/v1/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      id: account.id,
      name: account.name,
      upcoming_threshold_days: account.upcoming_threshold_days ?? 7,
      currencies: account.currencies ?? ["IDR", "USD"],
      default_currency: account.default_currency ?? "IDR",
      archived: account.archived ?? false,
      notification_provider: account.notification_provider ?? { type: "webhook", config: {} },
      notification_reminder: account.notification_reminder ?? { enabled: false, days_before_due: 3, time: "09:00", timezone: "UTC", last_reminded_date: null },
      created_at: now,
      updated_at: now,
    };
  }

  async updateAccount(id: string, updates: Partial<Omit<Account, "id" | "created_at" | "updated_at">>): Promise<Account> {
    const now = Math.floor(Date.now() / 1000);
    const payload: Partial<Omit<DbAccount, "id" | "created_at" | "updated_at">> & { currencies?: string; archived?: number; notification_provider?: string; notification_reminder?: string; updated_at: number } = {
      updated_at: now,
    };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.default_currency !== undefined) payload.default_currency = updates.default_currency;
    if (updates.upcoming_threshold_days !== undefined) payload.upcoming_threshold_days = updates.upcoming_threshold_days;
    if (updates.currencies !== undefined) {
      payload.currencies = JSON.stringify(updates.currencies);
    }
    if (updates.archived !== undefined) {
      payload.archived = updates.archived ? 1 : 0;
    }
    if (updates.notification_provider !== undefined) {
      payload.notification_provider = JSON.stringify(updates.notification_provider);
    }
    if (updates.notification_reminder !== undefined) {
      payload.notification_reminder = JSON.stringify(updates.notification_reminder);
    }
    await this.request<unknown>(`/api/records/v1/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return this.getAccount(id);
  }

  async deleteAccount(id: string): Promise<void> {
    await this.request<void>(`/api/records/v1/accounts/${id}`, {
      method: "DELETE",
    });
  }

  // --- Bills CRUD ---

  async listBills(accountId?: string): Promise<Bill[]> {
    const path = "/api/records/v1/bills?limit=1000";
    const res = await this.request<TrailbaseListResponse<DbBill>>(path);

    const bills: Bill[] = res.records.map(bill => ({
      ...bill,
      account_id: typeof bill.account_id === "object" && bill.account_id !== null ? bill.account_id.id : bill.account_id,
      active: Number(bill.active) === 1,
      recurrence: typeof bill.recurrence === "string" ? JSON.parse(bill.recurrence) : bill.recurrence,
      amount_type: bill.amount_type as "fixed" | "variable",
    }));

    if (!accountId) return bills;

    return bills.filter(bill => bill.account_id === accountId);
  }

  async getBill(id: string): Promise<Bill> {
    const bill = await this.request<DbBill>(`/api/records/v1/bills/${id}`);
    return {
      ...bill,
      account_id: typeof bill.account_id === "object" && bill.account_id !== null ? bill.account_id.id : bill.account_id,
      active: Number(bill.active) === 1,
      recurrence: typeof bill.recurrence === "string" ? JSON.parse(bill.recurrence) : bill.recurrence,
      amount_type: bill.amount_type as "fixed" | "variable",
    };
  }

  async createBill(bill: Omit<Bill, "created_at" | "updated_at">): Promise<Bill> {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      ...bill,
      active: bill.active ? 1 : 0,
      recurrence: JSON.stringify(bill.recurrence),
      created_at: now,
      updated_at: now,
    };
    await this.request<unknown>("/api/records/v1/bills", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      ...bill,
      created_at: now,
      updated_at: now,
    };
  }

  async updateBill(id: string, updates: Partial<Omit<Bill, "id" | "created_at" | "updated_at">>): Promise<Bill> {
    const now = Math.floor(Date.now() / 1000);
    const payload: Partial<Omit<DbBill, "id" | "created_at" | "updated_at">> & { active?: number; recurrence?: string; updated_at: number } = {
      updated_at: now,
    };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.currency !== undefined) payload.currency = updates.currency;
    if (updates.amount_cents !== undefined) payload.amount_cents = updates.amount_cents;
    if (updates.amount_type !== undefined) payload.amount_type = updates.amount_type;
    if (updates.start_date !== undefined) payload.start_date = updates.start_date;
    if (updates.upcoming_threshold_days !== undefined) payload.upcoming_threshold_days = updates.upcoming_threshold_days;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.active !== undefined) {
      payload.active = updates.active ? 1 : 0;
    }
    if (updates.recurrence !== undefined) {
      payload.recurrence = JSON.stringify(updates.recurrence);
    }

    await this.request<unknown>(`/api/records/v1/bills/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    return this.getBill(id);
  }

  async deleteBill(id: string): Promise<void> {
    await this.request<void>(`/api/records/v1/bills/${id}`, {
      method: "DELETE",
    });
  }

  // --- Payments CRUD ---

  async listPayments(billId?: string): Promise<Payment[]> {
    const path = "/api/records/v1/payments?limit=1000";
    const res = await this.request<TrailbaseListResponse<DbPayment>>(path);

    const payments: Payment[] = res.records.map(p => ({
      ...p,
      bill_id: typeof p.bill_id === "object" && p.bill_id !== null ? p.bill_id.id : p.bill_id,
    }));

    if (!billId) return payments;
    return payments.filter(p => p.bill_id === billId);
  }

  async getPayment(id: string): Promise<Payment> {
    const res = await this.request<DbPayment>(`/api/records/v1/payments/${id}`);
    return {
      ...res,
      bill_id: typeof res.bill_id === "object" && res.bill_id !== null ? res.bill_id.id : res.bill_id,
    };
  }

  async createPayment(payment: Omit<Payment, "created_at" | "updated_at">): Promise<Payment> {
    const now = Math.floor(Date.now() / 1000);
    await this.request<unknown>("/api/records/v1/payments", {
      method: "POST",
      body: JSON.stringify({
        ...payment,
        created_at: now,
        updated_at: now,
      }),
    });
    return {
      ...payment,
      created_at: now,
      updated_at: now,
    };
  }

  async updatePayment(id: string, updates: Partial<Omit<Payment, "id" | "created_at" | "updated_at">>): Promise<Payment> {
    const now = Math.floor(Date.now() / 1000);
    await this.request<unknown>(`/api/records/v1/payments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...updates,
        updated_at: now,
      }),
    });
    return this.getPayment(id);
  }

  async deletePayment(id: string): Promise<void> {
    await this.request<void>(`/api/records/v1/payments/${id}`, {
      method: "DELETE",
    });
  }

  async listAccountUsers(): Promise<{ id: string; account_id: string; user_id: string }[]> {
    const res = await this.request<TrailbaseListResponse<DbAccountUser>>("/api/records/v1/account_users?limit=1000");
    return res.records.map(r => ({
      id: r.id,
      account_id: typeof r.account_id === "object" && r.account_id !== null ? r.account_id.id : r.account_id,
      user_id: typeof r.user_id === "object" && r.user_id !== null ? r.user_id.id : r.user_id,
    }));
  }

  async associateUserToAccount(accountId: string, userId: string): Promise<unknown> {
    return this.request<unknown>("/api/records/v1/account_users", {
      method: "POST",
      body: JSON.stringify({
        account_id: accountId,
        user_id: userId,
      }),
    });
  }

  // --- API Keys CRUD ---

  private mapDbApiKey(key: DbApiKey): ApiKey {
    return {
      ...key,
      user_id: typeof key.user_id === "object" && key.user_id !== null ? key.user_id.id : key.user_id,
      last_used_at: key.last_used_at ?? null,
    } as ApiKey;
  }

  async listApiKeys(userId?: string): Promise<ApiKey[]> {
    const res = await this.request<TrailbaseListResponse<DbApiKey>>("/api/records/v1/api_keys?limit=1000");
    const keys = res.records.map(k => this.mapDbApiKey(k));
    if (!userId) return keys;
    return keys.filter(k => k.user_id === userId);
  }

  async getApiKey(id: string): Promise<ApiKey> {
    const key = await this.request<DbApiKey>(`/api/records/v1/api_keys/${id}`);
    return this.mapDbApiKey(key);
  }

  async createApiKey(key: Omit<ApiKey, "created_at" | "last_used_at">): Promise<ApiKey> {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      ...key,
      created_at: now,
      last_used_at: null,
    };
    await this.request<unknown>("/api/records/v1/api_keys", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      ...key,
      created_at: now,
      last_used_at: null,
    };
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.request<unknown>(`/api/records/v1/api_keys/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        last_used_at: now,
      }),
    });
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.request<void>(`/api/records/v1/api_keys/${id}`, {
      method: "DELETE",
    });
  }

  async verifyApiKeyHash(hash: string): Promise<UserPayload | null> {
    const res = await this.request<TrailbaseListResponse<DbApiKey>>("/api/records/v1/api_keys?limit=1000");
    const key = res.records.find(k => k.token_hash === hash);
    if (!key) return null;

    const keyId = key.id;
    this.updateApiKeyLastUsed(keyId).catch(err => {
      console.error(`Failed to update last_used_at for api_key ${keyId}:`, err);
    });

    const userId = typeof key.user_id === "object" && key.user_id !== null ? key.user_id.id : key.user_id;
    return { sub: userId };
  }
}

export const db = new TrailbaseClient();

export function getDb(tokenOrContext?: string | Context): TrailbaseClient {
  if (!tokenOrContext) return db;
  if (typeof tokenOrContext === "string") {
    return new TrailbaseClient(tokenOrContext);
  }
  const authHeader = tokenOrContext.req.header("Authorization");
  return authHeader ? new TrailbaseClient(authHeader) : db;
}

export async function verifyAccountAccess(c: Context, accountId: string): Promise<boolean> {
  let user = c.get("user") as UserPayload | undefined;
  if (!user) {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return false;
    try {
      user = await verifyToken(authHeader);
    } catch {
      return false;
    }
  }
  if (!user) return false;

  let myAccountIds = c.get("myAccountIds") as Set<string> | undefined;
  if (!myAccountIds) {
    const client = getDb(c);
    try {
      const accountUsers = await client.listAccountUsers();
      myAccountIds = new Set(
        accountUsers.filter((au) => au.user_id === user!.sub).map((au) => au.account_id)
      );
      c.set("myAccountIds", myAccountIds);
    } catch (err) {
      console.error("verifyAccountAccess error:", err);
      return false;
    }
  }
  return myAccountIds.has(accountId);
}

export async function verifyBillAccess(c: Context, billId: string): Promise<boolean> {
  const cachedBill = c.get("bill") as Bill | undefined;
  if (cachedBill && cachedBill.id === billId) {
    return await verifyAccountAccess(c, cachedBill.account_id);
  }
  const client = getDb(c);
  try {
    const bill = await client.getBill(billId);
    return await verifyAccountAccess(c, bill.account_id);
  } catch (err) {
    console.error("verifyBillAccess error:", err);
    return false;
  }
}

export async function verifyPaymentAccess(c: Context, paymentId: string): Promise<boolean> {
  const cachedPayment = c.get("payment") as Payment | undefined;
  if (cachedPayment && cachedPayment.id === paymentId) {
    return await verifyBillAccess(c, cachedPayment.bill_id);
  }
  const client = getDb(c);
  try {
    const payment = await client.getPayment(paymentId);
    return await verifyBillAccess(c, payment.bill_id);
  } catch (err) {
    console.error("verifyPaymentAccess error:", err);
    return false;
  }
}
