import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getDb, verifyAccountAccess, type UserPayload } from "../trailbase";
import { syncAllPayments } from "../services";
import { coreErrors, authErrors, validationErrors, lookupErrors, defaultValidationHook } from "../utils/openapi-errors";

const SyncResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  billsProcessed: z.number().optional().openapi({ example: 5 }),
  paymentsCreated: z.number().optional().openapi({ example: 12 }),
}).openapi("SyncResponse");

// Set up OpenAPIHono instance with custom validation hook
const app = new OpenAPIHono<{ Variables: { user: UserPayload; myAccountIds: Set<string> } }>({
  defaultHook: defaultValidationHook,
});

// POST /api/v1/jobs/sync - Trigger sync across all accounts
const globalSyncRoute = createRoute({
  method: "post",
  path: "/sync",
  summary: "Global Payments Sync",
  description: "Triggers a payment synchronization job for all accounts and bills",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SyncResponseSchema,
        },
      },
      description: "Sync completed successfully",
    },
    ...coreErrors,
    ...authErrors,
  },
});

app.openapi(globalSyncRoute, async (c) => {
  try {
    const stats = await syncAllPayments();
    return c.json({ success: true, ...stats }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return c.json({ error: message }, 500);
  }
});

// POST /api/v1/jobs/sync/account/:accountId - Trigger sync for specific account
const accountSyncRoute = createRoute({
  method: "post",
  path: "/sync/account/{accountId}",
  summary: "Account Payments Sync",
  description: "Triggers payment synchronization for a specific account by ID",
  request: {
    params: z.object({
      accountId: z.string().openapi({ description: "UUID ID of the account to synchronize", example: "4b2c1d3f-5b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SyncResponseSchema,
        },
      },
      description: "Account sync completed successfully",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(accountSyncRoute, async (c) => {
  try {
    const { accountId } = c.req.valid("param");

    const hasAccess = await verifyAccountAccess(c, accountId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden: No access to this account" }, 403);
    }

    const db = getDb(c);
    const account = await db.getAccount(accountId);
    if (!account) {
      return c.json({ error: "Account not found" }, 404);
    }

    // Run sync only for this account.
    const stats = await syncAllPayments(accountId);
    return c.json({ success: true, ...stats }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return c.json({ error: message }, 500);
  }
});

export default app;
