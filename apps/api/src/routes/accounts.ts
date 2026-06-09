import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getDb, verifyToken, type UserPayload } from "../trailbase";
import { DEFAULT_UPCOMING_THRESHOLD_DAYS, AccountSchema, NotificationProviderSchema, type Account, type Bill, type Payment } from "@hornbill/core";
import { sendAggregatedNotification } from "../services/reminders";
import { withAccountAccess } from "../middleware/auth";
import { coreErrors, authErrors, validationErrors, lookupErrors, defaultValidationHook, uuidSchema } from "../utils/openapi-errors";

// Define Account schema for documentation
export const AccountOpenApiSchema = z.object({
  id: uuidSchema().openapi({ description: "UUID ID of the account", example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
  name: z.string().openapi({ description: "Account name", example: "Primary Wallet" }),
  upcoming_threshold_days: z.number().int().openapi({ description: "Threshold in days for upcoming bills alert", example: 7 }),
  currencies: z.array(z.string()).openapi({ description: "Supported currencies list", example: ["USD", "IDR"] }),
  default_currency: z.string().openapi({ description: "Primary currency of the account", example: "USD" }),
  archived: z.boolean().openapi({ description: "Archived status", example: false }),
  notification_provider: z.record(z.string(), z.unknown()).openapi({ description: "Notification provider configuration" }),
  notification_reminder: z.record(z.string(), z.unknown()).openapi({ description: "Reminder configuration" }),
  created_at: z.number().int().optional().openapi({ description: "Creation epoch timestamp", example: 1717142404 }),
  updated_at: z.number().int().optional().openapi({ description: "Last update epoch timestamp", example: 1717142404 }),
}).openapi("Account");

// Define Create/Update request schema
const CreateAccountRequestSchema = z.object({
  name: z.string().min(1, "Name is required").openapi({ example: "Primary Wallet" }),
  upcoming_threshold_days: z.number().int().min(1).optional().openapi({ example: 7 }),
  currencies: z.array(z.string()).min(1).optional().openapi({ example: ["USD", "IDR"] }),
  default_currency: z.string().optional().openapi({ example: "USD" }),
  archived: z.boolean().optional().openapi({ example: false }),
  notification_provider: z.record(z.string(), z.unknown()).optional(),
  notification_reminder: z.record(z.string(), z.unknown()).optional(),
}).openapi("CreateAccountRequest");

const UpdateAccountRequestSchema = CreateAccountRequestSchema.partial().openapi("UpdateAccountRequest");

const ExportPayloadOpenApiSchema = z.object({
  version: z.number().openapi({ example: 1 }),
  exported_at: z.number().openapi({ example: 1717142500 }),
  account: AccountOpenApiSchema,
  bills: z.array(z.record(z.string(), z.unknown())).openapi({ description: "List of bills belonging to the account" }),
  payments: z.array(z.record(z.string(), z.unknown())).openapi({ description: "List of payments belonging to the bills" }),
}).openapi("ExportPayload");

const app = new OpenAPIHono<{ Variables: { user: UserPayload; myAccountIds: Set<string>; account: Account } }>({
  defaultHook: defaultValidationHook,
});

async function getAuthUser(c: Context): Promise<UserPayload> {
  const user = c.get("user") as UserPayload | undefined;
  if (user) {
    return user;
  }
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }
  return await verifyToken(authHeader);
}

// GET /api/v1/accounts - List accounts
const listAccountsRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List Accounts",
  description: "Lists all financial accounts associated with the authenticated user",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(AccountOpenApiSchema),
        },
      },
      description: "Successfully retrieved list of accounts",
    },
    ...coreErrors,
    ...authErrors,
  },
});

app.openapi(listAccountsRoute, async (c) => {
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
    return c.json(myAccounts, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list accounts";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
});

// POST /api/v1/accounts - Create account
const createAccountRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Create Account",
  description: "Creates a new financial account and maps it to the authenticated user",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateAccountRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: AccountOpenApiSchema,
        },
      },
      description: "Account successfully created",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
  },
});

app.openapi(createAccountRoute, async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    const body = c.req.valid("json");
    
    const accountId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const accountData = {
      id: accountId,
      name: body.name ?? "",
      upcoming_threshold_days: body.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS,
      currencies: body.currencies ?? ["IDR", "USD"],
      default_currency: body.default_currency ?? "IDR",
      archived: body.archived ?? false,
      notification_provider: (body.notification_provider ?? { type: "webhook", config: {} }) as unknown as Account["notification_provider"],
      notification_reminder: (body.notification_reminder ?? { enabled: false, days_before_due: 3, time: "09:00", timezone: "UTC", last_reminded_date: null }) as unknown as Account["notification_reminder"],
      created_at: now,
      updated_at: now,
    };

    const parsed = AccountSchema.safeParse(accountData);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }

    const newAccount = await client.createAccount(accountData);
    await client.associateUserToAccount(newAccount.id, user.sub);
    return c.json(newAccount, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create account";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
});

