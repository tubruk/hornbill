import { Hono } from "hono";
import { syncAllPayments } from "../services";

const app = new Hono();

app.post("/sync", async (c) => {
  try {
    const stats = await syncAllPayments();
    return c.json({ success: true, ...stats });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
