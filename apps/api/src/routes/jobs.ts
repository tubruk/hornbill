import { Hono } from "hono";
import { getDb, verifyAccountAccess, type UserPayload } from "../trailbase";
import { syncAllPayments } from "../services";

const app = new Hono<{ Variables: { user: UserPayload; myAccountIds: Set<string> } }>();

/* ---------- Global sync (admin) ---------- */
app.post("/sync", async (c) => {
  try {
    const stats = await syncAllPayments(); // all bills
    return c.json({ success: true, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return c.json({ error: message }, 500);
  }
});

/* ---------- Account‑scoped sync (dashboard) ---------- */
app.post("/sync/account/:accountId", async (c) => {
  try {
    const { accountId } = c.req.param();

    const hasAccess = await verifyAccountAccess(c, accountId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden: No access to this account" }, 403);
    }

    const db = getDb(c);
    const account = await db.getAccount(accountId);
    if (!account) {
      return c.json({ error: "Account not found" }, 404);
    }

    // Run sync only for this account.
    const stats = await syncAllPayments(accountId);
    return c.json({ success: true, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return c.json({ error: message }, 500);
  }
});

export default app;
