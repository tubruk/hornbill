import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import * as trailbase from "../trailbase";
import accountsApp from "./accounts";
import type { Account, Payment, AccountHoliday } from "@hornbill/core";

describe("Payday & Holiday Routes", () => {
  let getDbSpy: ReturnType<typeof spyOn>;
  let verifyTokenSpy: ReturnType<typeof spyOn>;
  let verifyAccountAccessSpy: ReturnType<typeof spyOn>;

  const mockAccount: Account = {
    id: "acc-123",
    name: "Primary Wallet",
    upcoming_threshold_days: 7,
    currencies: ["IDR", "USD"],
    default_currency: "USD",
    archived: false,
    notification_provider: { type: "webhook", config: {} },
    notification_reminder: { enabled: false, days_before_due: 3, time: "09:00", timezone: "UTC", last_reminded_date: null },
    calendar_token: "token-1",
    payday_config: {
      enabled: true,
      frequency: "monthly",
      day_of_month: 25,
      adjustment: "previous_working_day",
    },
    created_at: 1717142400,
    updated_at: 1717142400,
  };

  const mockHolidays: AccountHoliday[] = [
    {
      id: "hol-1",
      account_id: "acc-123",
      date: "2026-07-24",
      name: "Company Holiday",
      source: "manual",
      created_at: 1717142400,
      updated_at: 1717142400,
    },
  ];

  const mockPayments: Payment[] = [
    {
      id: "pay-1",
      bill_id: "bill-1",
      due_date: "2026-07-24",
      amount_cents: 1500,
      paid_at: null,
      created_at: 1717142400,
      updated_at: 1717142400,
    },
    {
      id: "pay-2",
      bill_id: "bill-2",
      due_date: "2026-06-10",
      amount_cents: 2500,
      paid_at: null,
      created_at: 1717142400,
      updated_at: 1717142400,
    },
  ];

  const mockClient = {
    getAccount: async (_id: string): Promise<Account> => mockAccount,
    listAccounts: async (): Promise<Account[]> => [mockAccount],
    listAccountUsers: async (): Promise<Array<{ id: string; account_id: string; user_id: string }>> => [
      { id: "au-1", account_id: "acc-123", user_id: "user-1" },
    ],
    listAccountHolidays: async (_accountId: string): Promise<AccountHoliday[]> => mockHolidays,
    listPayments: async (_accountId: string): Promise<Payment[]> => mockPayments,
    upsertAccountHoliday: async (holiday: { account_id: string; date: string; name: string; source: "ics_file" | "ics_url" | "manual" }): Promise<AccountHoliday> => ({
      id: "hol-2",
      account_id: holiday.account_id,
      date: holiday.date,
      name: holiday.name,
      source: holiday.source,
      created_at: 1717142400,
      updated_at: 1717142400,
    }),
    deleteAccountHoliday: async (_id: string): Promise<void> => {},
  };

  beforeEach(() => {
    getDbSpy = spyOn(trailbase, "getDb").mockReturnValue(mockClient as unknown as trailbase.TrailbaseClient);
    verifyTokenSpy = spyOn(trailbase, "verifyToken").mockResolvedValue({ sub: "user-1" });
    verifyAccountAccessSpy = spyOn(trailbase, "verifyAccountAccess").mockResolvedValue(true);
  });

  afterEach(() => {
    getDbSpy.mockRestore();
    verifyTokenSpy.mockRestore();
    verifyAccountAccessSpy.mockRestore();
  });

  test("GET /:id/pay-period - computes pay period bounds and filters payments", async () => {
    const res = await accountsApp.request("/acc-123/pay-period?date=2026-07-24", {
      headers: { Authorization: "Bearer token-user-1" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bounds).toBeDefined();
    // July 25 2026 is Sat, July 24 is holiday -> payday shifts to July 23
    expect(body.bounds.start_date).toBe("2026-07-23");
    expect(body.current_cycle_payments).toHaveLength(1);
    expect(body.overdue_payments).toHaveLength(1);
  });

  test("GET /:id/holidays - lists account holidays", async () => {
    const res = await accountsApp.request("/acc-123/holidays", {
      headers: { Authorization: "Bearer token-user-1" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Company Holiday");
  });

  test("POST /:id/holidays - adds holiday or parses ics content", async () => {
    const res = await accountsApp.request("/acc-123/holidays", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-user-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: "2026-08-17",
        name: "Independence Day",
        source: "manual",
      }),
    });

    expect(res.status).toBe(200);
  });

  test("DELETE /:id/holidays/:holidayId - deletes specified holiday", async () => {
    const res = await accountsApp.request("/acc-123/holidays/hol-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer token-user-1" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
