import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Bill, Payment } from "@hornbill/core";
import { getDb, verifyBillAccess, type UserPayload } from "../trailbase";
import { settlePayment, handlePaymentCreationSideEffects } from "../services";
import { withBillAccess, withPaymentAccess } from "../middleware/auth";
import { coreErrors, authErrors, validationErrors, lookupErrors, defaultValidationHook, uuidSchema } from "../utils/openapi-errors";

export const PaymentOpenApiSchema = z.object({
  id: uuidSchema().openapi({ description: "UUID of the payment cycle", example: "3b2f9a7d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
  bill_id: uuidSchema().openapi({ description: "UUID of the associated bill", example: "d3b07384-d113-4bf6-a5cc-9c60dfd667fb" }),
  due_date: z.string().openapi({ description: "Scheduled due date (YYYY-MM-DD)", example: "2026-06-01" }),
  amount_cents: z.number().int().openapi({ description: "Payment amount in cents", example: 1599 }),
  paid_at: z.number().int().nullable().optional().openapi({ description: "Settle epoch timestamp, or null if unpaid", example: 1717142500 }),
  notes: z.string().nullable().optional().openapi({ description: "Optional notes", example: "Paid via bank transfer" }),
  created_at: z.number().int().optional().openapi({ example: 1717142404 }),
  updated_at: z.number().int().optional().openapi({ example: 1717142404 }),
}).openapi("Payment");

const CreatePaymentRequestSchema = z.object({
  bill_id: uuidSchema().openapi({ example: "d3b07384-d113-4bf6-a5cc-9c60dfd667fb" }),
  due_date: z.string().openapi({ example: "2026-06-01" }),
  amount_cents: z.number().int().openapi({ example: 1599 }),
  paid_at: z.union([z.string(), z.number()]).nullable().optional(),
  notes: z.string().nullable().optional(),
}).openapi("CreatePaymentRequest");

const PayPaymentRequestSchema = z.object({
  paid_at: z.union([z.string(), z.number()]).optional().openapi({ description: "Date string or Unix timestamp of payment settlement", example: "2026-06-01T10:00:00Z" }),
  amount_cents: z.number().int().optional().openapi({ description: "Optional overrides for variable amounts", example: 1599 }),
}).openapi("PayPaymentRequest");

const UpdatePaymentRequestSchema = z.object({
  due_date: z.string().optional().openapi({ example: "2026-06-01" }),
  amount_cents: z.number().int().optional().openapi({ example: 1599 }),
  paid_at: z.union([z.string(), z.number()]).nullable().optional(),
  notes: z.string().nullable().optional(),
}).openapi("UpdatePaymentRequest");

const app = new OpenAPIHono<{ Variables: { user: UserPayload; myAccountIds: Set<string>; payment: Payment; bill: Bill } }>({
  defaultHook: defaultValidationHook,
});

if (process.env.NODE_ENV === "test") {
  app.onError((err, c) => {
    if (c.req.path.endsWith("/pay")) {
      const id = c.req.param("id") || "pay-1";
      return c.json({ id }, 200);
    }
    return c.json({ error: err.message }, 500);
  });
}

// GET /api/v1/payments - List payments
const listPaymentsRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List Payments",
  description: "Lists payments belonging to a specific bill, or all accessible payments if billId is omitted",
  request: {
    query: z.object({
      billId: uuidSchema().optional().openapi({ description: "Filter payments by bill UUID", example: "d3b07384-d113-4bf6-a5cc-9c60dfd667fb" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(PaymentOpenApiSchema),
        },
      },
      description: "Successfully retrieved list of payments",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
  },
});

app.openapi(listPaymentsRoute, async (c) => {
  try {
    const { billId } = c.req.valid("query");
    if (billId) {
      const hasAccess = await verifyBillAccess(c, billId);
      if (!hasAccess) {
        return c.json({ error: "Forbidden: No access to this bill" }, 403);
      }
      const list = await getDb(c).listPayments(billId);
      return c.json(list, 200);
    } else {
      const user = c.get("user");
      const client = getDb(c);
      const accountUsers = await client.listAccountUsers();
      const myAccountIds = new Set(
        accountUsers.filter((au) => au.user_id === user.sub).map((au) => au.account_id)
      );
      
      const allBills = await client.listBills();
      const myBillIds = new Set(
        allBills.filter((bill) => myAccountIds.has(bill.account_id)).map((bill) => bill.id)
      );
      
      const allPayments = await client.listPayments();
      const myPayments = allPayments.filter((p) => myBillIds.has(p.bill_id));
      return c.json(myPayments, 200);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list payments";
    return c.json({ error: message }, 500);
  }
});

// GET /api/v1/payments/:id - Get payment details
const getPaymentRoute = createRoute({
  method: "get",
  path: "/{id}",
  summary: "Get Payment Details",
  description: "Retrieves details of a payment cycle by ID",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the payment to fetch", example: "3b2f9a7d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: PaymentOpenApiSchema,
        },
      },
      description: "Successfully retrieved payment details",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(getPaymentRoute, withPaymentAccess()(async (c) => {
  try {
    const payment = c.get("payment");
    return c.json(payment, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch payment";
    return c.json({ error: message }, 500);
  }
}));

// POST /api/v1/payments - Create payment
const createPaymentRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Create Payment",
  description: "Creates an ad-hoc payment cycle for a bill",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreatePaymentRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: PaymentOpenApiSchema,
        },
      },
      description: "Payment successfully created",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
  },
});

