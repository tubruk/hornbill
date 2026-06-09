import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import { db } from "./trailbase";
import {
  generateNextPaymentForBill,
  settlePayment,
  syncAllPayments,
  handleBillUpdateSideEffects,
  handlePaymentCreationSideEffects,
  handlePaymentUpdateOrDeleteSideEffects,
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
      const priorPayment: Payment = {
        id: "pay-prior",
        bill_id: bill.id,
        due_date: "2025-12-15",
        amount_cents: 1500,
        paid_at: Math.floor(new Date("2025-12-16T12:00:00Z").getTime() / 1000),
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      spyOn(db, "getPayment").mockResolvedValue(payment);
      getBillSpy.mockResolvedValue(bill);
      listPaymentsSpy.mockResolvedValue([priorPayment, payment]);

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

    test("throws error if paidAt is before the latest paid payment's paid_at", async () => {
      const bill = mockBill({ start_date: "2026-01-01" });
      const payment1: Payment = {
        id: "pay-1",
        bill_id: bill.id,
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: 1768488000, // Jan 15 2026
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      const payment2: Payment = {
        id: "pay-2",
        bill_id: bill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      spyOn(db, "getPayment").mockResolvedValue(payment2);
      getBillSpy.mockResolvedValue(bill);
      listPaymentsSpy.mockResolvedValue([payment1, payment2]);

      // Jan 10 2026 (before Jan 15 2026)
      const paidAtBeforeLatest = 1768056000;
      expect(settlePayment(payment2.id, paidAtBeforeLatest)).rejects.toThrow(
        "Payment date cannot be before the latest payment date"
      );
    });

    test("ignores failure when generating next payment cycle and completes settlement successfully", async () => {
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

      // Mock listPayments to succeed on first call (inside settlePayment)
      // and fail on subsequent calls (inside generateNextPaymentForBill)
      let callCount = 0;
      listPaymentsSpy.mockImplementation(async () => {
        callCount++;
        if (callCount > 1) {
          throw new Error("Simulated db error in generateNextPaymentForBill");
        }
        return [payment];
      });

      const paidAtTime = Math.floor(new Date("2026-01-16T12:00:00Z").getTime() / 1000);
      const updatedPayment: Payment = {
        ...payment,
        paid_at: paidAtTime,
      };
      updatePaymentSpy.mockResolvedValue(updatedPayment);

      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
      const result = await settlePayment(payment.id, paidAtTime);
      expect(result).toEqual(updatedPayment);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
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

    test("handles errors thrown by generateNextPaymentForBill and continues syncing other bills", async () => {
      const activeBill1 = mockBill({ id: "active-1", active: true });
      const activeBill2 = mockBill({ id: "active-2", active: true });
      listBillsSpy.mockResolvedValue([activeBill1, activeBill2]);

      // Mock listPayments to throw error for active-1 and return empty for active-2
      listPaymentsSpy.mockImplementation(async (billId: string) => {
        if (billId === "active-1") {
          throw new Error("Database error for active-1");
        }
        return [];
      });

      getBillSpy.mockImplementation(async (id: string) => {
        if (id === "active-1") return activeBill1;
        return activeBill2;
      });

      createPaymentSpy.mockResolvedValue({} as any);
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

      const stats = await syncAllPayments();
      expect(stats.processed).toBe(2);
      expect(stats.generated).toBe(1); // active-1 failed but active-2 succeeded
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
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

    test("updates unpaid payment due date based on latest paid payment when recurrence changes", async () => {
      const oldBill = mockBill({ active: true, amount_cents: 1500, recurrence: { type: "monthly", monthly: { day: 15 } } });
      const updatedBill = mockBill({
        active: true,
        amount_cents: 1500,
        recurrence: {
          type: "monthly",
          monthly: { day: 20 }, // changed from 15 to 20
        },
      });

      const unpaidPayment: Payment = {
        id: "unpaid-1",
        bill_id: oldBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      const paidPayment: Payment = {
        id: "paid-1",
        bill_id: oldBill.id,
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: Math.floor(new Date("2026-01-15T10:00:00Z").getTime() / 1000),
        created_at: 0,
        updated_at: 0,
      };

      listPaymentsSpy.mockResolvedValue([unpaidPayment, paidPayment]);

      await handleBillUpdateSideEffects(oldBill.id, oldBill, updatedBill);

      expect(updatePaymentSpy).toHaveBeenCalledWith("unpaid-1", {
        due_date: "2026-02-20",
      });
    });
  });

  describe("handlePaymentCreationSideEffects", () => {
    test("does nothing if payment is unpaid", async () => {
      const payment: Payment = {
        id: "pay-1",
        bill_id: "bill-1",
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };
      await handlePaymentCreationSideEffects(payment);
      expect(getBillSpy).not.toHaveBeenCalled();
    });

    test("does nothing if bill is inactive", async () => {
      const inactiveBill = mockBill({ active: false });
      const payment: Payment = {
        id: "pay-1",
        bill_id: inactiveBill.id,
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: 1717142500,
        created_at: 0,
        updated_at: 0,
      };
      getBillSpy.mockResolvedValue(inactiveBill);
      await handlePaymentCreationSideEffects(payment);
      expect(listPaymentsSpy).not.toHaveBeenCalled();
    });

    test("recalculates unpaid payment's due date if new paid payment is the latest", async () => {
      const activeBill = mockBill({ active: true, recurrence: { type: "monthly", monthly: { day: 15 } } });
      const newPaidPayment: Payment = {
        id: "pay-new",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: 1717142500,
        created_at: 0,
        updated_at: 0,
      };
      const oldPaidPayment: Payment = {
        id: "pay-old",
        bill_id: activeBill.id,
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: 1717142400,
        created_at: 0,
        updated_at: 0,
      };
      const unpaidPayment: Payment = {
        id: "pay-unpaid",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      getBillSpy.mockResolvedValue(activeBill);
      listPaymentsSpy.mockResolvedValue([newPaidPayment, oldPaidPayment, unpaidPayment]);

      await handlePaymentCreationSideEffects(newPaidPayment);

      expect(updatePaymentSpy).toHaveBeenCalledWith("pay-unpaid", {
        due_date: "2026-03-15",
      });
    });

    test("does not recalculate due date if new paid payment is not the latest", async () => {
      const activeBill = mockBill({ active: true });
      const newPaidPayment: Payment = {
        id: "pay-new",
        bill_id: activeBill.id,
        due_date: "2026-01-15",
        amount_cents: 1500,
        paid_at: 1717142400,
        created_at: 0,
        updated_at: 0,
      };
      const latestPaidPayment: Payment = {
        id: "pay-latest",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: 1717142500,
        created_at: 0,
        updated_at: 0,
      };
      const unpaidPayment: Payment = {
        id: "pay-unpaid",
        bill_id: activeBill.id,
        due_date: "2026-03-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      getBillSpy.mockResolvedValue(activeBill);
      listPaymentsSpy.mockResolvedValue([newPaidPayment, latestPaidPayment, unpaidPayment]);

      await handlePaymentCreationSideEffects(newPaidPayment);

      expect(updatePaymentSpy).not.toHaveBeenCalled();
    });

    test("generates new unpaid payment if none exists", async () => {
      const activeBill = mockBill({ active: true, recurrence: { type: "monthly", monthly: { day: 15 } } });
      const newPaidPayment: Payment = {
        id: "pay-new",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: 1717142500,
        created_at: 0,
        updated_at: 0,
      };

      getBillSpy.mockResolvedValue(activeBill);
      listPaymentsSpy.mockResolvedValue([newPaidPayment]);
      createPaymentSpy.mockResolvedValue({} as any);

      await handlePaymentCreationSideEffects(newPaidPayment);

      expect(createPaymentSpy).toHaveBeenCalled();
    });
  });

  describe("handlePaymentUpdateOrDeleteSideEffects", () => {
    test("recalculates unpaid payment due date based on latest paid payment", async () => {
      const activeBill = mockBill({ active: true, recurrence: { type: "monthly", monthly: { day: 15 } } });
      const paidPayment: Payment = {
        id: "pay-1",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: 1717142500,
        created_at: 0,
        updated_at: 0,
      };
      const unpaidPayment: Payment = {
        id: "pay-unpaid",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      getBillSpy.mockResolvedValue(activeBill);
      listPaymentsSpy.mockResolvedValue([paidPayment, unpaidPayment]);

      await handlePaymentUpdateOrDeleteSideEffects(activeBill.id);

      expect(updatePaymentSpy).toHaveBeenCalledWith("pay-unpaid", {
        due_date: "2026-03-15",
      });
    });

    test("sets unpaid payment due date to start_date if no paid payments left", async () => {
      const activeBill = mockBill({ active: true, start_date: "2026-01-01" });
      const unpaidPayment: Payment = {
        id: "pay-unpaid",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      getBillSpy.mockResolvedValue(activeBill);
      listPaymentsSpy.mockResolvedValue([unpaidPayment]);

      await handlePaymentUpdateOrDeleteSideEffects(activeBill.id);

      expect(updatePaymentSpy).toHaveBeenCalledWith("pay-unpaid", {
        due_date: "2026-01-01",
      });
    });

    test("generates new unpaid payment cycle if none exists", async () => {
      const activeBill = mockBill({ active: true });
      getBillSpy.mockResolvedValue(activeBill);
      listPaymentsSpy.mockResolvedValue([]);
      createPaymentSpy.mockResolvedValue({} as any);

      await handlePaymentUpdateOrDeleteSideEffects(activeBill.id);

      expect(createPaymentSpy).toHaveBeenCalled();
    });

    test("does nothing if bill is inactive", async () => {
      const inactiveBill = mockBill({ active: false });
      getBillSpy.mockResolvedValue(inactiveBill);

      await handlePaymentUpdateOrDeleteSideEffects(inactiveBill.id);

      expect(listPaymentsSpy).not.toHaveBeenCalled();
    });

    test("does not update unpaid payment if calculated due date is already correct", async () => {
      const activeBill = mockBill({ active: true, recurrence: { type: "monthly", monthly: { day: 15 } } });
      const paidPayment: Payment = {
        id: "pay-1",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: 1717142500,
        created_at: 0,
        updated_at: 0,
      };
      const unpaidPayment: Payment = {
        id: "pay-unpaid",
        bill_id: activeBill.id,
        due_date: "2026-03-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      getBillSpy.mockResolvedValue(activeBill);
      listPaymentsSpy.mockResolvedValue([paidPayment, unpaidPayment]);

      await handlePaymentUpdateOrDeleteSideEffects(activeBill.id);

      expect(updatePaymentSpy).not.toHaveBeenCalled();
    });

    test("does not update unpaid payment if due date is already start_date and no paid payments exist", async () => {
      const activeBill = mockBill({ active: true, start_date: "2026-01-01" });
      const unpaidPayment: Payment = {
        id: "pay-unpaid",
        bill_id: activeBill.id,
        due_date: "2026-01-01",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      getBillSpy.mockResolvedValue(activeBill);
      listPaymentsSpy.mockResolvedValue([unpaidPayment]);

      await handlePaymentUpdateOrDeleteSideEffects(activeBill.id);

      expect(updatePaymentSpy).not.toHaveBeenCalled();
    });

    test("does not update unpaid payment if ignoreRecalculationForPaymentId matches", async () => {
      const activeBill = mockBill({ active: true, recurrence: { type: "monthly", monthly: { day: 15 } } });
      const paidPayment: Payment = {
        id: "pay-1",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: 1717142500,
        created_at: 0,
        updated_at: 0,
      };
      const unpaidPayment: Payment = {
        id: "pay-unpaid",
        bill_id: activeBill.id,
        due_date: "2026-02-15",
        amount_cents: 1500,
        paid_at: null,
        created_at: 0,
        updated_at: 0,
      };

      getBillSpy.mockResolvedValue(activeBill);
      listPaymentsSpy.mockResolvedValue([paidPayment, unpaidPayment]);

      await handlePaymentUpdateOrDeleteSideEffects(activeBill.id, "pay-unpaid");

      expect(updatePaymentSpy).not.toHaveBeenCalled();
    });
  });
});
