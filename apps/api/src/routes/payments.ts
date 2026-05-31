import { Hono } from "hono";
import { db } from "../trailbase";
import { settlePayment } from "../services";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const billId = c.req.query("billId");
    const list = await db.listPayments(billId);
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const payment = await db.getPayment(id);
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

    const newPayment = await db.createPayment({
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
    const settled = await settlePayment(id, paidAt);
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
    
    const updated = await db.updatePayment(id, updates);
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await db.deletePayment(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
