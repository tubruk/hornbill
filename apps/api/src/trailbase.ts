import type { Account, Bill, Payment } from "@hornbill/core";
import { verify } from "hono/jwt";
import { readFileSync, existsSync } from "fs";

const TRAILBASE_URL = process.env.TRAILBASE_URL || "http://localhost:4000";
const TRAILBASE_TOKEN = process.env.TRAILBASE_TOKEN || "";

let publicKey: CryptoKey | null = null;

async function getPublicKey(): Promise<CryptoKey> {
  if (publicKey) return publicKey;
  
  const paths = [
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

export async function verifyToken(token: string): Promise<any> {
  const jwt = token.startsWith("Bearer ") ? token.substring(7) : token;
  const key = await getPublicKey();
  return verify(jwt, key, "EdDSA");
}

interface TrailbaseListResponse<T> {
  records: T[];
  count?: number;
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

  async listAccounts(): Promise<Account[]> {
    const res = await this.request<TrailbaseListResponse<any>>("/api/records/v1/accounts");
    return res.records;
  }

  async getAccount(id: string): Promise<Account> {
    return this.request<Account>(`/api/records/v1/accounts/${id}`);
  }

  async createAccount(account: Omit<Account, "created_at" | "updated_at">): Promise<Account> {
    const now = Math.floor(Date.now() / 1000);
    await this.request<any>("/api/records/v1/accounts", {
      method: "POST",
      body: JSON.stringify({
        ...account,
        created_at: now,
        updated_at: now,
      }),
    });
    return {
      ...account,
      created_at: now,
      updated_at: now,
    };
  }

  async updateAccount(id: string, updates: Partial<Omit<Account, "id" | "created_at" | "updated_at">>): Promise<Account> {
    const now = Math.floor(Date.now() / 1000);
    await this.request<any>(`/api/records/v1/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...updates,
        updated_at: now,
      }),
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
    // NOTE: Trailbase stores UUIDs as binary BLOBs and serialises them as
    // base64 in JSON responses. Passing that base64 value back as a
    // filter[account_id][@eq]=... query parameter fails with "Invalid query"
    // because Trailbase cannot coerce a URL string to a BLOB for comparison.
    // Solution: fetch all bills and filter by account_id in JS instead.
    const path = "/api/records/v1/bills?limit=1000";
    const res = await this.request<TrailbaseListResponse<any>>(path);

    const bills: Bill[] = res.records.map(bill => ({
      ...bill,
      account_id: typeof bill.account_id === "object" && bill.account_id !== null ? bill.account_id.id : bill.account_id,
      active: Number(bill.active) === 1,
      recurrence: typeof bill.recurrence === "string" ? JSON.parse(bill.recurrence) : bill.recurrence,
    }));

    if (!accountId) return bills;

    // account_id from Trailbase is base64-encoded binary; compare as strings.
    return bills.filter(bill => bill.account_id === accountId);
  }

  async getBill(id: string): Promise<Bill> {
    const bill = await this.request<any>(`/api/records/v1/bills/${id}`);
    return {
      ...bill,
      account_id: typeof bill.account_id === "object" && bill.account_id !== null ? bill.account_id.id : bill.account_id,
      active: Number(bill.active) === 1,
      recurrence: typeof bill.recurrence === "string" ? JSON.parse(bill.recurrence) : bill.recurrence,
    };
  }

  async createBill(bill: Omit<Bill, "created_at" | "updated_at">): Promise<Bill> {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      ...bill,
      active: bill.active ? 1 : 0, // Convert boolean to SQLite 0/1 integer
      recurrence: JSON.stringify(bill.recurrence), // Serialize to string
      created_at: now,
      updated_at: now,
    };
    await this.request<any>("/api/records/v1/bills", {
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
    const payload: any = {
      ...updates,
      updated_at: now,
    };
    if (updates.active !== undefined) {
      payload.active = updates.active ? 1 : 0;
    }
    if (updates.recurrence !== undefined) {
      payload.recurrence = JSON.stringify(updates.recurrence);
    }

    await this.request<any>(`/api/records/v1/bills/${id}`, {
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
    // Same BLOB UUID issue as listBills — filter in JS after fetching all.
    const path = "/api/records/v1/payments?limit=1000";
    const res = await this.request<TrailbaseListResponse<any>>(path);

    const payments: Payment[] = res.records.map(p => ({
      ...p,
      bill_id: typeof p.bill_id === "object" && p.bill_id !== null ? p.bill_id.id : p.bill_id,
    }));

    if (!billId) return payments;
    return payments.filter(p => p.bill_id === billId);
  }

  async getPayment(id: string): Promise<Payment> {
    const res = await this.request<any>(`/api/records/v1/payments/${id}`);
    return {
      ...res,
      bill_id: typeof res.bill_id === "object" && res.bill_id !== null ? res.bill_id.id : res.bill_id,
    };
  }

  async createPayment(payment: Omit<Payment, "created_at" | "updated_at">): Promise<Payment> {
    const now = Math.floor(Date.now() / 1000);
    await this.request<any>("/api/records/v1/payments", {
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
    await this.request<any>(`/api/records/v1/payments/${id}`, {
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
    const res = await this.request<TrailbaseListResponse<any>>("/api/records/v1/account_users?limit=1000");
    return res.records.map(r => ({
      id: r.id,
      account_id: typeof r.account_id === "object" && r.account_id !== null ? r.account_id.id : r.account_id,
      user_id: typeof r.user_id === "object" && r.user_id !== null ? r.user_id.id : r.user_id,
    }));
  }

  async associateUserToAccount(accountId: string, userId: string): Promise<any> {
    return this.request<any>("/api/records/v1/account_users", {
      method: "POST",
      body: JSON.stringify({
        account_id: accountId,
        user_id: userId,
      }),
    });
  }
}

export const db = new TrailbaseClient();

export function getDb(tokenOrContext?: string | any): TrailbaseClient {
  if (!tokenOrContext) return db;
  if (typeof tokenOrContext === "string") {
    return new TrailbaseClient(tokenOrContext);
  }
  // It is Hono context
  const authHeader = tokenOrContext.req.header("Authorization");
  return authHeader ? new TrailbaseClient(authHeader) : db;
}
