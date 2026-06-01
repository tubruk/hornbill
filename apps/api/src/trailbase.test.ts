import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import { TrailbaseClient, db, getDb, verifyToken } from "./trailbase";
import * as fs from "fs";
import * as jwt from "hono/jwt";

describe("Trailbase Integration", () => {
  let fetchSpy: any;
  let existsSpy: any;
  let readSpy: any;
  let importKeySpy: any;
  let jwtVerifySpy: any;

  beforeEach(() => {
    // Mock fetch for database operations
    fetchSpy = spyOn(globalThis as any, "fetch").mockImplementation(async (urlStr: any, init: any) => {
      const url = new URL(urlStr);
      const path = url.pathname;

      if (path === "/api/records/v1/accounts") {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ id: "acc-new", name: "New Acc" }));
        }
        return new Response(JSON.stringify({
          records: [
            { id: "acc-1", name: "Acc 1", currencies: '["USD"]', default_currency: "USD", archived: 0 }
          ]
        }));
      }

      if (path === "/api/records/v1/accounts/acc-1") {
        return new Response(JSON.stringify({
          id: "acc-1", name: "Acc 1", currencies: '["USD"]', default_currency: "USD", archived: 0
        }));
      }

      if (path === "/api/records/v1/bills") {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ id: "bill-new", name: "New Bill" }));
        }
        return new Response(JSON.stringify({
          records: [
            { id: "bill-1", account_id: "acc-1", name: "Rent", active: 1, recurrence: '{"type":"monthly","monthly":{"day":1}}' }
          ]
        }));
      }

      if (path === "/api/records/v1/bills/bill-1") {
        return new Response(JSON.stringify({
          id: "bill-1", account_id: "acc-1", name: "Rent", active: 1, recurrence: '{"type":"monthly","monthly":{"day":1}}'
        }));
      }

      if (path === "/api/records/v1/payments") {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ id: "pay-new", bill_id: "bill-1" }));
        }
        return new Response(JSON.stringify({
          records: [
            { id: "pay-1", bill_id: "bill-1", due_date: "2026-01-15", amount_cents: 1500 }
          ]
        }));
      }

      if (path === "/api/records/v1/payments/pay-1") {
        return new Response(JSON.stringify({
          id: "pay-1", bill_id: "bill-1", due_date: "2026-01-15", amount_cents: 1500
        }));
      }

      if (path === "/api/records/v1/account_users") {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ success: true }));
        }
        return new Response(JSON.stringify({
          records: [
            { id: "au-1", account_id: "acc-1", user_id: "user-123" }
          ]
        }));
      }

      return new Response(JSON.stringify({ success: true }));
    });

    // Mock FS & Crypto for JWT verifyToken tests
    existsSpy = spyOn(fs, "existsSync").mockImplementation(() => true);
    readSpy = spyOn(fs, "readFileSync").mockImplementation(((path: any, options: any) => "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAMNfK1b7Z\n-----END PUBLIC KEY-----") as any);
    importKeySpy = spyOn(crypto.subtle, "importKey").mockResolvedValue({} as any);
    jwtVerifySpy = spyOn(jwt, "verify").mockResolvedValue({ sub: "user-123" } as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    existsSpy.mockRestore();
    readSpy.mockRestore();
    importKeySpy.mockRestore();
    jwtVerifySpy.mockRestore();
  });

  describe("TrailbaseClient", () => {
    test("handles API errors gracefully", async () => {
      fetchSpy.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
      const client = new TrailbaseClient();
      expect(client.listAccounts()).rejects.toThrow("Trailbase API error: [500]");
    });

    test("listAccounts fetches and maps accounts", async () => {
      const client = new TrailbaseClient();
      const accounts = await client.listAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe("Acc 1");
      expect(accounts[0].archived).toBe(false);
    });

    test("getAccount retrieves account", async () => {
      const client = new TrailbaseClient();
      const acc = await client.getAccount("acc-1");
      expect(acc.id).toBe("acc-1");
    });

    test("createAccount posts new account", async () => {
      const client = new TrailbaseClient();
      const payload = { id: "acc-new", name: "New Acc", currencies: ["USD"], default_currency: "USD" };
      const acc = await client.createAccount(payload);
      expect(acc.id).toBe("acc-new");
    });

    test("updateAccount patches account", async () => {
      const client = new TrailbaseClient();
      const acc = await client.updateAccount("acc-1", { name: "Updated Name" });
      expect(acc.id).toBe("acc-1");
    });

    test("deleteAccount deletes account", async () => {
      const client = new TrailbaseClient();
      await client.deleteAccount("acc-1");
      expect(fetchSpy).toHaveBeenCalled();
    });

    test("listBills fetches and filters bills", async () => {
      const client = new TrailbaseClient();
      const bills = await client.listBills("acc-1");
      expect(bills).toHaveLength(1);
      expect(bills[0].id).toBe("bill-1");
    });

    test("getBill retrieves bill details", async () => {
      const client = new TrailbaseClient();
      const bill = await client.getBill("bill-1");
      expect(bill.id).toBe("bill-1");
      expect(bill.active).toBe(true);
    });

    test("createBill posts new bill", async () => {
      const client = new TrailbaseClient();
      const newBill = await client.createBill({
        id: "bill-new",
        account_id: "acc-1",
        name: "New Bill",
        currency: "USD",
        amount_cents: 1500,
        amount_type: "fixed",
        recurrence: { type: "monthly", monthly: { day: 1 } },
        start_date: "2026-01-01",
        active: true,
      });
      expect(newBill.id).toBe("bill-new");
    });

    test("updateBill updates bill info", async () => {
      const client = new TrailbaseClient();
      const updated = await client.updateBill("bill-1", { name: "Updated Bill" });
      expect(updated.id).toBe("bill-1");
    });

    test("deleteBill deletes bill", async () => {
      const client = new TrailbaseClient();
      await client.deleteBill("bill-1");
      expect(fetchSpy).toHaveBeenCalled();
    });

    test("listPayments filters payments", async () => {
      const client = new TrailbaseClient();
      const payments = await client.listPayments("bill-1");
      expect(payments).toHaveLength(1);
      expect(payments[0].id).toBe("pay-1");
    });

    test("getPayment retrieves payment", async () => {
      const client = new TrailbaseClient();
      const p = await client.getPayment("pay-1");
      expect(p.id).toBe("pay-1");
    });

    test("createPayment posts payment", async () => {
      const client = new TrailbaseClient();
      const p = await client.createPayment({
        id: "pay-new",
        bill_id: "bill-1",
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: null,
      });
      expect(p.id).toBe("pay-new");
    });

    test("updatePayment patches payment", async () => {
      const client = new TrailbaseClient();
      const p = await client.updatePayment("pay-1", { amount_cents: 1600 });
      expect(p.id).toBe("pay-1");
    });

    test("deletePayment deletes payment", async () => {
      const client = new TrailbaseClient();
      await client.deletePayment("pay-1");
      expect(fetchSpy).toHaveBeenCalled();
    });

    test("listAccountUsers lists associates", async () => {
      const client = new TrailbaseClient();
      const users = await client.listAccountUsers();
      expect(users).toHaveLength(1);
      expect(users[0].id).toBe("au-1");
    });

    test("associateUserToAccount associates user", async () => {
      const client = new TrailbaseClient();
      await client.associateUserToAccount("acc-1", "user-123");
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  describe("getDb helper", () => {
    test("returns default db instance when no arguments", () => {
      const result = getDb();
      expect(result).toBe(db);
    });

    test("returns new client with custom token when string passed", () => {
      const result = getDb("custom-auth-token");
      expect(result).not.toBe(db);
      expect(result).toBeInstanceOf(TrailbaseClient);
    });

    test("extracts Auth header from Hono context", () => {
      const mockContext = {
        req: {
          header: (name: string) => {
            if (name === "Authorization") return "Bearer ctx-token";
            return null;
          }
        }
      };
      const result = getDb(mockContext as any);
      expect(result).not.toBe(db);
      expect(result).toBeInstanceOf(TrailbaseClient);
    });
  });

  describe("verifyToken helper", () => {
    test("verifies Bearer token properly", async () => {
      const payload = await verifyToken("Bearer dummy-jwt");
      expect(payload).toEqual({ sub: "user-123" });
      expect(jwtVerifySpy).toHaveBeenCalled();
    });
  });
});
