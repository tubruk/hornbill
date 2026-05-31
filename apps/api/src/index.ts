import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { existsSync } from "fs";
import { db } from "./trailbase";
import { generateNextPaymentForBill, settlePayment, syncAllPayments } from "./services";

const app = new Hono();

// Enable CORS for frontend requests
app.use(
  "/api/*",
  cors({
    origin: "*", // Adjust to specific origin in production if needed
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Basic healthcheck
app.get("/", (c) => c.text("Hornbill API is flying!"));

// --- Accounts Routes ---

app.get("/api/accounts", async (c) => {
  try {
    const list = await db.listAccounts();
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/accounts", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name) {
      return c.json({ error: "Name is required" }, 400);
    }
    const newAccount = await db.createAccount({
      id: crypto.randomUUID(),
      name: body.name,
    });
    return c.json(newAccount, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/api/accounts/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const account = await db.getAccount(id);
    return c.json(account);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.patch("/api/accounts/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    if (!body.name) {
      return c.json({ error: "Name is required" }, 400);
    }
    const updated = await db.updateAccount(id, { name: body.name });
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete("/api/accounts/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await db.deleteAccount(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- Bills Routes ---

app.get("/api/bills", async (c) => {
  try {
    const accountId = c.req.query("accountId");
    const list = await db.listBills(accountId);
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/api/bills/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const bill = await db.getBill(id);
    const payments = await db.listPayments(id);
    return c.json({ ...bill, payments });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/bills", async (c) => {
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

app.patch("/api/bills/:id", async (c) => {
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

app.delete("/api/bills/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await db.deleteBill(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- Payments Routes ---

app.get("/api/payments", async (c) => {
  try {
    const billId = c.req.query("billId");
    const list = await db.listPayments(billId);
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/api/payments/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const payment = await db.getPayment(id);
    return c.json(payment);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/payments", async (c) => {
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

app.post("/api/payments/:id/pay", async (c) => {
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

app.patch("/api/payments/:id", async (c) => {
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

app.delete("/api/payments/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await db.deletePayment(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- Background Job / Sync Trigger ---

app.post("/api/jobs/sync", async (c) => {
  try {
    const stats = await syncAllPayments();
    return c.json({ success: true, ...stats });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Serve static files from React build directory if it exists
if (existsSync("./apps/web/dist")) {
  app.use("/*", serveStatic({ root: "./apps/web/dist" }));
  // Fallback to index.html for client-side routing (spa fallback)
  app.get("*", serveStatic({ path: "./apps/web/dist/index.html" }));
}

// Background runner for periodic payment generation
const syncIntervalMin = Number(process.env.SYNC_INTERVAL_MINUTES) || 1440; // Default: 24 hours (1440 mins)
if (syncIntervalMin > 0) {
  console.log(`Auto-sync background daemon active: running every ${syncIntervalMin} minutes.`);
  setInterval(async () => {
    try {
      console.log("Running automatic background payment sync...");
      const stats = await syncAllPayments();
      console.log(`Auto-sync complete: processed ${stats.processed} active bills, generated ${stats.generated} payments.`);
    } catch (e) {
      console.error("Auto-sync background daemon failed:", e);
    }
  }, syncIntervalMin * 60 * 1000);
}

const PORT = Number(process.env.PORT) || 3000;
console.log(`Hornbill API is starting on port ${PORT}...`);

export default {
  port: PORT,
  fetch: app.fetch,
};
