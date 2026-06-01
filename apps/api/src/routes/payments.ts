import { Hono } from "hono";
import { getDb } from "../trailbase";
import { settlePayment } from "../services";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const billId = c.req.query("billId");
    const list = await getDb(c).listPayments(billId);
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const payment = await getDb(c).getPayment(id);
    return c.json(payment);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    
    // Validation
    if (!body.bill_id || !body.due_date || body.amount_cents === undefined) {
      return c.json({ error: "Missing required fields: bill_id, due_date, amount_cents" }, 400);
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
    return c.json(newPayment, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/:id/pay", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const paidAt = typeof body.paid_at === "string"
      ? Math.floor(new Date(body.paid_at).getTime() / 1000)
      : body.paid_at;
    const amountCents = body.amount_cents !== undefined ? Number(body.amount_cents) : undefined;

    const settled = await settlePayment(id, paidAt, amountCents);
    return c.json(settled);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const updates = { ...body };
    if (typeof updates.paid_at === "string") {
      updates.paid_at = Math.floor(new Date(updates.paid_at).getTime() / 1000);
    }
    
    const updated = await getDb(c).updatePayment(id, updates);
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await getDb(c).deletePayment(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
