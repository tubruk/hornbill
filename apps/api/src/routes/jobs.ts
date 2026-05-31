import { Hono } from "hono";
import { getDb } from "../trailbase";
import { syncAllPayments } from "../services";

const app = new Hono();

/* ---------- Global sync (admin) ---------- */
app.post("/sync", async (c) => {
  try {
    const stats = await syncAllPayments(); // all bills
    return c.json({ success: true, ...stats });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ---------- Account‑scoped sync (dashboard) ---------- */
app.post("/sync/account/:accountId", async (c) => {
  try {
    const { accountId } = c.req.param();

    const db = getDb(c);
    const account = await db.getAccount(accountId);
    if (!account) {
      return c.json({ error: "Account not found" }, 404);
    }

    // Run sync only for this account.
    const stats = await syncAllPayments(accountId);
    return c.json({ success: true, ...stats });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
