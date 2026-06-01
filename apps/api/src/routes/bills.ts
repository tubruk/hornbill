import { Hono } from "hono";
import type { Bill } from "@hornbill/core";
import { getDb, verifyAccountAccess, type UserPayload } from "../trailbase";
import { generateNextPaymentForBill, handleBillUpdateSideEffects } from "../services";
import { checkAccountAccess, checkBillAccess } from "../middleware/auth";

const app = new Hono<{ Variables: { user: UserPayload; myAccountIds: Set<string>; bill: Bill } }>();

app.get("/", async (c) => {
  try {
    const accountId = c.req.query("accountId");
    if (accountId) {
      const hasAccess = await verifyAccountAccess(c, accountId);
      if (!hasAccess) {
        return c.json({ error: "Forbidden: No access to this account" }, 403);
      }
      const list = await getDb(c).listBills(accountId);
      return c.json(list);
    } else {
      const user = c.get("user");
      const client = getDb(c);
      const accountUsers = await client.listAccountUsers();
      const myAccountIds = new Set(
        accountUsers.filter((au) => au.user_id === user.sub).map((au) => au.account_id)
      );
      const allBills = await client.listBills();
      const myBills = allBills.filter((bill) => myAccountIds.has(bill.account_id));
      return c.json(myBills);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list bills";
    return c.json({ error: message }, 500);
  }
});

app.get("/:id", checkBillAccess("param", "id"), async (c) => {
  try {
    const id = c.req.param("id");
    const bill = c.get("bill");
    const payments = await getDb(c).listPayments(id);
    return c.json({ ...bill, payments });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch bill";
    return c.json({ error: message }, 500);
  }
});

app.post("/", checkAccountAccess("body", "account_id"), async (c) => {
  try {
    const body = await c.req.json();
    
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
});

app.patch("/:id", checkBillAccess("param", "id"), async (c) => {
  try {
    const id = c.req.param("id")!;
    const body = await c.req.json();

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

    return c.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update bill";
    return c.json({ error: message }, 500);
  }
});

app.delete("/:id", checkBillAccess("param", "id"), async (c) => {
  try {
    const id = c.req.param("id")!;
    await getDb(c).deleteBill(id);
    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete bill";
    return c.json({ error: message }, 500);
  }
});

export default app;
