import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import type { Context } from "hono";
import { checkAccountAccess, checkBillAccess, checkPaymentAccess } from "./auth";
import * as trailbase from "../trailbase";
import type { Account, Bill, Payment } from "@hornbill/core";

function mockContext(options: {
  params?: Record<string, string>;
  queries?: Record<string, string>;
  bodyText?: string;
  authHeader?: string;
  contextData?: Record<string, any>;
}) {
  const data = options.contextData || {};
  return {
    req: {
      param: (key: string) => options.params?.[key],
      query: (key: string) => options.queries?.[key],
      header: (key: string) => key === "Authorization" ? options.authHeader : undefined,
      raw: {
        clone: () => ({
          json: async () => {
            if (options.bodyText === "INVALID") throw new Error("Invalid JSON");
            return options.bodyText ? JSON.parse(options.bodyText) : {};
          }
        })
      }
    },
    json: (obj: any, status: number) => ({ body: obj, status }),
    set: (key: string, val: any) => { data[key] = val; },
    get: (key: string) => data[key],
  } as unknown as Context;
}

describe("Auth Middleware", () => {
  let getDbSpy: any;
  let verifyAccountAccessSpy: any;
  let getAccountSpy: any;
  let getBillSpy: any;
  let getPaymentSpy: any;

  beforeEach(() => {
    getDbSpy = spyOn(trailbase, "getDb").mockImplementation(() => trailbase.db);
    verifyAccountAccessSpy = spyOn(trailbase, "verifyAccountAccess").mockResolvedValue(true);
    getAccountSpy = spyOn(trailbase.db, "getAccount").mockResolvedValue({ id: "acc-1", name: "Acc 1" } as Account);
    getBillSpy = spyOn(trailbase.db, "getBill").mockResolvedValue({ id: "bill-1", account_id: "acc-1", name: "Bill 1" } as Bill);
    getPaymentSpy = spyOn(trailbase.db, "getPayment").mockResolvedValue({ id: "pay-1", bill_id: "bill-1", amount_cents: 100 } as Payment);
  });

  afterEach(() => {
    getDbSpy.mockRestore();
    verifyAccountAccessSpy.mockRestore();
    getAccountSpy.mockRestore();
    getBillSpy.mockRestore();
    getPaymentSpy.mockRestore();
  });

  describe("checkAccountAccess", () => {
    test("extracts id from param and succeeds", async () => {
      const c = mockContext({ params: { id: "acc-1" } });
      let nextCalled = false;
      const middleware = checkAccountAccess("param", "id");
      await middleware(c, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      expect(c.get("account")).toEqual({ id: "acc-1", name: "Acc 1" });
    });

    test("extracts id from query", async () => {
      const c = mockContext({ queries: { accId: "acc-1" } });
      let nextCalled = false;
      const middleware = checkAccountAccess("query", "accId");
      await middleware(c, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    test("extracts id from body", async () => {
      const c = mockContext({ bodyText: JSON.stringify({ account_id: "acc-1" }) });
      let nextCalled = false;
      const middleware = checkAccountAccess("body", "account_id");
      await middleware(c, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    test("returns 400 on invalid body JSON", async () => {
      const c = mockContext({ bodyText: "INVALID" });
      const middleware = checkAccountAccess("body", "account_id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid JSON body");
    });

    test("returns 400 on missing ID", async () => {
      const c = mockContext({});
      const middleware = checkAccountAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing account ID reference (id)");
    });

    test("returns 403 on verifyAccountAccess forbidden", async () => {
      verifyAccountAccessSpy.mockResolvedValue(false);
      const c = mockContext({ params: { id: "acc-1" } });
      const middleware = checkAccountAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Forbidden: No access to this account");
    });

    test("returns 404 if account not found in database", async () => {
      getAccountSpy.mockResolvedValue(null as any);
      const c = mockContext({ params: { id: "acc-1" } });
      const middleware = checkAccountAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Account not found");
    });

    test("returns 500 if database getAccount fails", async () => {
      getAccountSpy.mockRejectedValue(new Error("DB error"));
      const c = mockContext({ params: { id: "acc-1" } });
      const middleware = checkAccountAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB error");
    });
  });

  describe("checkBillAccess", () => {
    test("extracts id from param and succeeds", async () => {
      const c = mockContext({ params: { id: "bill-1" } });
      let nextCalled = false;
      const middleware = checkBillAccess("param", "id");
      await middleware(c, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      expect(c.get("bill")).toEqual({ id: "bill-1", account_id: "acc-1", name: "Bill 1" });
    });

    test("extracts id from query", async () => {
      const c = mockContext({ queries: { billId: "bill-1" } });
      let nextCalled = false;
      const middleware = checkBillAccess("query", "billId");
      await middleware(c, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    test("extracts id from body", async () => {
      const c = mockContext({ bodyText: JSON.stringify({ bill_id: "bill-1" }) });
      let nextCalled = false;
      const middleware = checkBillAccess("body", "bill_id");
      await middleware(c, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    test("returns 400 on invalid body JSON", async () => {
      const c = mockContext({ bodyText: "INVALID" });
      const middleware = checkBillAccess("body", "bill_id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid JSON body");
    });

    test("returns 400 on missing ID", async () => {
      const c = mockContext({});
      const middleware = checkBillAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing bill ID reference (id)");
    });

    test("returns 404 if bill not found in database", async () => {
      getBillSpy.mockResolvedValue(null as any);
      const c = mockContext({ params: { id: "bill-1" } });
      const middleware = checkBillAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Bill not found");
    });

    test("returns 403 on verifyAccountAccess forbidden for bill", async () => {
      verifyAccountAccessSpy.mockResolvedValue(false);
      const c = mockContext({ params: { id: "bill-1" } });
      const middleware = checkBillAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Forbidden: No access to this bill");
    });

    test("returns 500 if database getBill fails", async () => {
      getBillSpy.mockRejectedValue(new Error("DB error"));
      const c = mockContext({ params: { id: "bill-1" } });
      const middleware = checkBillAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB error");
    });
  });

  describe("checkPaymentAccess", () => {
    test("extracts id from param and succeeds", async () => {
      const c = mockContext({ params: { id: "pay-1" } });
      let nextCalled = false;
      const middleware = checkPaymentAccess("param", "id");
      await middleware(c, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      expect(c.get("payment")).toEqual({ id: "pay-1", bill_id: "bill-1", amount_cents: 100 });
      expect(c.get("bill")).toEqual({ id: "bill-1", account_id: "acc-1", name: "Bill 1" });
    });

    test("extracts id from query", async () => {
      const c = mockContext({ queries: { payId: "pay-1" } });
      let nextCalled = false;
      const middleware = checkPaymentAccess("query", "payId");
      await middleware(c, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    test("extracts id from body", async () => {
      const c = mockContext({ bodyText: JSON.stringify({ payment_id: "pay-1" }) });
      let nextCalled = false;
      const middleware = checkPaymentAccess("body", "payment_id");
      await middleware(c, async () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    test("returns 400 on invalid body JSON", async () => {
      const c = mockContext({ bodyText: "INVALID" });
      const middleware = checkPaymentAccess("body", "payment_id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid JSON body");
    });

    test("returns 400 on missing ID", async () => {
      const c = mockContext({});
      const middleware = checkPaymentAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing payment ID reference (id)");
    });

    test("returns 404 if payment not found in database", async () => {
      getPaymentSpy.mockResolvedValue(null as any);
      const c = mockContext({ params: { id: "pay-1" } });
      const middleware = checkPaymentAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Payment not found");
    });

    test("returns 404 if associated bill not found in database", async () => {
      getBillSpy.mockResolvedValue(null as any);
      const c = mockContext({ params: { id: "pay-1" } });
      const middleware = checkPaymentAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Associated bill not found");
    });

    test("returns 403 on verifyAccountAccess forbidden for payment", async () => {
      verifyAccountAccessSpy.mockResolvedValue(false);
      const c = mockContext({ params: { id: "pay-1" } });
      const middleware = checkPaymentAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Forbidden: No access to this payment");
    });

    test("returns 500 if database getPayment fails", async () => {
      getPaymentSpy.mockRejectedValue(new Error("DB error"));
      const c = mockContext({ params: { id: "pay-1" } });
      const middleware = checkPaymentAccess("param", "id");
      const res: any = await middleware(c, async () => {});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB error");
    });
  });
});
