import { Hono } from "hono";
import { CONFIG } from "./config";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { logger } from "hono/logger";
import { trimTrailingSlash } from "hono/trailing-slash";
import { serveStatic } from "hono/bun";
import { existsSync } from "fs";
import { syncAllPayments } from "./services";
import accounts from "./routes/accounts";
import bills from "./routes/bills";
import payments from "./routes/payments";
import jobs from "./routes/jobs";
import auth from "./routes/auth";
import { verifyToken, type UserPayload } from "./trailbase";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type Variables = {
  user: UserPayload;
};

const app = new Hono<{ Variables: Variables }>();

// Normalize trailing slashes (e.g. /api/v1/bills/ -> /api/v1/bills)
app.use("*", trimTrailingSlash());

// Enable security headers
app.use("*", secureHeaders());

// Enable request logging
app.use("*", logger());

// Enable CORS for frontend requests
app.use(
  "/api/v1/*",
  cors({
    origin: "*", // Adjust to specific origin in production if needed
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Enforce authentication on all API routes except auth, status, and ping
app.use("/api/v1/*", async (c, next) => {
  if (
    c.req.path.startsWith("/api/v1/auth") ||
    c.req.path === "/api/v1/status" ||
    c.req.path === "/api/v1/ping"
  ) {
    return await next();
  }

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

// Basic healthcheck
app.get("/", (c) => c.text("Hornbill API is flying!"));

// Register routes
const api = new Hono();

api.get("/ping", (c) => c.json({ status: "ok" }));
api.get("/status", (c) => {
  const regEnabled = CONFIG.REGISTRATION_ENABLED;
  const trailbaseUrl = CONFIG.TRAILBASE_URL;
  const trailbaseToken = CONFIG.TRAILBASE_TOKEN;
  return c.json({
    status: "ok",
    registration_enabled: regEnabled,
    data_dir: CONFIG.TRAILBASE_DATA_DIR,
    trailbase_url: trailbaseUrl,
    trailbase_token_exists: !!trailbaseToken,
  });
});

api.route("/accounts", accounts);
api.route("/bills", bills);
api.route("/payments", payments);
api.route("/jobs", jobs);
api.route("/auth", auth);

app.route("/api/v1", api);

// Centralized error handling
app.onError((err, c) => {
  console.error("API Unhandled Error:", err);
  const status: ContentfulStatusCode = err.message.includes("Unauthorized") || err.message.includes("Authorization") ? 401 : 500;
  return c.json({ error: err.message || "Internal Server Error" }, status);
});

// JSON 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Serve static files from React build directory if it exists
if (existsSync("./apps/web/dist")) {
  app.use("/*", serveStatic({ root: "./apps/web/dist" }));
  // Fallback to index.html for client-side routing (spa fallback)
  app.get("*", serveStatic({ path: "./apps/web/dist/index.html" }));
}

// Background runner for periodic payment generation
const syncIntervalMin = CONFIG.SYNC_INTERVAL_MINUTES;
if (syncIntervalMin > 0) {
  console.log(`Auto-sync background daemon active: running every ${syncIntervalMin} minutes.`);
  
  // Trigger initial boot-time sync
  (async () => {
    try {
      console.log("Running initial boot-time background payment sync...");
      const stats = await syncAllPayments();
      console.log(`Initial auto-sync complete: processed ${stats.processed} active bills, generated ${stats.generated} payments.`);
    } catch (e) {
      console.error("Initial auto-sync background daemon failed:", e);
    }
  })();

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

const PORT = CONFIG.PORT;
console.log(`Hornbill API is starting on port ${PORT}...`);

export default {
  port: PORT,
  fetch: app.fetch,
};
