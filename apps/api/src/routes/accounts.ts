import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getDb, verifyToken, type UserPayload } from "../trailbase";
import { DEFAULT_UPCOMING_THRESHOLD_DAYS, AccountSchema, ExportPayloadSchema, type Account } from "@hornbill/core";
import { checkAccountAccess } from "../middleware/auth";

const app = new Hono<{ Variables: { user: UserPayload; myAccountIds: Set<string>; account: Account } }>();

async function getAuthUser(c: Context): Promise<UserPayload> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }
  return await verifyToken(authHeader);
}

app.get("/", async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    
    let myAccountIds = c.get("myAccountIds") as Set<string> | undefined;
    if (!myAccountIds) {
      const accountUsers = await client.listAccountUsers();
      myAccountIds = new Set(
        accountUsers.filter((au) => au.user_id === user.sub).map((au) => au.account_id)
      );
      c.set("myAccountIds", myAccountIds);
    }
    
    const allAccounts = await client.listAccounts();
    const myAccounts = allAccounts.filter((acc) => myAccountIds!.has(acc.id));
    return c.json(myAccounts);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list accounts";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
});

app.post("/", async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    const body = await c.req.json();
    
    const accountId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const accountData = {
      id: accountId,
      name: body.name ?? "",
      upcoming_threshold_days: body.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS,
      currencies: body.currencies ?? ["IDR", "USD"],
      default_currency: body.default_currency ?? "IDR",
      archived: false,
      notification_provider: body.notification_provider ?? { type: "webhook", config: {} },
      notification_reminder: body.notification_reminder ?? { enabled: false, days_before_due: 3, time: "09:00", timezone: "UTC", last_reminded_date: null },
      created_at: now,
      updated_at: now,
    };

    const parsed = AccountSchema.safeParse(accountData);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }

    const newAccount = await client.createAccount({
      id: accountData.id,
      name: accountData.name,
      upcoming_threshold_days: accountData.upcoming_threshold_days,
      currencies: accountData.currencies,
      default_currency: accountData.default_currency,
      archived: accountData.archived,
      notification_provider: accountData.notification_provider,
      notification_reminder: accountData.notification_reminder,
    });
    await client.associateUserToAccount(newAccount.id, user.sub);
    return c.json(newAccount, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create account";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
});

app.get("/:id", checkAccountAccess("param", "id"), async (c) => {
  try {
    const account = c.get("account");
    return c.json(account);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch account";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
});

app.patch("/:id", checkAccountAccess("param", "id"), async (c) => {
  try {
    const id = c.req.param("id")!;
    const body = await c.req.json();
    const current = c.get("account");
    
    // Merge update with current record for validation
    const merged = {
      ...current,
      ...body,
    };
    
    const parsed = AccountSchema.safeParse(merged);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }

    const client = getDb(c);
    const updated = await client.updateAccount(id, {
      name: body.name,
      upcoming_threshold_days: body.upcoming_threshold_days,
      currencies: body.currencies,
      default_currency: body.default_currency,
      archived: body.archived,
      notification_provider: body.notification_provider,
      notification_reminder: body.notification_reminder,
    });
    return c.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update account";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
});

app.delete("/:id", checkAccountAccess("param", "id"), async (c) => {
  try {
    const id = c.req.param("id")!;
    const client = getDb(c);
    await client.deleteAccount(id);
    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete account";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
});

app.get("/:id/export", checkAccountAccess("param", "id"), async (c) => {
  try {
    const id = c.req.param("id")!;
    const client = getDb(c);
    const account = c.get("account");

    const bills = await client.listBills(id);
    const billIds = new Set(bills.map((b) => b.id));

    const allPayments = await client.listPayments();
    const payments = allPayments.filter((p) => billIds.has(p.bill_id));

    const payload = {
      version: 1,
      exported_at: Math.floor(Date.now() / 1000),
      account,
      bills,
      payments,
    };

    c.header(
      "Content-Disposition",
      `attachment; filename="hornbill-backup-${account.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}-${payload.exported_at}.json"`
    );
    return c.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to export account";
    return c.json({ error: message }, 500);
  }
});

app.post("/import", async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    const body = await c.req.json();

    const parsed = ExportPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }

    const { account, bills, payments } = parsed.data;
    const regenerateIds = c.req.query("regenerate_ids") === "true";

    let targetAccountId = account.id;
    let targetBills = bills;
    let targetPayments = payments;

    if (!regenerateIds) {
      // Conflict Check: check if any of the IDs already exist
      const allAccounts = await client.listAccounts();
      const allBills = await client.listBills();
      const allPayments = await client.listPayments();

      const conflictingAccount = allAccounts.some((a) => a.id === account.id);
      const conflictingBills = bills.filter((b) => allBills.some((ab) => ab.id === b.id)).map((b) => b.id);
      const conflictingPayments = payments.filter((p) => allPayments.some((ap) => ap.id === p.id)).map((p) => p.id);

      if (conflictingAccount || conflictingBills.length > 0 || conflictingPayments.length > 0) {
        return c.json(
          {
            error: "Conflict detected: One or more IDs in the import payload already exist.",
            conflicts: {
              account: conflictingAccount ? [account.id] : [],
              bills: conflictingBills,
              payments: conflictingPayments,
            },
          },
          409
        );
      }
    } else {
      // Regenerate IDs and rewrite hierarchy
      targetAccountId = crypto.randomUUID();
      const billIdMap = new Map<string, string>();

      targetBills = bills.map((b) => {
        const newBillId = crypto.randomUUID();
        billIdMap.set(b.id, newBillId);
        return {
          ...b,
          id: newBillId,
          account_id: targetAccountId,
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        };
      });

      targetPayments = payments.map((p) => {
        const newPaymentId = crypto.randomUUID();
        const newBillId = billIdMap.get(p.bill_id);
        if (!newBillId) {
          throw new Error(`Orphaned payment: refers to unknown bill ${p.bill_id}`);
        }
        return {
          ...p,
          id: newPaymentId,
          bill_id: newBillId,
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
        };
      });
    }

    // Persist records
    let createdAccount: Account | null = null;
    try {
      createdAccount = await client.createAccount({
        id: targetAccountId,
        name: regenerateIds ? `${account.name} (Imported)` : account.name,
        upcoming_threshold_days: account.upcoming_threshold_days,
        currencies: account.currencies,
        default_currency: account.default_currency,
        archived: account.archived,
      });

      await client.associateUserToAccount(targetAccountId, user.sub);

      for (const bill of targetBills) {
        await client.createBill(bill);
      }

      for (const payment of targetPayments) {
        await client.createPayment(payment);
      }

      return c.json(createdAccount, 201);
    } catch (dbErr) {
      if (createdAccount) {
        try {
          await client.deleteAccount(targetAccountId);
        } catch (cleanupErr) {
          console.error("Cleanup failed after failed import:", cleanupErr);
        }
      }
      throw dbErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import account";
    return c.json({ error: message }, 500);
  }
});

export default app;
