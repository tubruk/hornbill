import { expect, test, describe } from "bun:test";
import { calculateNextDueDate, getPaymentState } from "./domain";
import type { Bill, Payment } from "./types";

describe("calculateNextDueDate", () => {
  // Mock bill template helper
  const createMockBill = (recurrence: any, start = "2026-01-01"): Bill => ({
    id: "00000000-0000-0000-0000-000000000000",
    account_id: "00000000-0000-0000-0000-000000000000",
    name: "Mock Bill",
    currency: "USD",
    amount_cents: 1000,
    amount_type: "fixed",
    recurrence,
    start_date: start,
    active: true,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  });

  test("monthly recurrence - standard shift", () => {
    const bill = createMockBill({
      type: "monthly",
      monthly: { day: 15 },
    });
    // With no payments, base date is start_date (2026-01-01) shifted by 1 month to Feb 15
    const nextDate = calculateNextDueDate(bill);
    expect(nextDate).toBe("2026-02-15");

    // With a paid payment on Jan 15, should shift to Feb 15
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2026-01-15",
      amount_cents: 1000,
      paid_at: new Date("2026-01-15T12:00:00Z").getTime() / 1000,
      created_at: 0,
      updated_at: 0,
    };
    const nextDate2 = calculateNextDueDate(bill, latestPayment);
    expect(nextDate2).toBe("2026-02-15");
  });

  test("monthly recurrence - day clamping at end of month", () => {
    const bill = createMockBill({
      type: "monthly",
      monthly: { day: 31 },
    });
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2026-01-31",
      amount_cents: 1000,
      paid_at: new Date("2026-01-31T12:00:00Z").getTime() / 1000,
      created_at: 0,
      updated_at: 0,
    };
    // Feb in 2026 only has 28 days
    const nextDate = calculateNextDueDate(bill, latestPayment);
    expect(nextDate).toBe("2026-02-28");
  });

  test("yearly recurrence - shifts to next year and handles month/day", () => {
    const bill = createMockBill({
      type: "yearly",
      yearly: { month: 6, day: 10 },
    });
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2026-06-10",
      amount_cents: 1000,
      paid_at: new Date("2026-06-10T12:00:00Z").getTime() / 1000,
      created_at: 0,
      updated_at: 0,
    };
    const nextDate = calculateNextDueDate(bill, latestPayment);
    expect(nextDate).toBe("2027-06-10");
  });

  test("yearly recurrence - handles leap year clamping", () => {
    const bill = createMockBill({
      type: "yearly",
      yearly: { month: 2, day: 29 },
    });
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2024-02-29", // 2024 is a leap year
      amount_cents: 1000,
      paid_at: new Date("2024-02-29T12:00:00Z").getTime() / 1000,
      created_at: 0,
      updated_at: 0,
    };
    // 2025 is not a leap year, Feb has 28 days
    const nextDate = calculateNextDueDate(bill, latestPayment);
    expect(nextDate).toBe("2025-02-28");
  });

  test("interval recurrence - days unit", () => {
    const bill = createMockBill({
      type: "interval",
      interval: { every: 10, unit: "days", from: "due_date" },
    });
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2026-01-05",
      amount_cents: 1000,
      paid_at: new Date("2026-01-08T12:00:00Z").getTime() / 1000, // paid late but from due_date
      created_at: 0,
      updated_at: 0,
    };
    const nextDate = calculateNextDueDate(bill, latestPayment);
    expect(nextDate).toBe("2026-01-15");
  });

  test("interval recurrence - from paid_at", () => {
    const bill = createMockBill({
      type: "interval",
      interval: { every: 2, unit: "weeks", from: "paid_at" },
    });
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2026-01-05",
      amount_cents: 1000,
      paid_at: new Date("2026-01-10T12:00:00Z").getTime() / 1000, // paid on Jan 10
      created_at: 0,
      updated_at: 0,
    };
    const nextDate = calculateNextDueDate(bill, latestPayment);
    // Jan 10 + 14 days = Jan 24
    expect(nextDate).toBe("2026-01-24");
  });
});

describe("getPaymentState", () => {
  const basePayment = (): Payment => ({
    id: "p1",
    bill_id: "b1",
    due_date: "2026-05-15",
    amount_cents: 2500,
    paid_at: null,
    created_at: 0,
    updated_at: 0,
  });

  test("unpaid and not yet due", () => {
    const payment = basePayment();
    const state = getPaymentState(payment, "2026-05-10");
    expect(state.status).toBe("unpaid");
    expect(state.paidLate).toBe(false);
    expect(state.unpaidOverdueByDays).toBe(0);
  });

  test("overdue payment", () => {
    const payment = basePayment();
    const state = getPaymentState(payment, "2026-05-20");
    expect(state.status).toBe("overdue");
    expect(state.unpaidOverdueByDays).toBe(5); // 20 - 15 = 5 days
  });

  test("paid on time", () => {
    const payment = basePayment();
    payment.paid_at = new Date("2026-05-14T10:00:00Z").getTime() / 1000;
    const state = getPaymentState(payment, "2026-05-20");
    expect(state.status).toBe("paid");
    expect(state.paidLate).toBe(false);
    expect(state.paidLateByDays).toBe(0);
  });

  test("paid late", () => {
    const payment = basePayment();
    payment.paid_at = new Date("2026-05-18T14:30:00Z").getTime() / 1000;
    const state = getPaymentState(payment, "2026-05-20");
    expect(state.status).toBe("paid_late");
    expect(state.paidLate).toBe(true);
    expect(state.paidLateByDays).toBe(3); // 18 - 15 = 3 days
  });
});
