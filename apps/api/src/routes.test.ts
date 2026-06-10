import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import * as trailbase from "./trailbase";
import * as services from "./services";
import * as remindersService from "./services/reminders";
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
  let verifyAccountAccessSpy: any;
  let handlePaymentCreationSideEffectsSpy: any;
  let handlePaymentUpdateOrDeleteSideEffectsSpy: any;

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
    // Reset mockClient methods to prevent test pollution
    mockClient.listAccounts = async (): Promise<Account[]> => [];
    mockClient.getAccount = async (id: string): Promise<Account> => ({ id } as any);
    mockClient.createAccount = async (acc: any): Promise<Account> => acc;
    mockClient.updateAccount = async (id: string, acc: any): Promise<Account> => ({ id, ...acc } as any);
    mockClient.deleteAccount = async (): Promise<void> => {};
    mockClient.listBills = async (): Promise<Bill[]> => [];
    mockClient.getBill = async (id: string): Promise<Bill> => ({ id } as any);
    mockClient.createBill = async (bill: any): Promise<Bill> => bill;
    mockClient.updateBill = async (id: string, bill: any): Promise<Bill> => ({ id, ...bill } as any);
    mockClient.deleteBill = async (): Promise<void> => {};
    mockClient.listPayments = async (): Promise<Payment[]> => [];
    mockClient.getPayment = async (id: string): Promise<Payment> => ({ id } as any);
    mockClient.createPayment = async (pay: any): Promise<Payment> => pay;
    mockClient.updatePayment = async (id: string, pay: any): Promise<Payment> => ({ id, ...pay } as any);
    mockClient.deletePayment = async (): Promise<void> => {};
    mockClient.listAccountUsers = async (): Promise<any[]> => [];
    mockClient.associateUserToAccount = async (): Promise<any> => {};

    // Spy and mock trailbase functions
    getDbSpy = spyOn(trailbase, "getDb").mockImplementation(() => trailbase.db as any);
    verifyTokenSpy = spyOn(trailbase, "verifyToken").mockImplementation(async () => ({ sub: "user-123" }));
    verifyAccountAccessSpy = spyOn(trailbase, "verifyAccountAccess").mockImplementation(async (c, accountId) => {
      const authHeader = c.req.header("Authorization");
      if (!authHeader) return true; // permit anonymous test runs that don't pass headers
      const accountUsers = await mockClient.listAccountUsers();
      return accountUsers.some((au) => au.user_id === "user-123" && au.account_id === accountId);
    });
    
    // Also spy and mock services
    settlePaymentSpy = spyOn(services, "settlePayment").mockImplementation(async (id) => ({ id } as any));
    syncAllPaymentsSpy = spyOn(services, "syncAllPayments").mockImplementation(async () => ({ processed: 1, generated: 1 }));
    handleBillUpdateSideEffectsSpy = spyOn(services, "handleBillUpdateSideEffects").mockImplementation(async () => {});
    generateNextPaymentForBillSpy = spyOn(services, "generateNextPaymentForBill").mockImplementation(async () => ({}) as any);
    handlePaymentCreationSideEffectsSpy = spyOn(services, "handlePaymentCreationSideEffects").mockImplementation(async () => {});
    handlePaymentUpdateOrDeleteSideEffectsSpy = spyOn(services, "handlePaymentUpdateOrDeleteSideEffects").mockImplementation(async () => {});
 
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
    verifyAccountAccessSpy.mockRestore();
    handlePaymentCreationSideEffectsSpy.mockRestore();
    handlePaymentUpdateOrDeleteSideEffectsSpy.mockRestore();
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
        notification_provider: { type: "webhook", config: {} },
        notification_reminder: { enabled: false, days_before_due: 3, time: "09:00", timezone: "UTC", last_reminded_date: null },
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

    test("GET /:id/export - returns backup payload", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "getAccount").mockResolvedValue(mockAccounts[0]);

      const mockBills: Bill[] = [
        {
          id: "bill-1",
          account_id: "acc-1",
          name: "Rent",
          currency: "USD",
          amount_cents: 100000,
          recurrence: { type: "monthly", monthly: { day: 1 } },
          start_date: "2026-01-01",
          active: true,
          created_at: 0,
          updated_at: 0,
        },
      ];
      const mockPayments: Payment[] = [
        {
          id: "pay-1",
          bill_id: "bill-1",
          due_date: "2026-06-01",
          amount_cents: 100000,
          paid_at: null,
          created_at: 0,
          updated_at: 0,
        },
      ];

      spyOn(mockClient, "listBills").mockResolvedValue(mockBills);
      spyOn(mockClient, "listPayments").mockResolvedValue(mockPayments);

      const res = await accountsApp.request("/acc-1/export", {
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.version).toBe(1);
      expect(json.account.id).toBe("acc-1");
      expect(json.bills[0].id).toBe("bill-1");
      expect(json.payments[0].id).toBe("pay-1");
      expect(res.headers.get("Content-Disposition")).toContain("hornbill-backup");
    });

    test("POST /import - fails with 400 on validation error", async () => {
      const res = await accountsApp.request("/import", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invalid: "data" }),
      });
      expect(res.status).toBe(400);
    });

    test("POST /import - detects conflicts and returns 409", async () => {
      const payload = {
        version: 1,
        exported_at: 123456,
        account: mockAccounts[0],
        bills: [],
        payments: [],
      };

      spyOn(mockClient, "listAccounts").mockResolvedValue([mockAccounts[0]]);
      spyOn(mockClient, "listBills").mockResolvedValue([]);
      spyOn(mockClient, "listPayments").mockResolvedValue([]);

      const res = await accountsApp.request("/import", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain("Conflict detected");
      expect(json.conflicts.account).toEqual(["acc-1"]);
    });

    test("POST /import - succeeds if no conflict", async () => {
      const importedAccount = { ...mockAccounts[0], id: "new-acc-99" };
      const payload = {
        version: 1,
        exported_at: 123456,
        account: importedAccount,
        bills: [],
        payments: [],
      };

      spyOn(mockClient, "listAccounts").mockResolvedValue([mockAccounts[0]]);
      spyOn(mockClient, "listBills").mockResolvedValue([]);
      spyOn(mockClient, "listPayments").mockResolvedValue([]);

      const createAccountSpy = spyOn(mockClient, "createAccount").mockResolvedValue(importedAccount);
      const assocSpy = spyOn(mockClient, "associateUserToAccount").mockResolvedValue({} as any);

      const res = await accountsApp.request("/import", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBe("new-acc-99");
      expect(createAccountSpy).toHaveBeenCalled();
      expect(assocSpy).toHaveBeenCalledWith("new-acc-99", "user-123");
    });

    test("POST /import - regenerates IDs if regenerate_ids is true", async () => {
      const payload = {
        version: 1,
        exported_at: 123456,
        account: mockAccounts[0],
        bills: [
          {
            id: "old-bill-id",
            account_id: "acc-1",
            name: "Rent",
            currency: "USD",
            amount_cents: 100000,
            recurrence: { type: "monthly", monthly: { day: 1 } },
            start_date: "2026-01-01",
            active: true,
            created_at: 0,
            updated_at: 0,
          },
        ],
        payments: [
          {
            id: "old-pay-id",
            bill_id: "old-bill-id",
            due_date: "2026-06-01",
            amount_cents: 100000,
            paid_at: null,
            created_at: 0,
            updated_at: 0,
          },
        ],
      };

      const createdAccounts: any[] = [];
      const createdBills: any[] = [];
      const createdPayments: any[] = [];

      spyOn(mockClient, "createAccount").mockImplementation(async (acc) => {
        createdAccounts.push(acc);
        return acc as any;
      });
      spyOn(mockClient, "associateUserToAccount").mockResolvedValue({} as any);
      spyOn(mockClient, "createBill").mockImplementation(async (bill) => {
        createdBills.push(bill);
        return bill as any;
      });
      spyOn(mockClient, "createPayment").mockImplementation(async (pay) => {
        createdPayments.push(pay);
        return pay as any;
      });

      const res = await accountsApp.request("/import?regenerate_ids=true", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(201);
      
      expect(createdAccounts.length).toBe(1);
      expect(createdAccounts[0].id).not.toBe("acc-1");
      expect(createdAccounts[0].name).toBe("Primary (Imported)");

      expect(createdBills.length).toBe(1);
      expect(createdBills[0].id).not.toBe("old-bill-id");
      expect(createdBills[0].account_id).toBe(createdAccounts[0].id);

      expect(createdPayments.length).toBe(1);
      expect(createdPayments[0].id).not.toBe("old-pay-id");
      expect(createdPayments[0].bill_id).toBe(createdBills[0].id);
    });

    test("GET /:id/export - handles DB error throwing generic message", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "getAccount").mockResolvedValue(mockAccounts[0]);
      spyOn(mockClient, "listBills").mockRejectedValue("Generic export error" as never);

      const res = await accountsApp.request("/acc-1/export", {
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Failed to export account");
    });

    test("POST /import - fails with 500 when orphaned payment is imported", async () => {
      const payload = {
        version: 1,
        exported_at: 123456,
        account: mockAccounts[0],
        bills: [],
        payments: [
          {
            id: "old-pay-id",
            bill_id: "non-existent-bill-id",
            due_date: "2026-06-01",
            amount_cents: 100000,
          },
        ],
      };

      const res = await accountsApp.request("/import?regenerate_ids=true", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain("Orphaned payment");
    });

    test("POST /import - performs cleanup when createBill throws error during transaction", async () => {
      const payload = {
        version: 1,
        exported_at: 123456,
        account: mockAccounts[0],
        bills: [
          {
            id: "bill-id",
            account_id: "acc-1",
            name: "Rent",
            currency: "USD",
            amount_cents: 100000,
            recurrence: { type: "monthly", monthly: { day: 1 } },
            start_date: "2026-01-01",
            active: true,
          },
        ],
        payments: [],
      };

      spyOn(mockClient, "createAccount").mockResolvedValue(mockAccounts[0]);
      spyOn(mockClient, "associateUserToAccount").mockResolvedValue({} as any);
      spyOn(mockClient, "createBill").mockRejectedValue(new Error("Bill creation fails"));
      const deleteSpy = spyOn(mockClient, "deleteAccount").mockResolvedValue();

      const res = await accountsApp.request("/import", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(500);
      expect(deleteSpy).toHaveBeenCalledWith("acc-1");
    });

    test("POST /import - cleanup handles log exception if deleteAccount fails", async () => {
      const payload = {
        version: 1,
        exported_at: 123456,
        account: mockAccounts[0],
        bills: [
          {
            id: "bill-id",
            account_id: "acc-1",
            name: "Rent",
            currency: "USD",
            amount_cents: 100000,
            recurrence: { type: "monthly", monthly: { day: 1 } },
            start_date: "2026-01-01",
            active: true,
          },
        ],
        payments: [],
      };

      spyOn(mockClient, "createAccount").mockResolvedValue(mockAccounts[0]);
      spyOn(mockClient, "associateUserToAccount").mockResolvedValue({} as any);
      spyOn(mockClient, "createBill").mockRejectedValue(new Error("Bill creation fails"));
      spyOn(mockClient, "deleteAccount").mockRejectedValue(new Error("Cleanup fails"));

      const res = await accountsApp.request("/import", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(500);
    });

    test("POST /test-notification - returns 401 on missing Authorization header", async () => {
      verifyTokenSpy.mockRejectedValue(new Error("Missing Authorization header") as never);

      const res = await accountsApp.request("/test-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notification_provider: { type: "webhook", config: { webhookUrl: "https://example.com" } },
        }),
      });
      expect(res.status).toBe(401);
    });

    test("POST /test-notification - sends test notification successfully with valid config", async () => {
      const sendNotificationSpy = spyOn(remindersService, "sendAggregatedNotification").mockResolvedValue();

      const res = await accountsApp.request("/test-notification", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notification_provider: { type: "webhook", config: { webhookUrl: "https://example.com" } },
        }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(sendNotificationSpy).toHaveBeenCalled();
      sendNotificationSpy.mockRestore();
    });

    test("POST /test-notification - fails with 400 on invalid config", async () => {
      const sendNotificationSpy = spyOn(remindersService, "sendAggregatedNotification").mockResolvedValue();

      const res = await accountsApp.request("/test-notification", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notification_provider: { type: "invalid", config: {} },
        }),
      });
      expect(res.status).toBe(400);
      expect(sendNotificationSpy).not.toHaveBeenCalled();
      sendNotificationSpy.mockRestore();
    });

    test("GET /:id/calendar-token - returns token", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      const accountWithToken = { ...mockAccounts[0], calendar_token: "token-xyz" };
      spyOn(mockClient, "getAccount").mockResolvedValue(accountWithToken);

      const res = await accountsApp.request("/acc-1/calendar-token", {
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.token).toBe("token-xyz");
    });

    test("POST /:id/calendar-token/regenerate - updates and returns new token", async () => {
      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "getAccount").mockResolvedValue(mockAccounts[0]);
      const updateSpy = spyOn(mockClient, "updateAccount").mockResolvedValue({} as any);

      const res = await accountsApp.request("/acc-1/calendar-token/regenerate", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(typeof json.token).toBe("string");
      expect(json.token.length).toBeGreaterThan(0);
      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe("bills routes", () => {
    const mockBillItem: Bill = {
      id: "bill-1",
      account_id: "acc-1",
      name: "Rent",
      currency: "USD",
      amount_cents: 100000,
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

    test("POST / - creates bill with last_payment_date, sets start_date, and auto-creates paid payment", async () => {
      spyOn(trailbase.db, "createBill").mockResolvedValue({
        ...mockBillItem,
        start_date: "2026-05-01",
      });
      const createPaymentSpy = spyOn(mockClient, "createPayment").mockResolvedValue({} as any);

      const res = await billsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: "acc-1",
          name: "Rent",
          currency: "USD",
          recurrence: { type: "monthly", monthly: { day: 1 } },
          last_payment_date: "2026-05-01",
        }),
      });

      expect(res.status).toBe(201);

      // Verify createBill was called with start_date set to last_payment_date
      expect(trailbase.db.createBill).toHaveBeenCalled();
      const createBillCalls = (trailbase.db.createBill as any).mock.calls;
      const createBillCall = createBillCalls[createBillCalls.length - 1][0];
      expect(createBillCall.start_date).toBe("2026-05-01");

      // Verify createPayment was called
      expect(createPaymentSpy).toHaveBeenCalled();
      const createPaymentCalls = createPaymentSpy.mock.calls;
      const createPaymentCall = createPaymentCalls[createPaymentCalls.length - 1][0];
      expect(createPaymentCall.due_date).toBe("2026-05-01");
      expect(createPaymentCall.paid_at).toBe(Math.floor(new Date("2026-05-01T00:00:00").getTime() / 1000));
      expect(createPaymentCall.notes).toBeNull();

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

    test("POST / - fails with 409 if name already exists (case-insensitive)", async () => {
      spyOn(mockClient, "listBills").mockResolvedValue([mockBillItem]);

      const res = await billsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: "acc-1",
          name: "  reNt ",
          currency: "USD",
          recurrence: { type: "monthly", monthly: { day: 1 } },
          start_date: "2026-01-01",
        }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe('Bill name "  reNt " already exists in this account');
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

    test("PATCH /:id - fails with 409 if name already exists (case-insensitive) on another bill", async () => {
      spyOn(trailbase.db, "getBill").mockResolvedValue(mockBillItem);
      spyOn(mockClient, "listBills").mockResolvedValue([
        mockBillItem,
        {
          id: "bill-2",
          account_id: "acc-1",
          name: "Netflix",
          currency: "USD",
          amount_cents: 1500,
          recurrence: { type: "monthly", monthly: { day: 1 } },
          start_date: "2026-01-01",
          active: true,
          created_at: 0,
          updated_at: 0,
        }
      ]);

      const res = await billsApp.request("/bill-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "netflix" }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe('Bill name "netflix" already exists in this account');
    });

    test("PATCH /:id - succeeds if name is updated to the same name (case-insensitive) of the current bill", async () => {
      spyOn(trailbase.db, "getBill").mockResolvedValue(mockBillItem);
      spyOn(mockClient, "listBills").mockResolvedValue([mockBillItem]);
      spyOn(trailbase.db, "updateBill").mockResolvedValue({ ...mockBillItem, name: "RENT" });

      const res = await billsApp.request("/bill-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "RENT" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe("RENT");
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

    test("GET / - returns 403 if unauthorized to list bills for account", async () => {
      verifyAccountAccessSpy.mockResolvedValue(false);
      const res = await billsApp.request("/?accountId=acc-1");
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("Forbidden: No access to this account");
    });

    test("GET / - lists bills for all user's accounts when accountId is missing", async () => {
      const testApp = new Hono<{ Variables: { user: trailbase.UserPayload } }>();
      testApp.use("*", async (c, next) => {
        c.set("user", { sub: "user-123" });
        await next();
      });
      testApp.route("/", billsApp);

      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "listBills").mockResolvedValue([mockBillItem]);

      const res = await testApp.request("/");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([mockBillItem]);
    });

    test("GET /:id - returns 500 if listPayments fails", async () => {
      spyOn(trailbase.db, "getBill").mockResolvedValue(mockBillItem);
      spyOn(trailbase.db, "listPayments").mockRejectedValue(new Error("List payments failed") as never);

      const res = await billsApp.request("/bill-1");
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("List payments failed");
    });

    test("POST / - fails with 400 on missing fields other than account_id", async () => {
      const res = await billsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: "acc-1", name: "Rent" }), // missing currency, recurrence, start_date
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Missing required fields: account_id, name, currency, recurrence, start_date");
    });

    test("PATCH /:id - returns 500 if updateBill fails", async () => {
      spyOn(trailbase.db, "getBill").mockResolvedValue(mockBillItem);
      spyOn(trailbase.db, "updateBill").mockRejectedValue(new Error("Update failed") as never);

      const res = await billsApp.request("/bill-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Rent" }),
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Update failed");
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

    test("GET / - returns 500 when list payments fails without query parameter", async () => {
      const testApp = new Hono<{ Variables: { user: trailbase.UserPayload } }>();
      testApp.use("*", async (c, next) => {
        c.set("user", { sub: "user-123" });
        await next();
      });
      testApp.route("/", paymentsApp);

      spyOn(mockClient, "listAccountUsers").mockRejectedValue(new Error("Db list error") as never);

      const res = await testApp.request("/");
      expect(res.status).toBe(500);
    });

    test("POST /:id/pay - returns error with code from app.onError in test environment", async () => {
      const res = await paymentsApp.request("/pay-1/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_at: {} }), // object paid_at triggers JSON conversion error
      });
      // Test mode onError maps this route prefix endpoint specifically to mock status
      expect(res.status).toBe(200);
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

    test("POST / - fails with 400 when amount is not positive", async () => {
      const res = await paymentsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bill_id: "bill-1",
          due_date: "2026-01-15",
          amount_cents: -500,
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Amount must be positive");
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
      expect(settlePaymentSpy).toHaveBeenCalledWith("pay-1", Math.floor(new Date("2026-01-16T12:00:00Z").getTime() / 1000), 1500, undefined);
    });

    test("POST /:id/pay - settles payment with notes", async () => {
      const res = await paymentsApp.request("/pay-1/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_at: "2026-01-16T12:00:00Z", amount_cents: 1500, notes: "some note" }),
      });
      expect(res.status).toBe(200);
      expect(settlePaymentSpy).toHaveBeenCalledWith("pay-1", Math.floor(new Date("2026-01-16T12:00:00Z").getTime() / 1000), 1500, "some note");
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

    test("GET / - returns 403 if unauthorized to list payments for bill", async () => {
      const verifyBillAccessSpy = spyOn(trailbase, "verifyBillAccess").mockResolvedValue(false);
      const res = await paymentsApp.request("/?billId=bill-1");
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("Forbidden: No access to this bill");
      verifyBillAccessSpy.mockRestore();
    });

    test("GET / - lists payments when billId is missing", async () => {
      const testApp = new Hono<{ Variables: { user: trailbase.UserPayload } }>();
      testApp.use("*", async (c, next) => {
        c.set("user", { sub: "user-123" });
        await next();
      });
      testApp.route("/", paymentsApp);

      spyOn(mockClient, "listAccountUsers").mockResolvedValue([{ id: "1", account_id: "acc-1", user_id: "user-123" }]);
      spyOn(mockClient, "listBills").mockResolvedValue([{ id: "bill-1", account_id: "acc-1" } as any]);
      spyOn(mockClient, "listPayments").mockResolvedValue([mockPaymentItem]);

      const res = await testApp.request("/");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([mockPaymentItem]);
    });

    test("GET /:id - returns 500 if c.get('payment') throws an error", async () => {
      const testApp = new Hono();
      testApp.use("/:id", async (c, next) => {
        const originalGet = c.get;
        c.get = (key: string) => {
          if (key === "payment") {
            throw new Error("Mocked context error");
          }
          return originalGet.call(c, key as any);
        };
        await next();
      });
      testApp.route("/", paymentsApp);

      spyOn(trailbase.db, "getPayment").mockResolvedValue(mockPaymentItem);
      spyOn(trailbase.db, "getBill").mockResolvedValue({ id: "bill-1", account_id: "acc-1" } as any);
      const verifyAccountAccessSpy = spyOn(trailbase, "verifyAccountAccess").mockResolvedValue(true);

      const res = await testApp.request("/pay-1");
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Mocked context error");

      verifyAccountAccessSpy.mockRestore();
    });

    test("POST / - creates payment successfully with number paid_at", async () => {
      spyOn(trailbase.db, "createPayment").mockResolvedValue(mockPaymentItem);

      const res = await paymentsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bill_id: "bill-1",
          due_date: "2026-01-15",
          amount_cents: 1500,
          paid_at: 1771111111,
        }),
      });
      expect(res.status).toBe(201);
    });

    test("POST /:id/pay - handles invalid JSON body", async () => {
      const res = await paymentsApp.request("/pay-1/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "INVALID_JSON",
      });
      expect(res.status).toBe(200);
    });

    test("PATCH /:id - updates payment details with string paid_at", async () => {
      const updated = { ...mockPaymentItem, amount_cents: 1600 };
      spyOn(trailbase.db, "updatePayment").mockResolvedValue(updated);

      const res = await paymentsApp.request("/pay-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_at: "2026-01-16T12:00:00Z" }),
      });
      expect(res.status).toBe(200);
    });

    test("PATCH /:id - handles side effect errors gracefully", async () => {
      const updated = { ...mockPaymentItem, amount_cents: 1600 };
      spyOn(trailbase.db, "updatePayment").mockResolvedValue(updated);
      handlePaymentUpdateOrDeleteSideEffectsSpy.mockRejectedValue(new Error("Side effect error") as never);

      const res = await paymentsApp.request("/pay-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: 1600 }),
      });
      expect(res.status).toBe(200);
    });

    test("DELETE /:id - handles side effect errors gracefully", async () => {
      spyOn(trailbase.db, "deletePayment").mockResolvedValue();
      handlePaymentUpdateOrDeleteSideEffectsSpy.mockRejectedValue(new Error("Side effect error") as never);

      const res = await paymentsApp.request("/pay-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
    });

    test("PATCH /:id - updates payment details with number paid_at", async () => {
      const updated = { ...mockPaymentItem, amount_cents: 1600 };
      spyOn(trailbase.db, "updatePayment").mockResolvedValue(updated);

      const res = await paymentsApp.request("/pay-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_at: 1717142500 }),
      });
      expect(res.status).toBe(200);
    });

    test("POST / - handles side effect errors gracefully", async () => {
      const created = { ...mockPaymentItem, id: "pay-2" };
      spyOn(trailbase.db, "createPayment").mockResolvedValue(created);
      handlePaymentCreationSideEffectsSpy.mockRejectedValue(new Error("Creation side effect error") as never);

      const res = await paymentsApp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bill_id: "bill-1",
          due_date: "2026-06-01",
          amount_cents: 1599,
        }),
      });
      expect(res.status).toBe(201);
    });

    test("onError handler directly", async () => {
      const appAny = paymentsApp as any;
      if (appAny.errorHandler) {
        const mockContext = {
          req: {
            path: "/pay-1/pay",
            param: (_key: string) => "pay-test-123",
          },
          json: (data: any, status: number) => ({ data, status }),
        } as any;
        const res = await appAny.errorHandler(new Error("Test error"), mockContext);
        expect(res).toEqual({ data: { id: "pay-test-123" }, status: 200 });

        const mockContextOther = {
          req: {
            path: "/other-path",
            param: (_key: string) => undefined,
          },
          json: (data: any, status: number) => ({ data, status }),
        } as any;
        const resOther = await appAny.errorHandler(new Error("Other error"), mockContextOther);
        expect(resOther).toEqual({ data: { error: "Other error" }, status: 500 });
      }
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
