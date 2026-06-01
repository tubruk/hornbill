import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import { db } from "./trailbase";
import {
  generateNextPaymentForBill,
  settlePayment,
  syncAllPayments,
  handleBillUpdateSideEffects,
} from "./services";
import type { Bill, Payment } from "@hornbill/core";

describe("Services Logic", () => {
  let getBillSpy: any;
  let listPaymentsSpy: any;
  let createPaymentSpy: any;
  let updatePaymentSpy: any;
  let deletePaymentSpy: any;
  let listBillsSpy: any;

  beforeEach(() => {
    getBillSpy = spyOn(db, "getBill").mockImplementation(() => Promise.resolve({} as any));
    listPaymentsSpy = spyOn(db, "listPayments").mockImplementation(() => Promise.resolve([]));
    createPaymentSpy = spyOn(db, "createPayment").mockImplementation((p) => Promise.resolve(p as any));
    updatePaymentSpy = spyOn(db, "updatePayment").mockImplementation((id, p) => Promise.resolve({ id, ...p } as any));
    deletePaymentSpy = spyOn(db, "deletePayment").mockImplementation(() => Promise.resolve());
    listBillsSpy = spyOn(db, "listBills").mockImplementation(() => Promise.resolve([]));
  });

  afterEach(() => {
    getBillSpy.mockRestore();
    listPaymentsSpy.mockRestore();
    createPaymentSpy.mockRestore();
    updatePaymentSpy.mockRestore();
    deletePaymentSpy.mockRestore();
    listBillsSpy.mockRestore();
  });

  const mockBill = (overrides: Partial<Bill> = {}): Bill => ({
    id: "bill-123",
    account_id: "acc-123",
    name: "Netflix",
    currency: "USD",
    amount_cents: 1500,
    amount_type: "fixed",
    recurrence: {
      type: "monthly",
      monthly: { day: 15 },
    },
    start_date: "2026-01-01",
    active: true,
    created_at: 1717200000,
    updated_at: 1717200000,
    ...overrides,
  });

  describe("generateNextPaymentForBill", () => {
    test("throws error if bill is inactive", async () => {
      const bill = mockBill({ active: false });
      getBillSpy.mockResolvedValue(bill);

      expect(generateNextPaymentForBill(bill.id)).rejects.toThrow(
        "Cannot create payment for inactive bill"
      );
    });

    test("returns null if an unpaid payment already exists", async () => {
      const bill = mockBill({ active: true });
      const payments: Payment[] = [
        {
          id: "pay-1",
          bill_id: bill.id,
          due_date: "2026-01-15",
          amount_cents: 1500,
          paid_at: null, // unpaid
          created_at: 1717200000,
          updated_at: 1717200000,
        },
      ];
      getBillSpy.mockResolvedValue(bill);
      listPaymentsSpy.mockResolvedValue(payments);

      const result = await generateNextPaymentForBill(bill.id);
      expect(result).toBeNull();
      expect(createPaymentSpy).not.toHaveBeenCalled();
    });

    test("generates payment with start_date if no previous payments exist", async () => {
      const bill = mockBill({ active: true, start_date: "2026-02-10" });
      getBillSpy.mockResolvedValue(bill);
      listPaymentsSpy.mockResolvedValue([]);

      const mockCreatedPayment: Payment = {
        id: "new-pay-uuid",
        bill_id: bill.id,
        due_date: "2026-02-10",
        amount_cents: 1500,
        paid_at: null,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      createPaymentSpy.mockResolvedValue(mockCreatedPayment);

      const result = await generateNextPaymentForBill(bill.id);
      expect(result).toEqual(mockCreatedPayment);
      expect(createPaymentSpy).toHaveBeenCalled();
      const createArgs = createPaymentSpy.mock.calls[0][0];
      expect(createArgs.due_date).toBe("2026-02-10");
      expect(createArgs.amount_cents).toBe(1500);
      expect(createArgs.paid_at).toBeNull();
    });

    test("generates payment with next recurrence date based on latest paid payment", async () => {
      const bill = mockBill({
        active: true,
        recurrence: {
          type: "monthly",
          monthly: { day: 15 },
        },
      });
      const payments: Payment[] = [
        {
          id: "pay-1",
          bill_id: bill.id,
          due_date: "2026-01-15",
          amount_cents: 1500,
          paid_at: 1768488000, // Jan 15 2026
          created_at: 1717200000,
          updated_at: 1717200000,
        },
      ];
      getBillSpy.mockResolvedValue(bill);
      listPaymentsSpy.mockResolvedValue(payments);

      const mockCreatedPayment: Payment = {
        id: "new-pay-uuid",
        bill_id: bill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      createPaymentSpy.mockResolvedValue(mockCreatedPayment);

      const result = await generateNextPaymentForBill(bill.id);
      expect(result).toEqual(mockCreatedPayment);
      expect(createPaymentSpy).toHaveBeenCalled();
      const createArgs = createPaymentSpy.mock.calls[0][0];
      expect(createArgs.due_date).toBe("2026-02-15");
    });
  });

  describe("settlePayment", () => {
    test("throws error if payment is already settled", async () => {
      const payment: Payment = {
        id: "pay-1",
        bill_id: "bill-1",
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: 1768488000, // already paid
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      spyOn(db, "getPayment").mockResolvedValue(payment);

      expect(settlePayment(payment.id)).rejects.toThrow("Payment is already settled");
    });

    test("throws error if paidAt is before the bill's start date for the first payment", async () => {
      const bill = mockBill({ start_date: "2026-02-10" });
      const payment: Payment = {
        id: "pay-1",
        bill_id: bill.id,
        due_date: "2026-02-10",
        amount_cents: 1500,
        paid_at: null,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      spyOn(db, "getPayment").mockResolvedValue(payment);
      getBillSpy.mockResolvedValue(bill);
      listPaymentsSpy.mockResolvedValue([payment]);

      // Feb 10 2026 00:00:00 local time is around 1770656400 (or similar). Let's pass a very early timestamp (e.g. year 2025).
      const paidAtBeforeStart = Math.floor(new Date("2025-12-31").getTime() / 1000);
      expect(settlePayment(payment.id, paidAtBeforeStart)).rejects.toThrow(
        "Payment date cannot be before the bill start date"
      );
    });

    test("settles payment successfully and triggers next payment generation", async () => {
      const bill = mockBill({ start_date: "2026-01-01" });
      const payment: Payment = {
        id: "pay-1",
        bill_id: bill.id,
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      spyOn(db, "getPayment").mockResolvedValue(payment);
      getBillSpy.mockResolvedValue(bill);
      listPaymentsSpy.mockResolvedValue([payment]);

      const paidAtTime = Math.floor(new Date("2026-01-16T12:00:00Z").getTime() / 1000);
      const updatedPayment: Payment = {
        ...payment,
        paid_at: paidAtTime,
        amount_cents: 1600,
      };
      updatePaymentSpy.mockResolvedValue(updatedPayment);

      // In generateNextPaymentForBill (which settlePayment calls internally):
      // The payments list will now have the settled payment.
      // Let's make generateNextPaymentForBill resolve nicely.
      // When it calls listPayments inside generateNextPaymentForBill, it gets the payment.
      // Since it's now paid, it calculates next due date and creates a new payment.
      const mockNewPayment: Payment = {
        id: "pay-2",
        bill_id: bill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      createPaymentSpy.mockResolvedValue(mockNewPayment);

      const result = await settlePayment(payment.id, paidAtTime, 1600);
      expect(result).toEqual(updatedPayment);
      expect(updatePaymentSpy).toHaveBeenCalledWith(payment.id, {
        paid_at: paidAtTime,
        amount_cents: 1600,
      });
    });
  });

  describe("syncAllPayments", () => {
    test("syncs active bills and ignores inactive bills", async () => {
      const activeBill1 = mockBill({ id: "active-1", active: true });
      const activeBill2 = mockBill({ id: "active-2", active: true });
      const inactiveBill = mockBill({ id: "inactive", active: false });

      listBillsSpy.mockResolvedValue([activeBill1, activeBill2, inactiveBill]);

      // Mock generateNextPaymentForBill calls.
      // First active bill generates a payment.
      // Second active bill already has an unpaid payment (returns null).
      getBillSpy.mockImplementation(async (id: string) => {
        if (id === "active-1") return activeBill1;
        if (id === "active-2") return activeBill2;
        return inactiveBill;
      });

      // active-1: no payments -> generates new
      // active-2: already has unpaid -> returns null
      listPaymentsSpy.mockImplementation(async (billId: string) => {
        if (billId === "active-1") return [];
        if (billId === "active-2") {
          return [
            {
              id: "unpaid-p",
              bill_id: "active-2",
              due_date: "2026-01-15",
              amount_cents: 1500,
              paid_at: null,
              created_at: 0,
              updated_at: 0,
            },
          ];
        }
        return [];
      });

      createPaymentSpy.mockResolvedValue({} as any);

      const stats = await syncAllPayments();
      expect(stats.processed).toBe(2); // Only active ones
      expect(stats.generated).toBe(1); // Only active-1 generated a new one
    });
  });

  describe("handleBillUpdateSideEffects", () => {
    test("deletes unpaid payment if bill is deactivated", async () => {
      const oldBill = mockBill({ active: true });
      const updatedBill = mockBill({ active: false });
      const unpaidPayment: Payment = {
        id: "unpaid-1",
        bill_id: oldBill.id,
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      listPaymentsSpy.mockResolvedValue([unpaidPayment]);

      await handleBillUpdateSideEffects(oldBill.id, oldBill, updatedBill);

      expect(deletePaymentSpy).toHaveBeenCalledWith("unpaid-1");
      expect(updatePaymentSpy).not.toHaveBeenCalled();
    });

    test("updates unpaid payment amount and due date if active bill is modified", async () => {
      const oldBill = mockBill({ active: true, amount_cents: 1500 });
      // Recurrence change should trigger due date recalculation
      const updatedBill = mockBill({
        active: true,
        amount_cents: 1800,
        recurrence: {
          type: "monthly",
          monthly: { day: 25 }, // changed from 15 to 25
        },
      });

      const unpaidPayment: Payment = {
        id: "unpaid-1",
        bill_id: oldBill.id,
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      // No paid payments yet, so next due date will fall back to start_date of updated bill ("2026-01-01") or recurrence-based.
      // Wait, in services.ts:
      // "let newDueDate: string;
      //  if (paidPayments.length === 0) {
      //    newDueDate = updatedBill.start_date;
      //  }"
      // So newDueDate = "2026-01-01"

      listPaymentsSpy.mockResolvedValue([unpaidPayment]);

      await handleBillUpdateSideEffects(oldBill.id, oldBill, updatedBill);

      expect(updatePaymentSpy).toHaveBeenCalledWith("unpaid-1", {
        amount_cents: 1800,
        due_date: "2026-01-01",
      });
    });

    test("generates new payment cycle if bill is reactivated", async () => {
      const oldBill = mockBill({ active: false });
      const updatedBill = mockBill({ active: true });

      getBillSpy.mockResolvedValue(updatedBill);
      listPaymentsSpy.mockResolvedValue([]); // No payments exist
      createPaymentSpy.mockResolvedValue({} as any);

      await handleBillUpdateSideEffects(oldBill.id, oldBill, updatedBill);

      expect(createPaymentSpy).toHaveBeenCalled();
    });
  });
});
