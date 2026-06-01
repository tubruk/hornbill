import { Hono } from "hono";
import { getDb, verifyBillAccess } from "../trailbase";
import { settlePayment } from "../services";
import { checkBillAccess, checkPaymentAccess } from "../middleware/auth";

const app = new Hono<{ Variables: { user: any; myAccountIds: Set<string>; payment: any; bill: any } }>();

app.get("/", async (c) => {
  try {
    const billId = c.req.query("billId");
    if (billId) {
      const hasAccess = await verifyBillAccess(c, billId);
      if (!hasAccess) {
        return c.json({ error: "Forbidden: No access to this bill" }, 403);
      }
      const list = await getDb(c).listPayments(billId);
      return c.json(list);
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
      return c.json(myPayments);
    }
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/:id", checkPaymentAccess("param", "id"), async (c) => {
  try {
    const payment = c.get("payment");
    return c.json(payment);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/", checkBillAccess("body", "bill_id"), async (c) => {
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

app.post("/:id/pay", checkPaymentAccess("param", "id"), async (c) => {
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

app.patch("/:id", checkPaymentAccess("param", "id"), async (c) => {
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

app.delete("/:id", checkPaymentAccess("param", "id"), async (c) => {
  try {
    const id = c.req.param("id");
    await getDb(c).deletePayment(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
