import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import calendarApp, { generateIcsFeed } from "./calendar";
import * as trailbase from "../trailbase";
import type { Account, Bill, Payment } from "@hornbill/core";

describe("Calendar Routes & Feed Generator", () => {
  let getAccountByCalendarTokenSpy: any;
  let listBillsSpy: any;
  let listPaymentsSpy: any;
  let getDbSpy: any;

  const mockAccount: Account = {
    id: "acc-1",
    name: "Primary Wallet",
    upcoming_threshold_days: 7,
    currencies: ["USD", "IDR"],
    default_currency: "USD",
    archived: false,
    notification_provider: { type: "webhook", config: {} },
    notification_reminder: { enabled: false, days_before_due: 3, time: "09:00", timezone: "UTC", last_reminded_date: null },
    calendar_token: "valid-token-123",
    created_at: 1000,
    updated_at: 1000,
  };

  const mockBills: Bill[] = [
    {
      id: "bill-1",
      account_id: "acc-1",
      name: "Electricity",
      currency: "USD",
      amount_cents: 5000, // $50.00
      recurrence: { type: "monthly", monthly: { day: 15 } },
      start_date: "2026-06-01",
      active: true,
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: "bill-2",
      account_id: "acc-1",
      name: "Internet",
      currency: "IDR",
      amount_cents: 150000, // 150,000 IDR
      recurrence: { type: "monthly", monthly: { day: 20 } },
      start_date: "2026-06-01",
      active: true,
      created_at: 1000,
      updated_at: 1000,
    },
  ];

  const mockPayments: Payment[] = [
    {
      id: "pay-1",
      bill_id: "bill-1",
      due_date: "2026-06-15",
      amount_cents: 5000,
      paid_at: null, // unpaid
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: "pay-2",
      bill_id: "bill-2",
      due_date: "2026-06-20",
      amount_cents: 150000,
      paid_at: 1718870400, // paid
      created_at: 1000,
      updated_at: 1000,
    },
  ];

  beforeEach(() => {
    getDbSpy = spyOn(trailbase, "getDb").mockImplementation(() => trailbase.db as any);

    getAccountByCalendarTokenSpy = spyOn(trailbase.db, "getAccountByCalendarToken").mockImplementation(async (token) => {
      if (token === "valid-token-123") {
        return mockAccount;
      }
      return null;
    });

    listBillsSpy = spyOn(trailbase.db, "listBills").mockImplementation(async (accountId) => {
      if (accountId === "acc-1") {
        return mockBills;
      }
      return [];
    });

    listPaymentsSpy = spyOn(trailbase.db, "listPayments").mockImplementation(async () => {
      return mockPayments;
    });
  });

  afterEach(() => {
    getAccountByCalendarTokenSpy.mockRestore();
    listBillsSpy.mockRestore();
    listPaymentsSpy.mockRestore();
    getDbSpy.mockRestore();
  });

  describe("generateIcsFeed unit tests", () => {
    test("formats payments correctly into RFC 5545 format", () => {
      const enrichedPayments = [
        {
          id: "pay-1",
          bill_id: "bill-1",
          due_date: "2026-06-15",
          amount_cents: 5000,
          paid_at: null,
          created_at: 1000,
          updated_at: 1000,
          billName: "Electricity",
          currency: "USD",
        },
        {
          id: "pay-3",
          bill_id: "bill-2",
          due_date: "2026-06-20",
          amount_cents: 150000,
          paid_at: null,
          created_at: 1000,
          updated_at: 1000,
          billName: "Internet",
          currency: "IDR",
        },
      ];

      const ics = generateIcsFeed(enrichedPayments, "http://localhost:3000");

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("VERSION:2.0");
      expect(ics).toContain("PRODID:-//Hornbill//Calendar Feed//EN");

      // Check event 1 (USD)
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain("UID:payment-pay-1@hornbill.app");
      expect(ics).toContain("DTSTART;VALUE=DATE:20260615");
      expect(ics).toContain("SUMMARY:Electricity - $50.00");
      expect(ics).toContain("DESCRIPTION:Bill: Electricity\\nAmount: $50.00\\nDue Date: 2026-06-15\\nLink: http://localhost:3000/payments/pay-1");
      expect(ics).toContain("URL:http://localhost:3000/payments/pay-1");

      // Check event 2 (IDR)
      expect(ics).toContain("UID:payment-pay-3@hornbill.app");
      expect(ics).toContain("DTSTART;VALUE=DATE:20260620");
      expect(ics).toContain("SUMMARY:Internet - IDR 1\\,500.00"); // Note the non-breaking space and escaped comma
      expect(ics).toContain("END:VEVENT");
      expect(ics).toContain("END:VCALENDAR");
    });
  });

  describe("GET /feed API route", () => {
    test("rejects missing token parameter with 400", async () => {
      const res = await calendarApp.request("/feed");
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid input");
    });

    test("rejects invalid token parameter with 401", async () => {
      const res = await calendarApp.request("/feed?token=invalid");
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Invalid token");
    });

    test("returns 200 and standard calendar file for valid token", async () => {
      const res = await calendarApp.request("/feed?token=valid-token-123");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/calendar");
      expect(res.headers.get("Content-Disposition")).toContain("hornbill.ics");

      const body = await res.text();
      expect(body).toContain("BEGIN:VCALENDAR");
      expect(body).toContain("SUMMARY:Electricity - $50.00");
      // Confirm that the paid payment (pay-2) is NOT in the calendar feed
      expect(body).not.toContain("Internet");
    });
  });
});
