import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import { TrailbaseClient, db, getDb, verifyToken, verifyAccountAccess, verifyBillAccess, verifyPaymentAccess } from "./trailbase";
import { uuidSchema } from "./utils/openapi-errors";
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

      if (path === "/api/records/v1/api_keys") {
        if (init?.method === "POST") {
          const body = JSON.parse(init.body);
          return new Response(JSON.stringify({ id: "key-new", ...body }));
        }
        return new Response(JSON.stringify({
          records: [
            { id: "key-1", user_id: "user-123", name: "Key 1", token_hash: "hash-123", created_at: 1717142404, last_used_at: null },
            { id: "key-2", user_id: { id: "user-456" }, name: "Key 2", token_hash: "hash-456", created_at: 1717142404, last_used_at: 1717142500 }
          ]
        }));
      }

      if (path.startsWith("/api/records/v1/api_keys/")) {
        const id = path.split("/").pop() || "";
        if (init?.method === "PATCH") {
          return new Response(JSON.stringify({ success: true }));
        }
        if (init?.method === "DELETE") {
          return new Response(JSON.stringify({ success: true }));
        }
        return new Response(JSON.stringify({
          id, user_id: "user-123", name: "Key 1", token_hash: "hash-123", created_at: 1717142404, last_used_at: null
        }));
      }

      return new Response(JSON.stringify({ success: true }));
    });

    // Mock FS & Crypto for JWT verifyToken tests
    existsSpy = spyOn(fs, "existsSync").mockImplementation(() => true);
    readSpy = spyOn(fs, "readFileSync").mockImplementation(((_path: any, _options: any) => "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAMNfK1b7Z\n-----END PUBLIC KEY-----") as any);
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

    test("listApiKeys fetches and filters api keys", async () => {
      const client = new TrailbaseClient();
      const keys = await client.listApiKeys();
      expect(keys).toHaveLength(2);
      expect(keys[0].id).toBe("key-1");
      expect(keys[0].user_id).toBe("user-123");
      expect(keys[1].user_id).toBe("user-456");

      const filteredKeys = await client.listApiKeys("user-123");
      expect(filteredKeys).toHaveLength(1);
      expect(filteredKeys[0].id).toBe("key-1");
    });

    test("getApiKey retrieves api key", async () => {
      const client = new TrailbaseClient();
      const key = await client.getApiKey("key-1");
      expect(key.id).toBe("key-1");
      expect(key.user_id).toBe("user-123");
    });

    test("createApiKey posts new api key", async () => {
      const client = new TrailbaseClient();
      const payload = { id: "key-new", user_id: "user-123", name: "New Key", token_hash: "hash-new" };
      const key = await client.createApiKey(payload);
      expect(key.id).toBe("key-new");
      expect(key.created_at).toBeDefined();
    });

    test("updateApiKeyLastUsed patches api key last_used_at", async () => {
      const client = new TrailbaseClient();
      await client.updateApiKeyLastUsed("key-1");
      expect(fetchSpy).toHaveBeenCalled();
    });

    test("deleteApiKey deletes api key", async () => {
      const client = new TrailbaseClient();
      await client.deleteApiKey("key-1");
      expect(fetchSpy).toHaveBeenCalled();
    });

    test("verifyApiKeyHash verifies api key hash and updates last_used_at", async () => {
      const client = new TrailbaseClient();
      const payload = await client.verifyApiKeyHash("hash-123");
      expect(payload).toEqual({ sub: "user-123" });
      
      const payloadNone = await client.verifyApiKeyHash("non-existent-hash");
      expect(payloadNone).toBeNull();
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

  describe("Access Verification Helpers", () => {
    let getMap: Map<string, any>;
    let contextMock: any;

    beforeEach(() => {
      getMap = new Map();
      contextMock = {
        get: (key: string) => getMap.get(key),
        set: (key: string, val: any) => getMap.set(key, val),
        req: {
          header: (name: string) => {
            if (name === "Authorization") return "Bearer valid-token";
            return null;
          }
        }
      };
    });

    describe("verifyAccountAccess", () => {
      test("succeeds with cached user and matching cached account ID", async () => {
        getMap.set("user", { sub: "user-123" });
        getMap.set("myAccountIds", new Set(["acc-1"]));
        const hasAccess = await verifyAccountAccess(contextMock as any, "acc-1");
        expect(hasAccess).toBe(true);
      });

      test("fails with cached user and non-matching cached account ID", async () => {
        getMap.set("user", { sub: "user-123" });
        getMap.set("myAccountIds", new Set(["acc-1"]));
        const hasAccess = await verifyAccountAccess(contextMock as any, "acc-2");
        expect(hasAccess).toBe(false);
      });

      test("succeeds by verifying Auth header and loading accounts from db when cache is empty", async () => {
        const hasAccess = await verifyAccountAccess(contextMock as any, "acc-1");
        expect(hasAccess).toBe(true);
        expect(getMap.get("myAccountIds")).toBeInstanceOf(Set);
        expect(getMap.get("myAccountIds").has("acc-1")).toBe(true);
      });

      test("fails when Auth header is missing and no user in cache", async () => {
        contextMock.req.header = () => null;
        const hasAccess = await verifyAccountAccess(contextMock as any, "acc-1");
        expect(hasAccess).toBe(false);
      });

      test("fails when token verification throws an error", async () => {
        jwtVerifySpy.mockRejectedValue(new Error("JWT verify error"));
        const hasAccess = await verifyAccountAccess(contextMock as any, "acc-1");
        expect(hasAccess).toBe(false);
      });

      test("fails when listing account users fails", async () => {
        fetchSpy.mockResolvedValue(new Response("Db Error", { status: 500 }));
        const hasAccess = await verifyAccountAccess(contextMock as any, "acc-1");
        expect(hasAccess).toBe(false);
      });
    });

    describe("verifyBillAccess", () => {
      test("succeeds with cached bill matching the id", async () => {
        getMap.set("user", { sub: "user-123" });
        getMap.set("myAccountIds", new Set(["acc-1"]));
        getMap.set("bill", { id: "bill-1", account_id: "acc-1" });
        const hasAccess = await verifyBillAccess(contextMock as any, "bill-1");
        expect(hasAccess).toBe(true);
      });

      test("succeeds by loading bill from db when cache is empty/mismatching", async () => {
        getMap.set("user", { sub: "user-123" });
        getMap.set("myAccountIds", new Set(["acc-1"]));
        const hasAccess = await verifyBillAccess(contextMock as any, "bill-1");
        expect(hasAccess).toBe(true);
      });

      test("fails when database load throws an error", async () => {
        fetchSpy.mockResolvedValue(new Response("Db Error", { status: 500 }));
        const hasAccess = await verifyBillAccess(contextMock as any, "bill-1");
        expect(hasAccess).toBe(false);
      });
    });

    describe("verifyPaymentAccess", () => {
      test("succeeds with cached payment matching the id", async () => {
        getMap.set("user", { sub: "user-123" });
        getMap.set("myAccountIds", new Set(["acc-1"]));
        getMap.set("payment", { id: "pay-1", bill_id: "bill-1" });
        const hasAccess = await verifyPaymentAccess(contextMock as any, "pay-1");
        expect(hasAccess).toBe(true);
      });

      test("succeeds by loading payment from db when cache is empty/mismatching", async () => {
        getMap.set("user", { sub: "user-123" });
        getMap.set("myAccountIds", new Set(["acc-1"]));
        const hasAccess = await verifyPaymentAccess(contextMock as any, "pay-1");
        expect(hasAccess).toBe(true);
      });

      test("fails when database load throws an error", async () => {
        fetchSpy.mockResolvedValue(new Response("Db Error", { status: 500 }));
        const hasAccess = await verifyPaymentAccess(contextMock as any, "pay-1");
        expect(hasAccess).toBe(false);
      });
    });
  });

  describe("uuidSchema validation details", () => {
    test("uuidSchema matches expected format when in non-test mode", () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const schema = uuidSchema();
        
        // standard UUID
        expect(schema.safeParse("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d").success).toBe(true);
        // base64 trailbase UUID
        expect(schema.safeParse("DlQl7Tf6ShOnrepGm0dbWw==").success).toBe(true);
        // URL-safe base64 trailbase UUID
        expect(schema.safeParse("To9Wfp-ZQ-KfKS_dIx5dEA==").success).toBe(true);
        // invalid inputs
        expect(schema.safeParse("not-a-uuid").success).toBe(false);
        expect(schema.safeParse("DlQl7Tf6ShOnrepGm0dbWw=").success).toBe(false);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });
});
