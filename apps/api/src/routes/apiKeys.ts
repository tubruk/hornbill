import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { randomBytes, createHash } from "node:crypto";
import { getDb, verifyToken, type UserPayload } from "../trailbase";
import { coreErrors, authErrors, validationErrors, lookupErrors, defaultValidationHook } from "../utils/openapi-errors";

// Decoupled OpenAPI schemas with descriptions and examples for the documentation UI
export const ApiKeyResponseSchema = z.object({
  id: z.string().openapi({
    description: "Unique UUID identifier of the API key",
    example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  }),
  user_id: z.string().openapi({
    description: "Owner user ID",
    example: "user_2a3f5b8c",
  }),
  name: z.string().openapi({
    description: "Human-readable name of the token",
    example: "Home Assistant Key",
  }),
  created_at: z.number().openapi({
    description: "Creation timestamp in Unix epoch seconds",
    example: 1717142404,
  }),
  last_used_at: z.number().nullable().optional().openapi({
    description: "Last usage timestamp in Unix epoch seconds, or null if never used",
    example: 1717142500,
  }),
}).openapi("ApiKeyResponse");

export const CreateApiKeyRequestSchema = z.object({
  name: z.string().min(1, "Name is required").openapi({
    description: "Descriptive name for the new API key",
    example: "Home Assistant Key",
  }),
}).openapi("CreateApiKey");

const ApiKeyWithRawSchema = ApiKeyResponseSchema.extend({
  token: z.string().openapi({
    description: "The raw personal access token. Shown only once upon creation.",
    example: "hb_pat_17a4b8df9c8e23f01ab234c56789def0",
  }),
}).openapi("ApiKeyWithRaw");

// Set up OpenAPIHono instance with custom validation hook
const app = new OpenAPIHono<{ Variables: { user: UserPayload } }>({
  defaultHook: defaultValidationHook,
});

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
const listKeysRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List API Keys",
  description: "Lists active API personal access tokens for the authenticated user",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(ApiKeyResponseSchema).openapi("ApiKeyList"),
        },
      },
      description: "Successfully retrieved active API keys",
    },
    ...coreErrors,
    ...authErrors,
  },
});

app.openapi(listKeysRoute, async (c) => {
  try {
    const user = c.get("user");
    const client = getDb(c);
    const keys = await client.listApiKeys(user.sub);
    return c.json(keys, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list API keys";
    return c.json({ error: message }, 500);
  }
});

// POST /api/v1/api-keys - Create a new key
const createKeyRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Create API Key",
  description: "Generates a new raw personal access token and registers its hash",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateApiKeyRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: ApiKeyWithRawSchema,
        },
      },
      description: "Successfully created API key",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
  },
});

app.openapi(createKeyRoute, async (c) => {
  try {
    const body = c.req.valid("json");
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
      name: body.name,
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
const deleteKeyRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Revoke API Key",
  description: "Deletes and revokes a personal access token by ID",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "ID of the API key to revoke", example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }).openapi("RevokeKeySuccess"),
        },
      },
      description: "API key successfully revoked",
    },
    ...coreErrors,
    ...authErrors,
    ...validationErrors,
    ...lookupErrors,
  },
});

app.openapi(deleteKeyRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");
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
    return c.json({ success: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to revoke API key";
    return c.json({ error: message }, 500);
  }
});

export default app;
