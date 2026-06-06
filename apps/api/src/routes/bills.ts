import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Bill } from "@hornbill/core";
import { getDb, verifyAccountAccess, type UserPayload } from "../trailbase";
import { generateNextPaymentForBill, handleBillUpdateSideEffects } from "../services";
import { withAccountAccess, withBillAccess } from "../middleware/auth";
import { coreErrors, authErrors, validationErrors, lookupErrors, defaultValidationHook, uuidSchema } from "../utils/openapi-errors";

export const BillOpenApiSchema = z.object({
  id: z.string().uuid().openapi({ description: "UUID of the bill", example: "d3b07384-d113-4bf6-a5cc-9c60dfd667fb" }),
  account_id: z.string().uuid().openapi({ description: "Account owner UUID", example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
  name: z.string().openapi({ description: "Name/description of the bill", example: "Netflix Subscription" }),
  currency: z.string().openapi({ description: "Currency code", example: "USD" }),
  amount_cents: z.number().int().openapi({ description: "Billing amount in cents", example: 1599 }),
  amount_type: z.enum(["fixed", "variable"]).openapi({ description: "Whether amount is fixed or variable", example: "fixed" }),
  recurrence: z.any().openapi({ description: "Recurrence strategy details" }),
  start_date: z.string().openapi({ description: "Start date of billing schedule (YYYY-MM-DD)", example: "2026-06-01" }),
  active: z.boolean().openapi({ description: "Whether billing schedule is active", example: true }),
  upcoming_threshold_days: z.number().int().nullable().optional().openapi({ description: "Days before due to flag alert, or null to inherit", example: 3 }),
  notes: z.string().nullable().optional().openapi({ description: "Optional notes", example: "Shared flat subscription" }),
  created_at: z.number().int().optional().openapi({ example: 1717142404 }),
  updated_at: z.number().int().optional().openapi({ example: 1717142404 }),
}).openapi("Bill");

const BillWithPaymentsOpenApiSchema = BillOpenApiSchema.extend({
  payments: z.array(z.any()).openapi({ description: "History of payments associated with the bill" }),
}).openapi("BillWithPayments");

const CreateBillRequestSchema = z.object({
  account_id: uuidSchema().openapi({ example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
  name: z.string().min(1, "Name is required").optional().openapi({ example: "Netflix Subscription" }),
  currency: z.string().optional().openapi({ example: "USD" }),
  amount_cents: z.number().int().optional().openapi({ example: 1599 }),
  amount_type: z.enum(["fixed", "variable"]).optional().openapi({ example: "fixed" }),
  recurrence: z.any().optional().openapi({ description: "Recurrence configuration" }),
  start_date: z.string().optional().openapi({ example: "2026-06-01" }),
  active: z.boolean().optional().openapi({ example: true }),
  upcoming_threshold_days: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
}).openapi("CreateBillRequest");

const UpdateBillRequestSchema = CreateBillRequestSchema.partial().openapi("UpdateBillRequest");

const app = new OpenAPIHono<{ Variables: { user: UserPayload; myAccountIds: Set<string>; bill: Bill } }>({
  defaultHook: defaultValidationHook,
});

// GET /api/v1/bills - List bills
const listBillsRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List Bills",
  description: "Lists bills belonging to a specific account, or all accessible bills if accountId is omitted",
  request: {
    query: z.object({
      accountId: uuidSchema().optional().openapi({ description: "Filter bills by account UUID", example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(BillOpenApiSchema),
        },
      },
      description: "Successfully retrieved list of bills",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
  },
});

app.openapi(listBillsRoute, async (c) => {
  try {
    const { accountId } = c.req.valid("query");
    if (accountId) {
      const hasAccess = await verifyAccountAccess(c, accountId);
      if (!hasAccess) {
        return c.json({ error: "Forbidden: No access to this account" }, 403);
      }
      const list = await getDb(c).listBills(accountId);
      return c.json(list, 200);
    } else {
      const user = c.get("user");
      const client = getDb(c);
      const accountUsers = await client.listAccountUsers();
      const myAccountIds = new Set(
        accountUsers.filter((au) => au.user_id === user.sub).map((au) => au.account_id)
      );
      const allBills = await client.listBills();
      const myBills = allBills.filter((bill) => myAccountIds.has(bill.account_id));
      return c.json(myBills, 200);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list bills";
    return c.json({ error: message }, 500);
  }
});

// GET /api/v1/bills/:id - Get bill details
const getBillRoute = createRoute({
  method: "get",
  path: "/{id}",
  summary: "Get Bill Details",
  description: "Retrieves detailed information of a bill along with its payment cycles by ID",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the bill to fetch", example: "d3b07384-d113-4bf6-a5cc-9c60dfd667fb" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: BillWithPaymentsOpenApiSchema,
        },
      },
      description: "Successfully retrieved bill with payments",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(getBillRoute, withBillAccess()(async (c: any) => {
  try {
    const id = c.req.param("id");
    const bill = c.get("bill");
    const payments = await getDb(c).listPayments(id);
    return c.json({ ...bill, payments }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch bill";
    return c.json({ error: message }, 500);
  }
}));

// POST /api/v1/bills - Create bill
const createBillRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Create Bill",
  description: "Creates a new billing schedule and automatically schedules its initial payment cycle",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateBillRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: BillOpenApiSchema,
        },
      },
      description: "Bill successfully created and initialized",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
  },
});

app.openapi(createBillRoute, withAccountAccess("body", "account_id")(async (c: any) => {
  try {
    const body = c.req.valid("json");
    
    // Scaffolding validation
    if (!body.account_id || !body.name || !body.currency || !body.recurrence || !body.start_date) {
      return c.json({ error: "Missing required fields: account_id, name, currency, recurrence, start_date" }, 400);
    }

    const newBill = await getDb(c).createBill({
      id: crypto.randomUUID(),
      account_id: body.account_id,
      name: body.name,
      currency: body.currency,
      amount_cents: Number(body.amount_cents) || 0,
      amount_type: body.amount_type || "fixed",
      recurrence: body.recurrence,
      start_date: body.start_date,
      active: body.active !== false,
      upcoming_threshold_days: body.upcoming_threshold_days !== undefined ? (body.upcoming_threshold_days === null ? null : Number(body.upcoming_threshold_days)) : null,
      notes: body.notes || null,
    });

    // Automatically trigger generating the initial payment cycle
    try {
      await generateNextPaymentForBill(newBill.id);
    } catch (e) {
      console.error("Failed to generate initial payment cycle for new bill:", e);
    }

    return c.json(newBill, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create bill";
    return c.json({ error: message }, 500);
  }
}));

// PATCH /api/v1/bills/:id - Update bill
const updateBillRoute = createRoute({
  method: "patch",
  path: "/{id}",
  summary: "Update Bill",
  description: "Updates bill properties and handles payment side effects (like recalculating cycles)",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the bill to update", example: "d3b07384-d113-4bf6-a5cc-9c60dfd667fb" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateBillRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: BillOpenApiSchema,
        },
      },
      description: "Bill successfully updated",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(updateBillRoute, withBillAccess()(async (c: any) => {
  try {
    const id = c.req.param("id")!;
    const body = c.req.valid("json");

    // Retrieve the authorized existing bill from context
    const oldBill = c.get("bill");

    // Enforce immutability of currency & start_date
    if (body.currency !== undefined && body.currency !== oldBill.currency) {
      return c.json({ error: "currency is immutable" }, 400);
    }
    if (body.start_date !== undefined && body.start_date !== oldBill.start_date) {
      return c.json({ error: "start_date is immutable" }, 400);
    }

    const updated = await getDb(c).updateBill(id, body);
    
    // Process all payment side-effects cleanly on the API side
    try {
      await handleBillUpdateSideEffects(id, oldBill, updated);
    } catch (e) {
      console.error(`Failed handling side effects for bill update ${id}:`, e);
    }

    return c.json(updated, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update bill";
    return c.json({ error: message }, 500);
  }
}));

// DELETE /api/v1/bills/:id - Delete bill
const deleteBillRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Delete Bill",
  description: "Permanently deletes a bill and its associated payment cycles",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the bill to delete", example: "d3b07384-d113-4bf6-a5cc-9c60dfd667fb" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }).openapi("DeleteBillSuccess"),
        },
      },
      description: "Bill successfully deleted",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(deleteBillRoute, withBillAccess()(async (c: any) => {
  try {
    const id = c.req.param("id")!;
    await getDb(c).deleteBill(id);
    return c.json({ success: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete bill";
    return c.json({ error: message }, 500);
  }
}));

export default app;
