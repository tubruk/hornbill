import { Hono } from "hono";
import { getDb, verifyToken } from "../trailbase";
import { DEFAULT_UPCOMING_THRESHOLD_DAYS, AccountSchema } from "@hornbill/core";

const app = new Hono();

async function getAuthUser(c: any): Promise<any> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }
  return await verifyToken(authHeader);
}

app.get("/", async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    const accountUsers = await client.listAccountUsers();
    const myAccountIds = new Set(
      accountUsers.filter((au) => au.user_id === user.sub).map((au) => au.account_id)
    );
    const allAccounts = await client.listAccounts();
    const myAccounts = allAccounts.filter((acc) => myAccountIds.has(acc.id));
    return c.json(myAccounts);
  } catch (err: any) {
    const status = err.message.includes("Unauthorized") || err.message.includes("Authorization") ? 401 : 500;
    return c.json({ error: err.message }, status);
  }
});

app.post("/", async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    const body = await c.req.json();
    
    const accountId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const accountData = {
      id: accountId,
      name: body.name ?? "",
      upcoming_threshold_days: body.upcoming_threshold_days ?? DEFAULT_UPCOMING_THRESHOLD_DAYS,
      currencies: body.currencies ?? ["IDR", "USD"],
      default_currency: body.default_currency ?? "IDR",
      archived: false,
      created_at: now,
      updated_at: now,
    };

    const parsed = AccountSchema.safeParse(accountData);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }

    const newAccount = await client.createAccount({
      id: accountData.id,
      name: accountData.name,
      upcoming_threshold_days: accountData.upcoming_threshold_days,
      currencies: accountData.currencies,
      default_currency: accountData.default_currency,
      archived: accountData.archived,
    });
    await client.associateUserToAccount(newAccount.id, user.sub);
    return c.json(newAccount, 201);
  } catch (err: any) {
    const status = err.message.includes("Unauthorized") || err.message.includes("Authorization") ? 401 : 500;
    return c.json({ error: err.message }, status);
  }
});

app.get("/:id", async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    const id = c.req.param("id");
    const accountUsers = await client.listAccountUsers();
    const hasAccess = accountUsers.some((au) => au.user_id === user.sub && au.account_id === id);
    if (!hasAccess) {
      return c.json({ error: "Forbidden: No access to this account" }, 403);
    }
    const account = await client.getAccount(id);
    return c.json(account);
  } catch (err: any) {
    const status = err.message.includes("Unauthorized") || err.message.includes("Authorization") ? 401 : 500;
    return c.json({ error: err.message }, status);
  }
});

app.patch("/:id", async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    const id = c.req.param("id");
    const accountUsers = await client.listAccountUsers();
    const hasAccess = accountUsers.some((au) => au.user_id === user.sub && au.account_id === id);
    if (!hasAccess) {
      return c.json({ error: "Forbidden: No access to this account" }, 403);
    }
    const body = await c.req.json();
    const current = await client.getAccount(id);
    
    // Merge update with current record for validation
    const merged = {
      ...current,
      ...body,
    };
    
    const parsed = AccountSchema.safeParse(merged);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }

    const updated = await client.updateAccount(id, {
      name: body.name,
      upcoming_threshold_days: body.upcoming_threshold_days,
      currencies: body.currencies,
      default_currency: body.default_currency,
      archived: body.archived,
    });
    return c.json(updated);
  } catch (err: any) {
    const status = err.message.includes("Unauthorized") || err.message.includes("Authorization") ? 401 : 500;
    return c.json({ error: err.message }, status);
  }
});

app.delete("/:id", async (c) => {
  try {
    const user = await getAuthUser(c);
    const client = getDb(c);
    const id = c.req.param("id");
    const accountUsers = await client.listAccountUsers();
    const hasAccess = accountUsers.some((au) => au.user_id === user.sub && au.account_id === id);
    if (!hasAccess) {
      return c.json({ error: "Forbidden: No access to this account" }, 403);
    }
    await client.deleteAccount(id);
    return c.json({ success: true });
  } catch (err: any) {
    const status = err.message.includes("Unauthorized") || err.message.includes("Authorization") ? 401 : 500;
    return c.json({ error: err.message }, status);
  }
});

export default app;
