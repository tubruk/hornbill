import { Hono } from "hono";
import { getDb } from "../trailbase";
import { generateNextPaymentForBill, handleBillUpdateSideEffects } from "../services";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const accountId = c.req.query("accountId");
    const list = await getDb(c).listBills(accountId);
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const bill = await getDb(c).getBill(id);
    const payments = await getDb(c).listPayments(id);
    return c.json({ ...bill, payments });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/", async (c) => {
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
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    // Fetch the existing bill for validation & old state comparison
    const oldBill = await getDb(c).getBill(id);

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
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await getDb(c).deleteBill(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
