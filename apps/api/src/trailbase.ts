import type { Account, Bill, Payment } from "@hornbill/core";

const TRAILBASE_URL = process.env.TRAILBASE_URL || "http://localhost:4000";
const TRAILBASE_TOKEN = process.env.TRAILBASE_TOKEN || "";

interface TrailbaseListResponse<T> {
  records: T[];
  count?: number;
}

class TrailbaseClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${TRAILBASE_URL}${path}`;
    const headers = new Headers(options.headers || {});
    
    headers.set("Content-Type", "application/json");
    if (TRAILBASE_TOKEN) {
      headers.set("Authorization", `Bearer ${TRAILBASE_TOKEN}`);
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
    return this.request<Account>("/api/records/v1/accounts", {
      method: "POST",
      body: JSON.stringify({
        ...account,
        created_at: now,
        updated_at: now,
      }),
    });
  }

  async updateAccount(id: string, updates: Partial<Omit<Account, "id" | "created_at" | "updated_at">>): Promise<Account> {
    const now = Math.floor(Date.now() / 1000);
    return this.request<Account>(`/api/records/v1/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...updates,
        updated_at: now,
      }),
    });
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
    const res = await this.request<any>("/api/records/v1/bills", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      ...res,
      active: Number(res.active) === 1,
      recurrence: typeof res.recurrence === "string" ? JSON.parse(res.recurrence) : res.recurrence,
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

    const res = await this.request<any>(`/api/records/v1/bills/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    return {
      ...res,
      active: Number(res.active) === 1,
      recurrence: typeof res.recurrence === "string" ? JSON.parse(res.recurrence) : res.recurrence,
    };
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
    const res = await this.request<TrailbaseListResponse<Payment>>(path);

    if (!billId) return res.records;
    return res.records.filter(p => p.bill_id === billId);
  }

  async getPayment(id: string): Promise<Payment> {
    return this.request<Payment>(`/api/records/v1/payments/${id}`);
  }

  async createPayment(payment: Omit<Payment, "created_at" | "updated_at">): Promise<Payment> {
    const now = Math.floor(Date.now() / 1000);
    return this.request<Payment>("/api/records/v1/payments", {
      method: "POST",
      body: JSON.stringify({
        ...payment,
        created_at: now,
        updated_at: now,
      }),
    });
  }

  async updatePayment(id: string, updates: Partial<Omit<Payment, "id" | "created_at" | "updated_at">>): Promise<Payment> {
    const now = Math.floor(Date.now() / 1000);
    return this.request<Payment>(`/api/records/v1/payments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...updates,
        updated_at: now,
      }),
    });
  }

  async deletePayment(id: string): Promise<void> {
    await this.request<void>(`/api/records/v1/payments/${id}`, {
      method: "DELETE",
    });
  }
}

export const db = new TrailbaseClient();
