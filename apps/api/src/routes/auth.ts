import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { CONFIG } from "../config";
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { TrailbaseClient } from "../trailbase";
import { coreErrors, validationErrors, defaultValidationHook } from "../utils/openapi-errors";

const TRAILBASE_URL = CONFIG.TRAILBASE_URL;

// --- Zod Request/Response schemas ---

const RegisterRequestSchema = z.object({
  email: z.string().email("Invalid email format").optional(),
  password: z.string().optional(),
  password_repeat: z.string().optional(),
}).refine(data => data.email && data.password && data.password_repeat, {
  message: "Email, password, and password_repeat are required",
}).openapi("RegisterRequest");

const LoginRequestSchema = z.object({
  email: z.string().email("Invalid email format").optional(),
  password: z.string().optional(),
}).refine(data => data.email && data.password, {
  message: "Email and password are required",
}).openapi("LoginRequest");

const RefreshRequestSchema = z.object({
  refresh_token: z.string().optional(),
}).refine(data => data.refresh_token, {
  message: "Refresh token is required",
}).openapi("RefreshRequest");

const AuthSuccessResponseSchema = z.object({
  auth_token: z.string().openapi({ example: "auth-token-123" }),
  csrf_token: z.string().openapi({ example: "csrf-token-123" }),
}).openapi("AuthCredentials");

const RegisterSuccessResponseSchema = z.object({
  message: z.string().openapi({ example: "registered" }),
}).openapi("RegisterSuccess");

