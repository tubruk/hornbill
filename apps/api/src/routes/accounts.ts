import { Hono } from "hono";
import { db } from "../trailbase";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const list = await db.listAccounts();
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/", async (c) => {
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

app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const account = await db.getAccount(id);
    return c.json(account);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.patch("/:id", async (c) => {
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

app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await db.deleteAccount(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