// GET /api/v1/accounts/:id - Get account
const getAccountRoute = createRoute({
  method: "get",
  path: "/{id}",
  summary: "Get Account Details",
  description: "Retrieves detailed information of an account by ID",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the account to fetch", example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AccountOpenApiSchema,
        },
      },
      description: "Successfully retrieved account details",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(getAccountRoute, withAccountAccess()(async (c) => {
  try {
    const account = c.get("account");
    return c.json(account, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch account";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
}));

// PATCH /api/v1/accounts/:id - Update account
const updateAccountRoute = createRoute({
  method: "patch",
  path: "/{id}",
  summary: "Update Account",
  description: "Modifies fields of an existing account",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the account to update", example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateAccountRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AccountOpenApiSchema,
        },
      },
      description: "Account successfully updated",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(updateAccountRoute, withAccountAccess()(async (c) => {
  try {
    const id = c.req.param("id")!;
    const body = c.req.valid("json");
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
    const updated = await client.updateAccount(id, parsed.data);
    return c.json(updated, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update account";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
}));

// DELETE /api/v1/accounts/:id - Delete account
const deleteAccountRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Delete Account",
  description: "Permanently deletes an account by ID",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the account to delete", example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }).openapi("DeleteAccountSuccess"),
        },
      },
      description: "Account successfully deleted",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(deleteAccountRoute, withAccountAccess()(async (c) => {
  try {
    const id = c.req.param("id")!;
    const client = getDb(c);
    await client.deleteAccount(id);
    return c.json({ success: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete account";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
}));

// GET /api/v1/accounts/:id/export - Export backup
const exportAccountRoute = createRoute({
  method: "get",
  path: "/{id}/export",
  summary: "Export Account Backup",
  description: "Downloads a full JSON backup of the account, including its bills and payments",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the account to export", example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ExportPayloadOpenApiSchema,
        },
      },
      description: "Successfully exported backup payload",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(exportAccountRoute, withAccountAccess()(async (c) => {
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
    return c.json(payload, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to export account";
    return c.json({ error: message }, 500);
  }
}));

// POST /api/v1/accounts/import - Import backup
const importAccountRoute = createRoute({
  method: "post",
  path: "/import",
  summary: "Import Account Backup",
  description: "Uploads a full JSON backup to recreate the account, its bills, and payments",
  request: {
    query: z.object({
      regenerate_ids: z.enum(["true", "false"]).optional().openapi({ description: "Set to true to regenerate all UUIDs to resolve conflicts", example: "true" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: ExportPayloadOpenApiSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: AccountOpenApiSchema,
        },
      },
      description: "Account backup successfully imported",
    },
    409: {
      description: "Conflict detected: One or more IDs already exist",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
  },
});

app.openapi(importAccountRoute, async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    const body = c.req.valid("json");
    const { regenerate_ids } = c.req.valid("query");

    const { account, bills, payments } = body as unknown as { account: Account; bills: Omit<Bill, "created_at">[]; payments: Omit<Payment, "created_at" | "updated_at">[] };
    const regenerateIds = regenerate_ids === "true";

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

// POST /api/v1/accounts/test-notification - Test notification settings
const TestNotificationRequestSchema = z.object({
  notification_provider: z.record(z.string(), z.unknown()).openapi({ description: "Full notification provider configuration to test" }),
}).openapi("TestNotificationRequest");

const testNotificationRoute = createRoute({
  method: "post",
  path: "/test-notification",
  summary: "Test Notification",
  description: "Sends a test reminder notification using the provided temporary config to verify integration settings",
  request: {
    body: {
      content: {
        "application/json": {
          schema: TestNotificationRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean(), message: z.string() }).openapi("TestNotificationSuccess"),
        },
      },
      description: "Test notification sent successfully",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
  },
});

app.openapi(testNotificationRoute, async (c) => {
  try {
    await getAuthUser(c);
    const body = c.req.valid("json");
    const provider = body.notification_provider;

    // Validate the provider schema
    const parsed = NotificationProviderSchema.safeParse(provider);
    if (!parsed.success) {
      return c.json({ error: `Invalid provider configuration: ${parsed.error.issues[0].message}` }, 400);
    }

    const testPayments = [
      {
        id: "test-payment-uuid",
        due_date: new Date().toISOString().split("T")[0],
        amount_cents: 1000,
        bill_name: "Test Bill Connection",
        currency: "USD",
      },
    ];

    // Trigger test notification
    await sendAggregatedNotification(parsed.data, "Test Account", new Date().toISOString().split("T")[0], testPayments);

    return c.json({ success: true, message: "Test notification dispatched successfully." }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send test notification";
    const status: ContentfulStatusCode = message.includes("Unauthorized") || message.includes("Authorization") ? 401 : 500;
    return c.json({ error: message }, status);
  }
});

export default app;
