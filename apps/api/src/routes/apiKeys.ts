import { Hono } from "hono";
import { randomBytes, createHash } from "node:crypto";
import { getDb, verifyToken, type UserPayload } from "../trailbase";
import { CreateApiKeySchema } from "@hornbill/core";

const app = new Hono<{ Variables: { user: UserPayload } }>();

// Auth middleware for the API Keys sub-router
app.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Missing Authorization header" }, 401);
  }
  try {
    const user = await verifyToken(authHeader);
    c.set("user", user);
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid token";
    return c.json({ error: `Unauthorized: ${message}` }, 401);
  }
});

// GET /api/v1/api-keys - List keys for the current user
app.get("/", async (c) => {
  try {
    const user = c.get("user");
    const client = getDb(c);
    const keys = await client.listApiKeys(user.sub);
    return c.json(keys);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list API keys";
    return c.json({ error: message }, 500);
  }
});

// POST /api/v1/api-keys - Create a new key
app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const result = CreateApiKeySchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message || "Invalid input" }, 400);
    }

    const user = c.get("user");
    const client = getDb(c);

    // Generate token: hb_pat_ + 32 hex chars
    const rawTokenBytes = randomBytes(16).toString("hex");
    const rawToken = `hb_pat_${rawTokenBytes}`;
    
    // Hash the token
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const keyId = crypto.randomUUID();

    const newKey = await client.createApiKey({
      id: keyId,
      user_id: user.sub,
      name: result.data.name,
      token_hash: tokenHash,
    });

    return c.json({
      ...newKey,
      token: rawToken,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create API key";
    return c.json({ error: message }, 500);
  }
});

// DELETE /api/v1/api-keys/:id - Revoke a key
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const user = c.get("user");
    const client = getDb(c);

    // Verify ownership
    let key;
    try {
      key = await client.getApiKey(id);
    } catch {
      return c.json({ error: "API key not found" }, 404);
    }

    if (key.user_id !== user.sub) {
      return c.json({ error: "Forbidden: No access to this API key" }, 403);
    }

    await client.deleteApiKey(id);
    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to revoke API key";
    return c.json({ error: message }, 500);
  }
});

export default app;
