import { expect, test, describe } from "bun:test";
import { calculateNextDueDate, getPaymentState } from "./domain";
import type { Bill, Payment } from "./types";
import { AccountSchema, BillSchema, PaymentSchema } from "./types";

describe("calculateNextDueDate", () => {
  // Mock bill template helper
  const createMockBill = (recurrence: any, start = "2026-01-01"): Bill => ({
    id: "00000000-0000-0000-0000-000000000000",
    account_id: "00000000-0000-0000-0000-000000000000",
    name: "Mock Bill",
    currency: "USD",
    amount_cents: 1000,
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

  test("interval recurrence - months unit", () => {
    const bill = createMockBill({
      type: "interval",
      interval: { every: 3, unit: "months", from: "due_date" },
    });
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2026-01-15",
      amount_cents: 1000,
      paid_at: new Date("2026-01-15T12:00:00Z").getTime() / 1000,
      created_at: 0,
      updated_at: 0,
    };
    const nextDate = calculateNextDueDate(bill, latestPayment);
    // Jan 15 + 3 months = Apr 15
    expect(nextDate).toBe("2026-04-15");
  });

  test("interval recurrence - from paid_at fallback to due_date when paid_at is missing", () => {
    const bill = createMockBill({
      type: "interval",
      interval: { every: 2, unit: "weeks", from: "paid_at" },
    });
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2026-01-05",
      amount_cents: 1000,
      paid_at: null, // missing paid_at, should fall back to due_date
      created_at: 0,
      updated_at: 0,
    };
    const nextDate = calculateNextDueDate(bill, latestPayment);
    // Should fall back to due_date: Jan 05 + 14 days = Jan 19
    expect(nextDate).toBe("2026-01-19");
  });

  test("monthly recurrence - year rollover boundary", () => {
    const bill = createMockBill({
      type: "monthly",
      monthly: { day: 20 },
    });
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2026-12-20",
      amount_cents: 1000,
      paid_at: new Date("2026-12-20T12:00:00Z").getTime() / 1000,
      created_at: 0,
      updated_at: 0,
    };
    const nextDate = calculateNextDueDate(bill, latestPayment);
    expect(nextDate).toBe("2027-01-20");
  });

  test("monthly recurrence - day clamping for 30-day months", () => {
    const bill = createMockBill({
      type: "monthly",
      monthly: { day: 31 },
    });
    const latestPayment: Payment = {
      id: "p1",
      bill_id: bill.id,
      due_date: "2026-03-31", // March has 31 days
      amount_cents: 1000,
      paid_at: new Date("2026-03-31T12:00:00Z").getTime() / 1000,
      created_at: 0,
      updated_at: 0,
    };
    // April has 30 days, should clamp to 30
    const nextDate = calculateNextDueDate(bill, latestPayment);
    expect(nextDate).toBe("2026-04-30");
  });

  test("yearly recurrence and interval recurrence - undefined latest payment behavior", () => {
    // Yearly with no latest payment: shifts to next year's target month/day starting from bill.start_date
    const yearlyBill = createMockBill({
      type: "yearly",
      yearly: { month: 5, day: 10 },
    }, "2026-01-01");
    // baseDate is start_date "2026-01-01", shifts target to 2027-05-10
    const yearlyNextDate = calculateNextDueDate(yearlyBill);
    expect(yearlyNextDate).toBe("2027-05-10");

    // Interval with no latest payment: returns bill's start_date directly
    const intervalBill = createMockBill({
      type: "interval",
      interval: { every: 10, unit: "days", from: "due_date" },
    }, "2026-01-01");
    const intervalNextDate = calculateNextDueDate(intervalBill);
    expect(intervalNextDate).toBe("2026-01-01");
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

  test("unpaid and not yet due (due_soon)", () => {
    const payment = basePayment();
    const state = getPaymentState(payment, "2026-05-10");
    expect(state.status).toBe("due_soon");
    expect(state.paidLate).toBe(false);
    expect(state.unpaidOverdueByDays).toBe(0);
  });

  test("unpaid and not yet due (upcoming)", () => {
    const payment = basePayment();
    const state = getPaymentState(payment, "2026-05-05"); // 10 days before due date
    expect(state.status).toBe("upcoming");
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

  test("paid exactly on due date", () => {
    const payment = basePayment();
    // 2026-05-15T12:00:00Z
    payment.paid_at = new Date("2026-05-15T12:00:00Z").getTime() / 1000;
    const state = getPaymentState(payment, "2026-05-20");
    expect(state.status).toBe("paid");
    expect(state.paidLate).toBe(false);
    expect(state.paidLateByDays).toBe(0);
  });

  test("paid before due date", () => {
    const payment = basePayment();
    // 2026-05-10
    payment.paid_at = new Date("2026-05-10T12:00:00Z").getTime() / 1000;
    const state = getPaymentState(payment, "2026-05-20");
    expect(state.status).toBe("paid");
    expect(state.paidLate).toBe(false);
    expect(state.paidLateByDays).toBe(0);
  });

  test("custom threshold days for due_soon/upcoming status", () => {
    const payment = basePayment(); // due 2026-05-15
    // Today is 2026-05-05. Gap is 10 days.
    // Threshold is 5 days. Should be upcoming.
    const stateUpcoming = getPaymentState(payment, "2026-05-05", 5);
    expect(stateUpcoming.status).toBe("upcoming");

    // Threshold is 12 days. Should be due_soon.
    const stateDueSoon = getPaymentState(payment, "2026-05-05", 12);
    expect(stateDueSoon.status).toBe("due_soon");
  });
});

describe("Schemas Validation", () => {
  describe("AccountSchema", () => {
    test("valid account data passes", () => {
      const valid = {
        id: "acc-1",
        name: "Personal Account",
        upcoming_threshold_days: 7,
        currencies: ["USD", "IDR"],
        default_currency: "USD",
        archived: false,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      const result = AccountSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    test("default_currency missing from currencies list fails", () => {
      const invalid = {
        id: "acc-1",
        name: "Personal Account",
        upcoming_threshold_days: 7,
        currencies: ["IDR"],
        default_currency: "USD",
        archived: false,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      const result = AccountSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Default currency must be present");
      }
    });

    test("invalid currency code fails", () => {
      const invalid = {
        id: "acc-1",
        name: "Personal Account",
        upcoming_threshold_days: 7,
        currencies: ["usd"], // must be uppercase
        default_currency: "usd",
        archived: false,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      const result = AccountSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("BillSchema", () => {
    test("valid bill passes", () => {
      const valid = {
        id: "bill-1",
        account_id: "acc-1",
        name: "Internet Bill",
        currency: "USD",
        amount_cents: 5000,
        recurrence: {
          type: "monthly",
          monthly: { day: 15 },
        },
        start_date: "2026-01-01",
        active: true,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      const result = BillSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    test("invalid start_date format fails", () => {
      const invalid = {
        id: "bill-1",
        account_id: "acc-1",
        name: "Internet Bill",
        currency: "USD",
        amount_cents: 5000,
        recurrence: {
          type: "monthly",
          monthly: { day: 15 },
        },
        start_date: "01-01-2026", // Wrong format
        active: true,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      const result = BillSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    test("invalid monthly day fails", () => {
      const invalid = {
        id: "bill-1",
        account_id: "acc-1",
        name: "Internet Bill",
        currency: "USD",
        amount_cents: 5000,
        recurrence: {
          type: "monthly",
          monthly: { day: 32 }, // Out of range
        },
        start_date: "2026-01-01",
        active: true,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      const result = BillSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("PaymentSchema", () => {
    test("valid payment passes", () => {
      const valid = {
        id: "pay-1",
        bill_id: "bill-1",
        due_date: "2026-05-15",
        amount_cents: 2500,
        paid_at: null,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      const result = PaymentSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    test("negative amount_cents fails", () => {
      const invalid = {
        id: "pay-1",
        bill_id: "bill-1",
        due_date: "2026-05-15",
        amount_cents: -50,
        paid_at: null,
        created_at: 1717200000,
        updated_at: 1717200000,
      };
      const result = PaymentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});

