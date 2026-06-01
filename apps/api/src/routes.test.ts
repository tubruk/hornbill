import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import * as trailbase from "./trailbase";
import * as services from "./services";
import accountsApp from "./routes/accounts";
import billsApp from "./routes/bills";
import paymentsApp from "./routes/payments";
import jobsApp from "./routes/jobs";
import type { Account, Bill, Payment } from "@hornbill/core";

describe("API Routes", () => {
  let getDbSpy: any;
  let verifyTokenSpy: any;
  let settlePaymentSpy: any;
  let syncAllPaymentsSpy: any;
  let handleBillUpdateSideEffectsSpy: any;
  let generateNextPaymentForBillSpy: any;

  // We'll create a mock client with mocked methods
  const mockClient = {
    listAccounts: async (): Promise<Account[]> => [],
    getAccount: async (id: string): Promise<Account> => ({ id } as any),
    createAccount: async (acc: any): Promise<Account> => acc,
    updateAccount: async (id: string, acc: any): Promise<Account> => ({ id, ...acc } as any),
    deleteAccount: async (): Promise<void> => {},
    listBills: async (): Promise<Bill[]> => [],
    getBill: async (id: string): Promise<Bill> => ({ id } as any),
    createBill: async (bill: any): Promise<Bill> => bill,
    updateBill: async (id: string, bill: any): Promise<Bill> => ({ id, ...bill } as any),
    deleteBill: async (): Promise<void> => {},
    listPayments: async (): Promise<Payment[]> => [],
    getPayment: async (id: string): Promise<Payment> => ({ id } as any),
    createPayment: async (pay: any): Promise<Payment> => pay,
    updatePayment: async (id: string, pay: any): Promise<Payment> => ({ id, ...pay } as any),
    deletePayment: async (): Promise<void> => {},
    listAccountUsers: async (): Promise<any[]> => [],
    associateUserToAccount: async (): Promise<any> => {},
  };

  beforeEach(() => {
    // Spy and mock trailbase functions
    getDbSpy = spyOn(trailbase, "getDb").mockImplementation(() => trailbase.db as any);
    verifyTokenSpy = spyOn(trailbase, "verifyToken").mockImplementation(async () => ({ sub: "user-123" }));
    
    // Also spy and mock services
    settlePaymentSpy = spyOn(services, "settlePayment").mockImplementation(async (id) => ({ id } as any));
    syncAllPaymentsSpy = spyOn(services, "syncAllPayments").mockImplementation(async () => ({ processed: 1, generated: 1 }));
    handleBillUpdateSideEffectsSpy = spyOn(services, "handleBillUpdateSideEffects").mockImplementation(async () => {});
    generateNextPaymentForBillSpy = spyOn(services, "generateNextPaymentForBill").mockImplementation(async () => ({}) as any);

    // Mock all methods on the default db client to delegate dynamically to mockClient
    spyOn(trailbase.db, "listAccounts").mockImplementation((...args) => (mockClient.listAccounts as any)(...args));
    spyOn(trailbase.db, "getAccount").mockImplementation((...args) => (mockClient.getAccount as any)(...args));
    spyOn(trailbase.db, "createAccount").mockImplementation((...args) => (mockClient.createAccount as any)(...args));
    spyOn(trailbase.db, "updateAccount").mockImplementation((...args) => (mockClient.updateAccount as any)(...args));
    spyOn(trailbase.db, "deleteAccount").mockImplementation((...args) => (mockClient.deleteAccount as any)(...args));
    spyOn(trailbase.db, "listAccountUsers").mockImplementation((...args) => (mockClient.listAccountUsers as any)(...args));
    spyOn(trailbase.db, "associateUserToAccount").mockImplementation((...args) => (mockClient.associateUserToAccount as any)(...args));
    spyOn(trailbase.db, "listBills").mockImplementation((...args) => (mockClient.listBills as any)(...args));
    spyOn(trailbase.db, "getBill").mockImplementation((...args) => (mockClient.getBill as any)(...args));
    spyOn(trailbase.db, "createBill").mockImplementation((...args) => (mockClient.createBill as any)(...args));
    spyOn(trailbase.db, "updateBill").mockImplementation((...args) => (mockClient.updateBill as any)(...args));
    spyOn(trailbase.db, "deleteBill").mockImplementation((...args) => (mockClient.deleteBill as any)(...args));
    spyOn(trailbase.db, "listPayments").mockImplementation((...args) => (mockClient.listPayments as any)(...args));
    spyOn(trailbase.db, "getPayment").mockImplementation((...args) => (mockClient.getPayment as any)(...args));
    spyOn(trailbase.db, "createPayment").mockImplementation((...args) => (mockClient.createPayment as any)(...args));
    spyOn(trailbase.db, "updatePayment").mockImplementation((...args) => (mockClient.updatePayment as any)(...args));
    spyOn(trailbase.db, "deletePayment").mockImplementation((...args) => (mockClient.deletePayment as any)(...args));
  });

  afterEach(() => {
    getDbSpy.mockRestore();
    verifyTokenSpy.mockRestore();
    settlePaymentSpy.mockRestore();
    syncAllPaymentsSpy.mockRestore();
    handleBillUpdateSideEffectsSpy.mockRestore();
    generateNextPaymentForBillSpy.mockRestore();
  });

  describe("accounts routes", () => {
    const mockAccounts: Account[] = [
      {
        id: "acc-1",
        name: "Primary",
        upcoming_threshold_days: 7,
        currencies: ["USD"],
        default_currency: "USD",
        archived: false,
        created_at: 0,
        updated_at: 0,
      },
    ];

    test("GET / - returns user accounts", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "listAccounts").mockResolvedValue(mockAccounts);

      const res = await accountsApp.request("/", {
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(mockAccounts);
    });

    test("GET / - returns 401 on missing Authorization header", async () => {
      verifyTokenSpy.mockRejectedValue(new Error("Missing Authorization header") as never);

      const res = await accountsApp.request("/");
      expect(res.status).toBe(401);
    });

    test("GET / - returns 500 on database error", async () => {
      spyOn(mockClient, "listAccountUsers").mockRejectedValue(new Error("Db error") as never);

      const res = await accountsApp.request("/", {
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(500);
    });

    test("POST / - creates account successfully", async () => {
      const payload = {
        name: "Secondary",
        currencies: ["USD"],
        default_currency: "USD",
      };

      spyOn(mockClient, "createAccount").mockImplementation(async (acc) => acc as any);
      spyOn(mockClient, "associateUserToAccount").mockResolvedValue({} as any);

      const res = await accountsApp.request("/", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.name).toBe("Secondary");
      expect(json.currencies).toEqual(["USD"]);
    });

    test("POST / - fails with 400 on schema validation failure", async () => {
      const payload = {
        name: "", // name is required to be non-empty
        currencies: ["USD"],
        default_currency: "USD",
      };

      const res = await accountsApp.request("/", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(400);
    });

    test("POST / - fails with 400 if default currency not in currencies list", async () => {
      const payload = {
        name: "Secondary",
        currencies: ["IDR"],
        default_currency: "USD",
      };

      const res = await accountsApp.request("/", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(400);
    });

    test("GET /:id - returns account if authorized", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "getAccount").mockResolvedValue(mockAccounts[0]);

      const res = await accountsApp.request("/acc-1", {
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(mockAccounts[0]);
    });

    test("GET /:id - returns 403 if unauthorized to view account", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-2", user_id: "other-user" }]);

      const res = await accountsApp.request("/acc-1", {
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(403);
    });

    test("GET /:id - returns 500 on db error", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "getAccount").mockRejectedValue(new Error("Db error") as never);

      const res = await accountsApp.request("/acc-1", {
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(500);
    });

    test("PATCH /:id - updates account successfully", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "getAccount").mockResolvedValue(mockAccounts[0]);
      
      const updated = { ...mockAccounts[0], name: "Updated Name" };
      spyOn(mockClient, "updateAccount").mockResolvedValue(updated);

      const res = await accountsApp.request("/acc-1", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated Name" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe("Updated Name");
    });

    test("PATCH /:id - returns 403 if unauthorized to update", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-2", user_id: "other-user" }]);

      const res = await accountsApp.request("/acc-1", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated Name" }),
      });
      expect(res.status).toBe(403);
    });

    test("PATCH /:id - fails with 400 on invalid validation", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "getAccount").mockResolvedValue(mockAccounts[0]);

      const res = await accountsApp.request("/acc-1", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "" }), // empty name is invalid
      });
      expect(res.status).toBe(400);
    });

    test("DELETE /:id - deletes account successfully", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      const deleteSpy = spyOn(mockClient, "deleteAccount").mockResolvedValue();

      const res = await accountsApp.request("/acc-1", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith("acc-1");
    });

    test("DELETE /:id - returns 403 if unauthorized to delete", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-2", user_id: "other-user" }]);

      const res = await accountsApp.request("/acc-1", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(403);
    });

    test("POST / - returns 500 on database error during creation", async () => {
      const payload = {
        name: "Secondary",
        currencies: ["USD"],
        default_currency: "USD",
      };

      spyOn(mockClient, "createAccount").mockRejectedValue(new Error("Db creation error") as never);

      const res = await accountsApp.request("/", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(500);
    });

    test("PATCH /:id - returns 500 on database error during update", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "getAccount").mockResolvedValue(mockAccounts[0]);
      spyOn(mockClient, "updateAccount").mockRejectedValue(new Error("Db update error") as never);

      const res = await accountsApp.request("/acc-1", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated Name" }),
      });
      expect(res.status).toBe(500);
    });

    test("DELETE /:id - returns 500 on database error during deletion", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "deleteAccount").mockRejectedValue(new Error("Db delete error") as never);

      const res = await accountsApp.request("/acc-1", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(500);
    });
  });

  describe("bills routes", () => {
    const mockBillItem: Bill = {
      id: "bill-1",
      account_id: "acc-1",
      name: "Rent",
      currency: "USD",
      amount_cents: 100000,
      amount_type: "fixed",
      recurrence: { type: "monthly", monthly: { day: 1 } },
      start_date: "2026-01-01",
      active: true,
      created_at: 0,
      updated_at: 0,
    };

    test("GET / - lists bills", async () => {
      spyOn(trailbase.db, "listBills").mockResolvedValue([mockBillItem]);

      const res = await billsApp.request("/?accountId=acc-1");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([mockBillItem]);
    });

    test("GET / - returns 500 on db error", async () => {
      spyOn(trailbase.db, "listBills").mockRejectedValue(new Error("Db error") as never);

      const res = await billsApp.request("/?accountId=acc-1");
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Db error");
    });

    test("GET /:id - returns bill and its payments", async () => {
      spyOn(trailbase.db, "getBill").mockResolvedValue(mockBillItem);
      spyOn(trailbase.db, "listPayments").mockResolvedValue([]);

      const res = await billsApp.request("/bill-1");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ...mockBillItem, payments: [] });
    });

    test("GET /:id - returns 500 on db error", async () => {
      spyOn(trailbase.db, "getBill").mockRejectedValue(new Error("Not found") as never);

      const res = await billsApp.request("/bill-1");
      expect(res.status).toBe(500);
    });

    test("POST / - creates bill and triggers payment cycle generation", async () => {
      spyOn(trailbase.db, "createBill").mockResolvedValue(mockBillItem);

      const res = await billsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: "acc-1",
          name: "Rent",
          currency: "USD",
          recurrence: { type: "monthly", monthly: { day: 1 } },
          start_date: "2026-01-01",
        }),
      });
      expect(res.status).toBe(201);
      expect(generateNextPaymentForBillSpy).toHaveBeenCalledWith(mockBillItem.id);
    });

    test("POST / - fails with 400 on missing fields", async () => {
      const res = await billsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Rent" }),
      });
      expect(res.status).toBe(400);
    });

    test("POST / - returns 500 on db creation error", async () => {
      spyOn(trailbase.db, "createBill").mockRejectedValue(new Error("Unique constraint") as never);

      const res = await billsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: "acc-1",
          name: "Rent",
          currency: "USD",
          recurrence: { type: "monthly", monthly: { day: 1 } },
          start_date: "2026-01-01",
        }),
      });
      expect(res.status).toBe(500);
    });

    test("PATCH /:id - updates bill details and runs side effects", async () => {
      spyOn(trailbase.db, "getBill").mockResolvedValue(mockBillItem);
      const updated = { ...mockBillItem, name: "New Rent" };
      spyOn(trailbase.db, "updateBill").mockResolvedValue(updated);

      const res = await billsApp.request("/bill-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Rent" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe("New Rent");
      expect(handleBillUpdateSideEffectsSpy).toHaveBeenCalledWith("bill-1", mockBillItem, updated);
    });

    test("PATCH /:id - fails with 400 if modifying immutable currency", async () => {
      spyOn(trailbase.db, "getBill").mockResolvedValue(mockBillItem);

      const res = await billsApp.request("/bill-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: "IDR" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("currency is immutable");
    });

    test("PATCH /:id - fails with 400 if modifying immutable start_date", async () => {
      spyOn(trailbase.db, "getBill").mockResolvedValue(mockBillItem);

      const res = await billsApp.request("/bill-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: "2026-02-02" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("start_date is immutable");
    });

    test("DELETE /:id - deletes bill successfully", async () => {
      const spy = spyOn(trailbase.db, "deleteBill").mockResolvedValue();

      const res = await billsApp.request("/bill-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(spy).toHaveBeenCalledWith("bill-1");
    });

    test("DELETE /:id - returns 500 on db deletion error", async () => {
      spyOn(trailbase.db, "deleteBill").mockRejectedValue(new Error("Delete error") as never);

      const res = await billsApp.request("/bill-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(500);
    });

    test("POST / - handles errors during generateNextPaymentForBill gracefully", async () => {
      spyOn(trailbase.db, "createBill").mockResolvedValue(mockBillItem);
      generateNextPaymentForBillSpy.mockRejectedValue(new Error("Initial payment error") as never);

      const res = await billsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: "acc-1",
          name: "Rent",
          currency: "USD",
          recurrence: { type: "monthly", monthly: { day: 1 } },
          start_date: "2026-01-01",
        }),
      });
      // Silent catch, should still return 201
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(mockBillItem);
    });

    test("PATCH /:id - handles errors during handleBillUpdateSideEffects gracefully", async () => {
      spyOn(trailbase.db, "getBill").mockResolvedValue(mockBillItem);
      const updated = { ...mockBillItem, name: "New Rent" };
      spyOn(trailbase.db, "updateBill").mockResolvedValue(updated);
      handleBillUpdateSideEffectsSpy.mockRejectedValue(new Error("Side effects error") as never);

      const res = await billsApp.request("/bill-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Rent" }),
      });
      // Silent catch, should still return 200
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe("New Rent");
    });

    test("PATCH /:id - returns 500 on database error during updates", async () => {
      spyOn(trailbase.db, "getBill").mockRejectedValue(new Error("Database connection lost") as never);

      const res = await billsApp.request("/bill-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Rent" }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe("payments routes", () => {
    const mockPaymentItem: Payment = {
      id: "pay-1",
      bill_id: "bill-1",
      due_date: "2026-01-15",
      amount_cents: 1500,
      paid_at: null,
      created_at: 0,
      updated_at: 0,
    };

    test("GET / - lists payments", async () => {
      spyOn(trailbase.db, "listPayments").mockResolvedValue([mockPaymentItem]);

      const res = await paymentsApp.request("/?billId=bill-1");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([mockPaymentItem]);
    });

    test("GET / - returns 500 on db error", async () => {
      spyOn(trailbase.db, "listPayments").mockRejectedValue(new Error("Db error") as never);

      const res = await paymentsApp.request("/?billId=bill-1");
      expect(res.status).toBe(500);
    });

    test("GET /:id - returns payment details", async () => {
      spyOn(trailbase.db, "getPayment").mockResolvedValue(mockPaymentItem);

      const res = await paymentsApp.request("/pay-1");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(mockPaymentItem);
    });

    test("GET /:id - returns 500 on db error", async () => {
      spyOn(trailbase.db, "getPayment").mockRejectedValue(new Error("Not found") as never);

      const res = await paymentsApp.request("/pay-1");
      expect(res.status).toBe(500);
    });

    test("POST / - creates payment successfully", async () => {
      spyOn(trailbase.db, "createPayment").mockResolvedValue(mockPaymentItem);

      const res = await paymentsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bill_id: "bill-1",
          due_date: "2026-01-15",
          amount_cents: 1500,
          paid_at: "2026-01-16T12:00:00Z",
        }),
      });
      expect(res.status).toBe(201);
    });

    test("POST / - fails with 400 on missing fields", async () => {
      const res = await paymentsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_id: "bill-1" }),
      });
      expect(res.status).toBe(400);
    });

    test("POST / - returns 500 on db error", async () => {
      spyOn(trailbase.db, "createPayment").mockRejectedValue(new Error("Write error") as never);

      const res = await paymentsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bill_id: "bill-1",
          due_date: "2026-01-15",
          amount_cents: 1500,
        }),
      });
      expect(res.status).toBe(500);
    });

    test("POST /:id/pay - settles payment", async () => {
      const res = await paymentsApp.request("/pay-1/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_at: "2026-01-16T12:00:00Z", amount_cents: 1500 }),
      });
      expect(res.status).toBe(200);
      expect(settlePaymentSpy).toHaveBeenCalledWith("pay-1", Math.floor(new Date("2026-01-16T12:00:00Z").getTime() / 1000), 1500);
    });

    test("POST /:id/pay - returns 400 on settle error", async () => {
      settlePaymentSpy.mockRejectedValue(new Error("Already paid") as never);

      const res = await paymentsApp.request("/pay-1/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_at: "2026-01-16T12:00:00Z" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Already paid");
    });

    test("PATCH /:id - updates payment details", async () => {
      const updated = { ...mockPaymentItem, amount_cents: 1600 };
      spyOn(trailbase.db, "updatePayment").mockResolvedValue(updated);

      const res = await paymentsApp.request("/pay-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: 1600 }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.amount_cents).toBe(1600);
    });

    test("PATCH /:id - returns 500 on db error", async () => {
      spyOn(trailbase.db, "updatePayment").mockRejectedValue(new Error("Update error") as never);

      const res = await paymentsApp.request("/pay-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: 1600 }),
      });
      expect(res.status).toBe(500);
    });

    test("DELETE /:id - deletes payment", async () => {
      const spy = spyOn(trailbase.db, "deletePayment").mockResolvedValue();

      const res = await paymentsApp.request("/pay-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(spy).toHaveBeenCalledWith("pay-1");
    });

    test("DELETE /:id - returns 500 on db error", async () => {
      spyOn(trailbase.db, "deletePayment").mockRejectedValue(new Error("Delete error") as never);

      const res = await paymentsApp.request("/pay-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(500);
    });
  });

  describe("jobs routes", () => {
    test("POST /sync - runs global sync", async () => {
      const res = await jobsApp.request("/sync", {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(syncAllPaymentsSpy).toHaveBeenCalled();
    });

    test("POST /sync - returns 500 on db error", async () => {
      syncAllPaymentsSpy.mockRejectedValue(new Error("Global sync error") as never);

      const res = await jobsApp.request("/sync", {
        method: "POST",
      });
      expect(res.status).toBe(500);
    });

    test("POST /sync/account/:accountId - runs account‑scoped sync", async () => {
      spyOn(mockClient, "getAccount").mockResolvedValue({ id: "acc-123" } as any);

      const res = await jobsApp.request("/sync/account/acc-123", {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(syncAllPaymentsSpy).toHaveBeenCalledWith("acc-123");
    });

    test("POST /sync/account/:accountId - returns 404 if account not found", async () => {
      spyOn(mockClient, "getAccount").mockResolvedValue(null as any);

      const res = await jobsApp.request("/sync/account/non-existent", {
        method: "POST",
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Account not found");
    });

    test("POST /sync/account/:accountId - returns 500 on db error", async () => {
      spyOn(mockClient, "getAccount").mockRejectedValue(new Error("Database offline") as never);

      const res = await jobsApp.request("/sync/account/acc-123", {
        method: "POST",
      });
      expect(res.status).toBe(500);
    });
  });
});
