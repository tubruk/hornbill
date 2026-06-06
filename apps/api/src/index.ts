import { OpenAPIHono } from "@hono/zod-openapi";
import { CONFIG } from "./config";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { requestLogger } from "./middleware/requestLogger";
import { logger } from "./services/logger";
import { trimTrailingSlash } from "hono/trailing-slash";
import { serveStatic } from "hono/bun";
import { existsSync } from "fs";
import { queueService, registerJobWorkers } from "./services/jobs";
import accounts from "./routes/accounts";
import bills from "./routes/bills";
import payments from "./routes/payments";
import jobs from "./routes/jobs";
import auth from "./routes/auth";
import apiKeys from "./routes/apiKeys";
import { verifyToken, getDb, type UserPayload } from "./trailbase";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { defaultValidationHook } from "./utils/openapi-errors";

type Variables = {
  user: UserPayload;
};

const app = new OpenAPIHono<{ Variables: Variables }>({
  defaultHook: defaultValidationHook,
});

// Normalize trailing slashes (e.g. /api/v1/bills/ -> /api/v1/bills)
app.use("*", trimTrailingSlash());

// Enable security headers
app.use("*", secureHeaders());

// Enable request logging
app.use("*", requestLogger());

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
    c.req.path === "/api/v1/ping" ||
    c.req.path === "/api/v1/openapi.json"
  ) {
    return await next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Missing Authorization header" }, 401);
  }

  try {
    let user: UserPayload;
    if (authHeader.startsWith("ApiKey ")) {
      const rawToken = authHeader.substring(7);
      if (!rawToken.startsWith("hb_pat_")) {
        return c.json({ error: "Unauthorized: Invalid API Key format" }, 401);
      }
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update(rawToken).digest("hex");
      const dbInstance = getDb(c);
      const matchedUser = await dbInstance.verifyApiKeyHash(hash);
      if (!matchedUser) {
        return c.json({ error: "Unauthorized: Invalid API Key" }, 401);
      }
      user = matchedUser;
    } else {
      user = await verifyToken(authHeader);
    }

    c.set("user", user);
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid credentials";
    return c.json({ error: `Unauthorized: ${message}` }, 401);
  }
});



// Register routes
const api = new OpenAPIHono({ defaultHook: defaultValidationHook });

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
api.route("/api-keys", apiKeys);

app.route("/api/v1", api);

// Serve the dynamically generated OpenAPI specification
app.doc("/api/v1/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Hornbill API",
    version: "1.0.0",
    description: "API documentation for the Hornbill Personal Finance Tracker",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server",
    },
  ],
});

// Serve interactive API documentation (Scalar UI)
app.get(
  "/docs",
  apiReference({
    spec: {
      url: "/api/v1/openapi.json",
    },
    theme: "mars",
  })
);

// Centralized error handling
app.onError((err, c) => {
  logger.error(err, "API Unhandled Error");
  const status: ContentfulStatusCode = err.message.includes("Unauthorized") || err.message.includes("Authorization") ? 401 : 500;
  return c.json({ error: err.message || "Internal Server Error" }, status);
});

// Serve static files from React build directory if it exists
if (existsSync(CONFIG.WEB_DIST_DIR)) {
  app.use("/*", serveStatic({ root: CONFIG.WEB_DIST_DIR }));
}

// 404 handler (API JSON 404, or SPA fallback for frontend client-side routes)
app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not Found" }, 404);
  }

  // Only fallback to index.html for page routes (non-assets).
  // We check if the client accepts text/html, or if the path has no file extension.
  const accept = c.req.header("Accept") || "";
  const isHtmlRequest = accept.includes("text/html") || !/\.[a-zA-Z0-9]+$/.test(c.req.path);

  if (isHtmlRequest && existsSync(CONFIG.WEB_DIST_DIR)) {
    try {
      const html = await Bun.file(`${CONFIG.WEB_DIST_DIR}/index.html`).text();
      return c.html(html);
    } catch (e) {
      logger.error(e, "Failed to serve SPA index.html");
    }
  }

  return c.json({ error: "Not Found" }, 404);
});

// Initialize and start background job queue
registerJobWorkers();
(async () => {
  try {
    await queueService.start();
    logger.info("Background job queue service started successfully.");

    // Enqueue initial boot-time sync
    logger.info("Enqueueing initial boot-time payment sync job...");
    await queueService.enqueue("periodic-sync", {});

    // Register repeatable cron job for automatic sync
    const syncIntervalMin = CONFIG.SYNC_INTERVAL_MINUTES;
    if (syncIntervalMin > 0) {
      logger.info(`Registering periodic sync cron job (every ${syncIntervalMin} minutes)...`);
      await queueService.enqueue(
        "periodic-sync",
        {},
        {
          repeatPattern: `*/${syncIntervalMin} * * * *`,
        }
      );
    }

    // Register repeatable cron job for daily reminders (every 15 minutes)
    logger.info("Registering daily reminder check cron job (every 15 minutes)...");
    await queueService.enqueue(
      "daily-reminders",
      {},
      {
        repeatPattern: "*/15 * * * *",
      }
    );
  } catch (err) {
    logger.error(err, "Failed to start background job queue service");
  }
})();

// Graceful shutdown of queue service on process termination
const handleShutdown = async () => {
  logger.info("Shutting down Hornbill API server and queue service...");
  await queueService.shutdown();
  process.exit(0);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

const HOST = CONFIG.HOST;
const PORT = CONFIG.PORT;
logger.info(`Hornbill API is starting on ${HOST}:${PORT}...`);

export default {
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
};