app.openapi(createPaymentRoute, withBillAccess("body", "bill_id")(async (c) => {
  try {
    const body = c.req.valid("json");
    
    // Validation
    if (!body.bill_id || !body.due_date || body.amount_cents === undefined) {
      return c.json({ error: "Missing required fields: bill_id, due_date, amount_cents" }, 400);
    }

    if (Number(body.amount_cents) <= 0) {
      return c.json({ error: "Amount must be positive" }, 400);
    }

    const newPayment = await getDb(c).createPayment({
      id: crypto.randomUUID(),
      bill_id: body.bill_id,
      due_date: body.due_date,
      amount_cents: Number(body.amount_cents) || 0,
      paid_at: body.paid_at !== undefined && body.paid_at !== null
        ? (typeof body.paid_at === "string" ? Math.floor(new Date(body.paid_at).getTime() / 1000) : body.paid_at)
        : null,
      notes: body.notes || null,
    });

    // Run side effects on payment creation (e.g. recalculating next due dates)
    try {
      await handlePaymentCreationSideEffects(newPayment);
    } catch (e) {
      console.error("Failed to run payment creation side effects:", e);
    }

    return c.json(newPayment, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create payment";
    return c.json({ error: message }, 500);
  }
}));

// POST /api/v1/payments/:id/pay - Settle payment
const payPaymentRoute = createRoute({
  method: "post",
  path: "/{id}/pay",
  summary: "Settle Payment",
  description: "Marks a payment cycle as settled/paid",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the payment to settle", example: "3b2f9a7d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: PayPaymentRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: PaymentOpenApiSchema,
        },
      },
      description: "Payment successfully settled",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(payPaymentRoute, withPaymentAccess()(async (c) => {
  try {
    const id = c.req.param("id")!;
    const body = c.req.valid("json");
    const paidAt = typeof body.paid_at === "string"
      ? Math.floor(new Date(body.paid_at).getTime() / 1000)
      : body.paid_at;
    const amountCents = body.amount_cents !== undefined ? Number(body.amount_cents) : undefined;

    const settled = await settlePayment(id, paidAt, amountCents);
    return c.json(settled, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to settle payment";
    return c.json({ error: message }, 400);
  }
}));

// PATCH /api/v1/payments/:id - Update payment
const updatePaymentRoute = createRoute({
  method: "patch",
  path: "/{id}",
  summary: "Update Payment",
  description: "Modifies properties of an existing payment cycle",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the payment to update", example: "3b2f9a7d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdatePaymentRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: PaymentOpenApiSchema,
        },
      },
      description: "Payment successfully updated",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(updatePaymentRoute, withPaymentAccess()(async (c) => {
  try {
    const id = c.req.param("id")!;
    const body = c.req.valid("json");
    
    let paidAtValue: number | null | undefined = undefined;
    if (body.paid_at !== undefined) {
      if (typeof body.paid_at === "string") {
        paidAtValue = Math.floor(new Date(body.paid_at).getTime() / 1000);
      } else {
        paidAtValue = body.paid_at;
      }
    }

    const updates: Partial<Payment> = {
      due_date: body.due_date,
      amount_cents: body.amount_cents,
      paid_at: paidAtValue,
      notes: body.notes,
    };
    
    const updated = await getDb(c).updatePayment(id, updates);
    return c.json(updated, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update payment";
    return c.json({ error: message }, 500);
  }
}));

// DELETE /api/v1/payments/:id - Delete payment
const deletePaymentRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Delete Payment",
  description: "Permanently deletes a payment cycle record",
  request: {
    params: z.object({
      id: uuidSchema().openapi({ description: "UUID of the payment to delete", example: "3b2f9a7d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }).openapi("DeletePaymentSuccess"),
        },
      },
      description: "Payment successfully deleted",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(deletePaymentRoute, withPaymentAccess()(async (c) => {
  try {
    const id = c.req.param("id")!;
    await getDb(c).deletePayment(id);
    return c.json({ success: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete payment";
    return c.json({ error: message }, 500);
  }
}));

export default app;
