import { Hono } from "hono";
import { CONFIG } from "../config";
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { TrailbaseClient } from "../trailbase";

const app = new Hono();
const TRAILBASE_URL = CONFIG.TRAILBASE_URL;

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

app.post("/register", async (c) => {
  // Reject registration if disabled via env var
  const regEnabled = process.env.REGISTRATION_ENABLED !== "false";
  if (!regEnabled) {
    return c.json({ error: "Registration is currently disabled" }, 403);
  }
  try {
    const body = await c.req.json();
    if (!body.email || !body.password || !body.password_repeat) {
      return c.json({ error: "Email, password, and password_repeat are required" }, 400);
    }

    const response = await fetch(`${TRAILBASE_URL}/api/auth/v1/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: body.email,
        password: body.password,
        password_repeat: body.password_repeat,
      }),
    });

    const data = await response.text();
    
    // Auto-verify and create primary account if Trailbase returns 200/201 or 424
    if (response.status === 424 || response.ok) {
      await verifyAndCreateAccountInDb(body.email);
      return c.json({ message: "registered" }, 200);
    }

    let errJson;
    try {
      errJson = JSON.parse(data);
    } catch {
      errJson = undefined;
    }
    return c.json({ error: errJson?.error || data || "Registration failed" }, response.status as any);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.email || !body.password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const response = await fetch(`${TRAILBASE_URL}/api/auth/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: body.email,
        password: body.password,
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
      return c.json({ error: errorMsg }, response.status as any);
    }

    try {
      return c.json(JSON.parse(data), response.status as any);
    } catch {
      return c.json({ message: data }, response.status as any);
    }
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
