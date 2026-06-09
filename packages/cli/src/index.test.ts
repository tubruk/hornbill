import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { resolveConfig, loadConfig, saveConfig, getConfigPath, getConfigDir } from "./config";
import { checkStatus, checkAuth, listBills, listPayments, payPayment, login, createApiKey } from "./api";
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from "node:fs";
import type { Bill, Payment } from "@hornbill/core";

// Helper to set mock fetch without TypeScript typing errors or any keyword
function setMockFetch(fn: (input: unknown, init?: unknown) => Promise<Response>): void {
  global.fetch = fn as unknown as typeof fetch;
}

describe("CLI Config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear config environment variables
    delete process.env.HORNBILL_API_URL;
    delete process.env.HORNBILL_API_KEY;
    
    // Clean up config file if exists
    const path = getConfigPath();
    if (existsSync(path)) {
      unlinkSync(path);
    }
  });

  afterEach(() => {
    // Restore environment variables
    process.env = { ...originalEnv };
    const path = getConfigPath();
    if (existsSync(path)) {
      unlinkSync(path);
    }
  });

  it("should load empty config if file doesn't exist", () => {
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("should load empty config if file contains invalid JSON", () => {
    const path = getConfigPath();
    const configDir = getConfigDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    writeFileSync(path, "invalid-json-content", "utf-8");
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("should save and load config values", () => {
    const testConfig = { url: "http://test-server:1234", key: "hb_pat_test123" };
    saveConfig(testConfig);

    const loaded = loadConfig();
    expect(loaded).toEqual(testConfig);
  });

  it("should resolve config using priority: CLI options > Env > File > Default", () => {
    // 1. Default fallback
    let resolved = resolveConfig({});
    expect(resolved.url).toBe("http://localhost:3000");
    expect(resolved.key).toBe("");

    // 2. File config fallback
    saveConfig({ url: "http://from-file:3000", key: "key-from-file" });
    resolved = resolveConfig({});
    expect(resolved.url).toBe("http://from-file:3000");
    expect(resolved.key).toBe("key-from-file");

    // 3. Environment variable override
    process.env.HORNBILL_API_URL = "http://from-env:3000";
    process.env.HORNBILL_API_KEY = "key-from-env";
    resolved = resolveConfig({});
    expect(resolved.url).toBe("http://from-env:3000");
    expect(resolved.key).toBe("key-from-env");

    // 4. CLI Option override (highest priority)
    resolved = resolveConfig({ url: "http://from-cli:3000", key: "key-from-cli" });
    expect(resolved.url).toBe("http://from-cli:3000");
    expect(resolved.key).toBe("key-from-cli");
  });
});

describe("CLI API Client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should successfully retrieve server status", async () => {
    const mockStatus = { status: "ok", registration_enabled: true };
    
    setMockFetch(
      mock(() => {
        return Promise.resolve(
          new Response(JSON.stringify(mockStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    const status = await checkStatus("http://mock-server");
    expect(status).toEqual(mockStatus);
  });

  it("should check authorization and return true if successful", async () => {
    setMockFetch(
      mock(() => {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    const isAuthed = await checkAuth("http://mock-server", "hb_pat_123");
    expect(isAuthed).toBe(true);
  });

  it("should check authorization and return false if 401 Unauthorized", async () => {
    setMockFetch(
      mock(() => {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    const isAuthed = await checkAuth("http://mock-server", "hb_pat_invalid");
    expect(isAuthed).toBe(false);
  });

  it("should throw APIError for other error statuses", async () => {
    setMockFetch(
      mock(() => {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    expect(checkAuth("http://mock-server", "hb_pat_error")).rejects.toThrow(
      "Internal Server Error"
    );
  });

  it("should fetch active bills list", async () => {
    const mockBills: Bill[] = [
      {
        id: "bill-1",
        account_id: "acc-1",
        name: "Netflix",
        currency: "USD",
        amount_cents: 1599,
        amount_type: "fixed",
        active: true,
        start_date: "2026-06-01",
        recurrence: { type: "monthly", monthly: { day: 1 } },
        created_at: 1717142404,
        updated_at: 1717142404,
      },
    ];

    setMockFetch(
      mock(() => {
        return Promise.resolve(
          new Response(JSON.stringify(mockBills), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    const bills = await listBills("http://mock-server", "hb_pat_123");
    expect(bills).toEqual(mockBills);
  });

  it("should fetch payments list with billId option", async () => {
    const mockPayments: Payment[] = [
      {
        id: "payment-1",
        bill_id: "bill-1",
        due_date: "2026-06-01",
        amount_cents: 1599,
        paid_at: null,
        created_at: 1717142404,
        updated_at: 1717142404,
      },
    ];

    let calledUrl = "";
    setMockFetch(
      mock((url) => {
        calledUrl = (url as string | URL).toString();
        return Promise.resolve(
          new Response(JSON.stringify(mockPayments), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    const payments = await listPayments("http://mock-server", "hb_pat_123", { billId: "bill-1" });
    expect(payments).toEqual(mockPayments);
    expect(calledUrl).toContain("billId=bill-1");
  });

  it("should pay payment cycle successfully", async () => {
    const mockUpdatedPayment: Payment = {
      id: "payment-1",
      bill_id: "bill-1",
      due_date: "2026-06-01",
      amount_cents: 1599,
      paid_at: 1717142500,
      created_at: 1717142404,
      updated_at: 1717142404,
    };

    let calledBody = "";
    setMockFetch(
      mock((_, init) => {
        calledBody = (init as RequestInit)?.body?.toString() || "";
        return Promise.resolve(
          new Response(JSON.stringify(mockUpdatedPayment), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    const result = await payPayment("http://mock-server", "hb_pat_123", "payment-1", {
      paidAt: "2026-06-01T10:00:00Z",
      amountCents: 1599,
    });
    
    expect(result).toEqual(mockUpdatedPayment);
    expect(calledBody).toContain("paid_at");
    expect(calledBody).toContain("amount_cents");
  });

  it("should successfully log in", async () => {
    const mockAuthResult = { auth_token: "jwt-token-abc", csrf_token: "csrf-token-xyz" };
    let calledBody = "";
    
    setMockFetch(
      mock((_, init) => {
        calledBody = (init as RequestInit)?.body?.toString() || "";
        return Promise.resolve(
          new Response(JSON.stringify(mockAuthResult), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    const result = await login("http://mock-server", "test@example.com", "mypassword");
    expect(result).toEqual(mockAuthResult);
    expect(calledBody).toContain("test@example.com");
    expect(calledBody).toContain("mypassword");
  });

  it("should successfully create an API key", async () => {
    const mockKeyResult = {
      id: "key-1",
      user_id: "user-1",
      name: "hornbill-cli@test",
      token: "hb_pat_token123",
    };
    
    let calledHeader = "";
    let calledBody = "";
    setMockFetch(
      mock((_, init) => {
        const headers = (init as RequestInit)?.headers as Headers;
        calledHeader = (headers && "get" in headers ? headers.get("Authorization") : "") || "";
        calledBody = (init as RequestInit)?.body?.toString() || "";
        return Promise.resolve(
          new Response(JSON.stringify(mockKeyResult), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    const result = await createApiKey("http://mock-server", "jwt-token-abc", "hornbill-cli@test");
    expect(result).toEqual(mockKeyResult);
    expect(calledHeader).toBe("Bearer jwt-token-abc");
    expect(calledBody).toContain("hornbill-cli@test");
  });
});