function binaryToUuidString(bin: Uint8Array): string {
  const hex = Buffer.from(bin).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

async function verifyAndCreateAccountInDb(email: string) {
  const baseDir = CONFIG.TRAILBASE_DATA_DIR;
  const paths = [`${baseDir}/data/main.db`];
  let dbPath = "";
  for (const p of paths) {
    if (existsSync(p)) {
      dbPath = p;
      break;
    }
  }
  if (!dbPath) {
    console.warn("Could not find main.db for user verification & account creation. Searched paths:", paths);
    return;
  }
  try {
    const db = new Database(dbPath);
    
    // 1. Verify user
    const verifyQuery = db.prepare("UPDATE _user SET verified = 1 WHERE email = ?");
    verifyQuery.run(email);
    
    // 2. Get user ID
    const getUserQuery = db.prepare("SELECT id FROM _user WHERE email = ?");
    const userRow = getUserQuery.get(email) as { id: Uint8Array } | undefined;
    
    let userIdBlob: Uint8Array | null = null;
    if (userRow) {
      userIdBlob = userRow.id;
    }
    db.close();

    if (userIdBlob) {
      // 3. Check existing mapping in database (select is fine)
      const db2 = new Database(dbPath);
      const checkMappingQuery = db2.prepare("SELECT 1 FROM account_users WHERE user_id = ? LIMIT 1");
      const mappingExists = checkMappingQuery.get(userIdBlob);
      db2.close();

      if (!mappingExists) {
        const userId = binaryToUuidString(userIdBlob);
        const accountId = crypto.randomUUID();
        const client = new TrailbaseClient();
        
        // 4. Create primary account via Trailbase Client
        await client.createAccount({
          id: accountId,
          name: email,
          upcoming_threshold_days: 7,
        });
        
        // 5. Associate user via Trailbase Client
        await client.associateUserToAccount(accountId, userId);
        console.log(`Successfully created primary account and mapping for user: ${email}`);
      }
    }
    console.log(`Successfully verified and prepared user ${email} in SQLite database.`);
  } catch (e) {
    console.error(`Failed to verify and prepare user ${email}:`, e);
  }
}

// Set up OpenAPIHono instance with custom validation hook
const app = new OpenAPIHono({
  defaultHook: defaultValidationHook,
});

// POST /api/v1/auth/register
const registerRoute = createRoute({
  method: "post",
  path: "/register",
  summary: "User Registration",
  description: "Registers a new user account and auto-creates their primary finance account",
  request: {
    body: {
      content: {
        "application/json": {
          schema: RegisterRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: RegisterSuccessResponseSchema,
        },
      },
      description: "Successfully registered account",
    },
    ...coreErrors,
    ...validationErrors,
  },
});

(app.openapi as any)(registerRoute, async (c: any) => {
  // Reject registration if disabled via env var
  const regEnabled = process.env.REGISTRATION_ENABLED !== "false";
  if (!regEnabled) {
    return c.json({ error: "Registration is currently disabled" }, 403);
  }
  try {
    const body = c.req.valid("json");
    
    // Explicitly type assert body since refine types can sometimes obscure them
    const reqBody = body as any;

    const response = await fetch(`${TRAILBASE_URL}/api/auth/v1/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: reqBody.email,
        password: reqBody.password,
        password_repeat: reqBody.password_repeat,
      }),
    });

    const data = await response.text();
    
    // Auto-verify and create primary account if Trailbase returns 200/201 or 424
    if (response.status === 424 || response.ok) {
      await verifyAndCreateAccountInDb(reqBody.email);
      return c.json({ message: "registered" }, 200);
    }

    let errJson;
    try {
      errJson = JSON.parse(data);
    } catch {
      errJson = undefined;
    }
    return c.json({ error: errJson?.error || data || "Registration failed" }, response.status as ContentfulStatusCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return c.json({ error: message }, 500);
  }
});

// POST /api/v1/auth/login
const loginRoute = createRoute({
  method: "post",
  path: "/login",
  summary: "User Login",
  description: "Authenticates user and returns credentials",
  request: {
    body: {
      content: {
        "application/json": {
          schema: LoginRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AuthSuccessResponseSchema,
        },
      },
      description: "Successfully authenticated credentials",
    },
    ...coreErrors,
    ...validationErrors,
  },
});

(app.openapi as any)(loginRoute, async (c: any) => {
  try {
    const body = c.req.valid("json");
    const reqBody = body as any;

    const response = await fetch(`${TRAILBASE_URL}/api/auth/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: reqBody.email,
        password: reqBody.password,
      }),
    });

    const data = await response.text();
    if (!response.ok) {
      let errJson;
      try {
        errJson = JSON.parse(data);
      } catch {
        errJson = undefined;
      }
      const errorMsg = errJson?.error || data || "Invalid credentials or email not verified";
      return c.json({ error: errorMsg }, response.status as ContentfulStatusCode);
    }

    try {
      return c.json(JSON.parse(data), response.status as ContentfulStatusCode);
    } catch {
      return c.json({ message: data }, response.status as ContentfulStatusCode);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return c.json({ error: message }, 500);
  }
});

// POST /api/v1/auth/refresh
const refreshRoute = createRoute({
  method: "post",
  path: "/refresh",
  summary: "Token Refresh",
  description: "Refreshes auth session credentials using a refresh token",
  request: {
    body: {
      content: {
        "application/json": {
          schema: RefreshRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AuthSuccessResponseSchema,
        },
      },
      description: "Successfully refreshed credentials",
    },
    ...coreErrors,
    ...validationErrors,
  },
});

(app.openapi as any)(refreshRoute, async (c: any) => {
  try {
    const body = c.req.valid("json");
    const reqBody = body as any;

    const response = await fetch(`${TRAILBASE_URL}/api/auth/v1/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: reqBody.refresh_token,
      }),
    });

    const data = await response.text();
    if (!response.ok) {
      let errJson;
      try {
        errJson = JSON.parse(data);
      } catch {
        errJson = undefined;
      }
      const errorMsg = errJson?.error || data || "Token refresh failed";
      return c.json({ error: errorMsg }, response.status as ContentfulStatusCode);
    }

    try {
      return c.json(JSON.parse(data), response.status as ContentfulStatusCode);
    } catch {
      return c.json({ message: data }, response.status as ContentfulStatusCode);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    return c.json({ error: message }, 500);
  }
});

export default app;
