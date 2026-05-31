import { Hono } from "hono";
import { db } from "../trailbase";
import { generateNextPaymentForBill } from "../services";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const accountId = c.req.query("accountId");
    const list = await db.listBills(accountId);
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const bill = await db.getBill(id);
    const payments = await db.listPayments(id);
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

    const newBill = await db.createBill({
      id: crypto.randomUUID(),
      account_id: body.account_id,
      name: body.name,
      currency: body.currency,
      amount_cents: Number(body.amount_cents) || 0,
      amount_type: body.amount_type || "fixed",
      recurrence: body.recurrence,
      start_date: body.start_date,
      active: body.active !== false,
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
    const updated = await db.updateBill(id, body);
    
    // If reactivated, check if a payment should be generated
    if (body.active === true) {
      try {
        await generateNextPaymentForBill(id);
      } catch (e) {
        console.error("Failed to generate payment cycle upon bill reactivation:", e);
      }
    }

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await db.deleteBill(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
