import { expect, test, describe, spyOn, beforeEach, afterAll } from "bun:test";
import { db } from "../trailbase";
import { processPaymentReminders } from "./reminders";
import { logger } from "./logger";
import type { Account, Bill, Payment } from "@hornbill/core";

describe("Payment Reminders Service", () => {
  const listAccountsSpy = spyOn(db, "listAccounts");
  const listBillsSpy = spyOn(db, "listBills");
  const listPaymentsSpy = spyOn(db, "listPayments");
  const updateAccountSpy = spyOn(db, "updateAccount");
  const fetchSpy = spyOn(globalThis, "fetch");
  const loggerInfoSpy = spyOn(logger, "info");

  beforeEach(() => {
    listAccountsSpy.mockReset().mockImplementation(() => Promise.resolve([]));
    listBillsSpy.mockReset().mockImplementation(() => Promise.resolve([]));
    listPaymentsSpy.mockReset().mockImplementation(() => Promise.resolve([]));
    updateAccountSpy.mockReset().mockImplementation((id, acc) => Promise.resolve({ id, ...acc } as any));
    fetchSpy.mockReset().mockImplementation((() => Promise.resolve(new Response(JSON.stringify({ ok: true })))) as any);
    loggerInfoSpy.mockReset();
  });

  afterAll(() => {
    listAccountsSpy.mockRestore();
    listBillsSpy.mockRestore();
    listPaymentsSpy.mockRestore();
    updateAccountSpy.mockRestore();
    fetchSpy.mockRestore();
    loggerInfoSpy.mockRestore();
  });

  const mockAccount = (overrides: Partial<Account> = {}): Account => ({
    id: "acc-123",
    name: "Primary Account",
    upcoming_threshold_days: 7,
    currencies: ["USD"],
    default_currency: "USD",
    archived: false,
    notification_provider: {
      type: "discord",
      config: { webhookUrl: "https://discord.com/api/webhooks/mock" },
    },
    notification_reminder: {
      enabled: true,
      days_before_due: 3,
      time: "09:00",
      timezone: "UTC",
      last_reminded_date: null,
    },
    created_at: 1717200000,
    updated_at: 1717200000,
    ...overrides,
  });

  const mockBill = (overrides: Partial<Bill> = {}): Bill => ({
    id: "bill-1",
    account_id: "acc-123",
    name: "Spotify Premium",
    currency: "USD",
    amount_cents: 1099,
    amount_type: "fixed",
    recurrence: { type: "monthly", monthly: { day: 15 } },
    start_date: "2026-01-01",
    active: true,
    created_at: 1717200000,
    updated_at: 1717200000,
    ...overrides,
  });

  const mockPayment = (overrides: Partial<Payment> = {}): Payment => ({
    id: "pay-1",
    bill_id: "bill-1",
    due_date: "2026-06-10",
    amount_cents: 1099,
    paid_at: null,
    created_at: 1717200000,
    updated_at: 1717200000,
    ...overrides,
  });

  test("skips accounts with disabled reminders", async () => {
    const acc = mockAccount({
      notification_reminder: {
        enabled: false,
        days_before_due: 3,
        time: "09:00",
        timezone: "UTC",
        last_reminded_date: null,
      },
    });

    listAccountsSpy.mockResolvedValue([acc]);
    await processPaymentReminders();

    expect(listBillsSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("skips reminders if already sent today", async () => {
    // Determine "today" in UTC
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const acc = mockAccount({
      notification_reminder: {
        enabled: true,
        days_before_due: 3,
        time: "00:00", // setting time to 00:00 so time check always passes
        timezone: "UTC",
        last_reminded_date: todayStr,
      },
    });

    listAccountsSpy.mockResolvedValue([acc]);
    await processPaymentReminders();

    expect(listBillsSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("skips reminder if scheduled time is in the future", async () => {
    // Set reminder time to 23:59 so it is guaranteed to be in the future relative to test execution local timezone if checked
    const acc = mockAccount({
      notification_reminder: {
        enabled: true,
        days_before_due: 3,
        time: "23:59",
        timezone: "UTC",
        last_reminded_date: null,
      },
    });

    // Mock date to force a specific UTC hour/minute
    const originalDate = globalThis.Date;
    const mockDate = class extends originalDate {
      constructor() {
        super("2026-06-03T08:00:00Z");
      }
    };
    globalThis.Date = mockDate as any;

    try {
      listAccountsSpy.mockResolvedValue([acc]);
      await processPaymentReminders();

      expect(listBillsSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("aggregates and sends alerts for eligible unpaid payments", async () => {
    const acc = mockAccount({
      notification_reminder: {
        enabled: true,
        days_before_due: 3,
        time: "08:00",
        timezone: "UTC",
        last_reminded_date: null,
      },
    });

    // Spotify is due 2026-06-05, check is made on 2026-06-03 (2 days before, within 3 days threshold)
    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-05" });

    // Mock Date to be 2026-06-03 09:00:00 UTC (past 08:00:00 schedule)
    const originalDate = globalThis.Date;
    const mockDate = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    };
    globalThis.Date = mockDate as any;

    try {
      listAccountsSpy.mockResolvedValue([acc]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);

      await processPaymentReminders();

      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://discord.com/api/webhooks/mock");
      
      const body = options?.body;
      if (typeof body !== "string") {
        throw new Error("Expected request body to be a string");
      }
      const payload = JSON.parse(body);
      expect(payload.embeds[0].title).toBe("Spotify Premium");

      // Verify that updateAccount was called with today's date
      expect(updateAccountSpy).toHaveBeenCalledWith("acc-123", {
        notification_reminder: {
          enabled: true,
          days_before_due: 3,
          time: "08:00",
          timezone: "UTC",
          last_reminded_date: "2026-06-03",
        },
      });
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("aggregates and sends alerts via Gotify", async () => {
    const acc = mockAccount({
      notification_provider: {
        type: "gotify",
        config: {
          gotifyUrl: "https://gotify.example.com",
          gotifyToken: "my-token",
        },
      },
    });

    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-05" });

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([acc]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);

      await processPaymentReminders();

      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://gotify.example.com/message");
      expect(options?.headers).toEqual({
        "Content-Type": "application/json",
        "X-Gotify-Key": "my-token",
      });

      const payload = JSON.parse(options?.body as string);
      expect(payload.title).toBe("Hornbill Payment Reminders");
      expect(payload.message).toContain("Spotify Premium");
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("aggregates and sends alerts via ntfy", async () => {
    const acc = mockAccount({
      notification_provider: {
        type: "ntfy",
        config: {
          ntfyUrl: "https://ntfy.sh/topic",
          ntfyToken: "my-ntfy-token",
        },
      },
    });

    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-05" });

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([acc]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);

      await processPaymentReminders();

      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://ntfy.sh/topic");
      expect(options?.headers).toEqual({
        "Title": "Hornbill Payment Reminders",
        "Tags": "bell",
        "Authorization": "Bearer my-ntfy-token",
      });
      expect(options?.body).toContain("Spotify Premium");
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("logs alerts to console when using console provider", async () => {
    const acc = mockAccount({
      notification_provider: {
        type: "console",
        config: {},
      },
    });

    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-05" });

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([acc]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);

      await processPaymentReminders();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(loggerInfoSpy).toHaveBeenCalled();

      const logArgs = loggerInfoSpy.mock.calls[0];
      expect(logArgs[0]).toMatchObject({
        event: "payment.reminders.console",
        account: "Primary Account",
      });
      expect((logArgs[0] as any).payments[0].bill_name).toBe("Spotify Premium");
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("skips reminder if timezone is invalid", async () => {
    const acc = mockAccount({
      notification_reminder: {
        enabled: true,
        days_before_due: 3,
        time: "09:00",
        timezone: "Invalid/Timezone_Name",
        last_reminded_date: null,
      },
    });
    listAccountsSpy.mockResolvedValue([acc]);
    await processPaymentReminders();
    expect(listBillsSpy).not.toHaveBeenCalled();
  });

  test("skips reminders if listAccounts throws an error", async () => {
    listAccountsSpy.mockRejectedValue(new Error("Db failure"));
    await processPaymentReminders();
    expect(listBillsSpy).not.toHaveBeenCalled();
  });

  test("gracefully handles errors in account reminder loop", async () => {
    const acc = mockAccount();
    listAccountsSpy.mockResolvedValue([acc]);
    listBillsSpy.mockRejectedValue(new Error("Db connection lost"));
    await processPaymentReminders();
    // Should log and not throw
  });

  test("marks today as done and skips if no active bills", async () => {
    const acc = mockAccount({
      notification_reminder: {
        enabled: true,
        days_before_due: 3,
        time: "08:00",
        timezone: "UTC",
        last_reminded_date: null,
      },
    });
    const bill = mockBill({ active: false });
    listAccountsSpy.mockResolvedValue([acc]);
    listBillsSpy.mockResolvedValue([bill]);

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      await processPaymentReminders();
      expect(updateAccountSpy).toHaveBeenCalledWith("acc-123", {
        notification_reminder: {
          enabled: true,
          days_before_due: 3,
          time: "08:00",
          timezone: "UTC",
          last_reminded_date: "2026-06-03",
        },
      });
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("marks today as done and skips if no payments are due soon or overdue", async () => {
    const acc = mockAccount({
      notification_reminder: {
        enabled: true,
        days_before_due: 3,
        time: "08:00",
        timezone: "UTC",
        last_reminded_date: null,
      },
    });
    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-15" });

    listAccountsSpy.mockResolvedValue([acc]);
    listBillsSpy.mockResolvedValue([bill]);
    listPaymentsSpy.mockResolvedValue([pay]);

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor(...args: any[]) {
        if (args.length > 0) {
          super(args[0]);
        } else {
          super("2026-06-03T09:00:00Z");
        }
      }
    } as any;

    try {
      await processPaymentReminders();
      expect(updateAccountSpy).toHaveBeenCalledWith("acc-123", {
        notification_reminder: {
          enabled: true,
          days_before_due: 3,
          time: "08:00",
          timezone: "UTC",
          last_reminded_date: "2026-06-03",
        },
      });
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("sends Discord alert with overdue styling, and handles missing config & api errors", async () => {
    // 1. Missing Webhook URL configuration
    const accNoUrl = mockAccount({
      notification_provider: { type: "discord", config: {} },
    });
    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-02" }); // overdue

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([accNoUrl]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);
      await processPaymentReminders();
      expect(fetchSpy).not.toHaveBeenCalled();

      // 2. Overdue styling and API success
      const accOk = mockAccount({
        notification_provider: { type: "discord", config: { webhookUrl: "https://discord.com/mock" } },
      });
      listAccountsSpy.mockResolvedValue([accOk]);
      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));
      await processPaymentReminders();
      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://discord.com/mock");
      const payload = JSON.parse(options?.body as string);
      expect(payload.embeds[0].color).toBe(0xDC2626); // Error Red for overdue
      expect(payload.embeds[0].fields[1].value).toContain("Overdue");

      // 3. API Error response
      fetchSpy.mockReset().mockResolvedValue(new Response("Rate limit", { status: 429 }));
      await processPaymentReminders(); // Should log error and not crash
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("sends Slack alerts, handles missing config & API error", async () => {
    const accNoUrl = mockAccount({
      notification_provider: { type: "slack", config: {} },
    });
    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-02" }); // overdue

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([accNoUrl]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);
      await processPaymentReminders();
      expect(fetchSpy).not.toHaveBeenCalled();

      const accOk = mockAccount({
        notification_provider: { type: "slack", config: { webhookUrl: "https://slack.com/mock" } },
      });
      listAccountsSpy.mockResolvedValue([accOk]);
      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));
      await processPaymentReminders();
      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://slack.com/mock");
      const payload = JSON.parse(options?.body as string);
      expect(payload.blocks[3].text.text).toContain("Overdue");

      fetchSpy.mockReset().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
      await processPaymentReminders(); // Should log error
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("sends Telegram alerts, handles missing config & API error", async () => {
    const accNoConfig = mockAccount({
      notification_provider: { type: "telegram", config: {} },
    });
    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-02" }); // overdue

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([accNoConfig]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);
      await processPaymentReminders();
      expect(fetchSpy).not.toHaveBeenCalled();

      const accOk = mockAccount({
        notification_provider: { type: "telegram", config: { botToken: "tok", chatId: "123" } },
      });
      listAccountsSpy.mockResolvedValue([accOk]);
      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));
      await processPaymentReminders();
      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.telegram.org/bottok/sendMessage");
      const payload = JSON.parse(options?.body as string);
      expect(payload.text).toContain("Overdue");

      fetchSpy.mockReset().mockResolvedValue(new Response("Bad Request", { status: 400 }));
      await processPaymentReminders(); // Should log error
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("sends Webhook alerts, handles missing config & API error", async () => {
    const accNoUrl = mockAccount({
      notification_provider: { type: "webhook", config: {} },
    });
    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-02" }); // overdue

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([accNoUrl]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);
      await processPaymentReminders();
      expect(fetchSpy).not.toHaveBeenCalled();

      const accOk = mockAccount({
        notification_provider: { type: "webhook", config: { webhookUrl: "https://webhook.mock" } },
      });
      listAccountsSpy.mockResolvedValue([accOk]);
      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));
      await processPaymentReminders();
      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://webhook.mock");
      const payload = JSON.parse(options?.body as string);
      expect(payload.payments[0].is_overdue).toBe(true);

      fetchSpy.mockReset().mockResolvedValue(new Response("Internal Error", { status: 500 }));
      await processPaymentReminders(); // Should log error
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("sends Gotify alerts, handles missing config & API error", async () => {
    const accNoConfig = mockAccount({
      notification_provider: { type: "gotify", config: {} },
    });
    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-02" }); // overdue

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([accNoConfig]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);
      await processPaymentReminders();
      expect(fetchSpy).not.toHaveBeenCalled();

      const accOk = mockAccount({
        notification_provider: { type: "gotify", config: { gotifyUrl: "https://gotify.mock", gotifyToken: "tok" } },
      });
      listAccountsSpy.mockResolvedValue([accOk]);
      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));
      await processPaymentReminders();
      expect(fetchSpy).toHaveBeenCalled();

      fetchSpy.mockReset().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
      await processPaymentReminders(); // Should log error
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("sends ntfy alerts, handles missing config & API error", async () => {
    const accNoConfig = mockAccount({
      notification_provider: { type: "ntfy", config: {} },
    });
    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-02" }); // overdue

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([accNoConfig]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);
      await processPaymentReminders();
      expect(fetchSpy).not.toHaveBeenCalled();

      // ntfy without token
      const accOkNoToken = mockAccount({
        notification_provider: { type: "ntfy", config: { ntfyUrl: "https://ntfy.sh/mock" } },
      });
      listAccountsSpy.mockResolvedValue([accOkNoToken]);
      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));
      await processPaymentReminders();
      expect(fetchSpy).toHaveBeenCalled();
      const [, options] = fetchSpy.mock.calls[0];
      expect(options?.headers).not.toHaveProperty("Authorization");

      fetchSpy.mockReset().mockResolvedValue(new Response("Internal Error", { status: 500 }));
      await processPaymentReminders(); // Should log error
    } finally {
      globalThis.Date = originalDate;
    }
  });

  test("throws error when using unsupported notification channel type", async () => {
    const acc = mockAccount({
      notification_provider: {
        type: "unsupported" as any,
        config: {},
      },
    });
    const bill = mockBill();
    const pay = mockPayment({ due_date: "2026-06-05" });

    const originalDate = globalThis.Date;
    globalThis.Date = class extends originalDate {
      constructor() {
        super("2026-06-03T09:00:00Z");
      }
    } as any;

    try {
      listAccountsSpy.mockResolvedValue([acc]);
      listBillsSpy.mockResolvedValue([bill]);
      listPaymentsSpy.mockResolvedValue([pay]);
      await processPaymentReminders(); // Should log error and not crash
    } finally {
      globalThis.Date = originalDate;
    }
  });
});
