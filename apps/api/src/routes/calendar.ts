import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDb } from "../trailbase";
import { defaultValidationHook } from "../utils/openapi-errors";
import type { Payment } from "@hornbill/core";

const app = new OpenAPIHono({
  defaultHook: defaultValidationHook,
});

function formatDateTimeUtc(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function formatDateString(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

interface EnrichedPayment extends Payment {
  billName: string;
  currency: string;
}

export function generateIcsFeed(payments: EnrichedPayment[], origin: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hornbill//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const p of payments) {
    const formattedAmount = (p.amount_cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: p.currency,
    });

    const eventUid = `payment-${p.id}@hornbill.app`;
    const dtStamp = formatDateTimeUtc(p.updated_at || p.created_at || Math.floor(Date.now() / 1000));
    const dtStart = formatDateString(p.due_date);

    const summary = `${p.billName} - ${formattedAmount}`;

    let desc = `Bill: ${p.billName}\nAmount: ${formattedAmount}\nDue Date: ${p.due_date}`;
    if (p.notes) {
      desc += `\nNotes: ${p.notes}`;
    }
    const detailUrl = `${origin}/payments/${p.id}`;
    desc += `\nLink: ${detailUrl}`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${eventUid}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(desc)}`);
    lines.push(`URL:${detailUrl}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

const feedRoute = createRoute({
  method: "get",
  path: "/feed",
  summary: "Get Calendar Feed",
  description: "Returns an iCal/ICS format calendar feed of unpaid payments for the account associated with the token",
  request: {
    query: z.object({
      token: z.string().openapi({ description: "Calendar token for account authentication", example: "3b2f9a7d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
  },
  responses: {
    200: {
      description: "iCal calendar feed file",
      content: {
        "text/calendar": {
          schema: z.string(),
        },
      },
    },
    400: {
      description: "Invalid or missing token",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(feedRoute, async (c) => {
  const { token } = c.req.valid("query");
  if (!token) {
    return c.json({ error: "Missing token parameter" }, 400);
  }

  const client = getDb(c);
  const account = await client.getAccountByCalendarToken(token);
  if (!account) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const bills = await client.listBills(account.id);
  const billMap = new Map(bills.map(b => [b.id, b]));

  const allPayments = await client.listPayments();

  const unpaidPayments = allPayments
    .filter(p => billMap.has(p.bill_id) && (p.paid_at === null || p.paid_at === undefined))
    .map(p => {
      const bill = billMap.get(p.bill_id)!;
      return {
        ...p,
        billName: bill.name,
        currency: bill.currency,
      };
    });

  unpaidPayments.sort((a, b) => a.due_date.localeCompare(b.due_date));

  const origin = new URL(c.req.url).origin;
  const icsBody = generateIcsFeed(unpaidPayments, origin);

  c.header("Content-Type", "text/calendar");
  c.header("Content-Disposition", 'attachment; filename="hornbill.ics"');
  return c.body(icsBody, 200);
});

export default app;
