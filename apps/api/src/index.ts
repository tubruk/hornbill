import { Hono } from "hono";
import { CONFIG } from "./config";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { existsSync } from "fs";
import { syncAllPayments } from "./services";
import accounts from "./routes/accounts";
import bills from "./routes/bills";
import payments from "./routes/payments";
import jobs from "./routes/jobs";
import auth from "./routes/auth";

const app = new Hono();

// Enable CORS for frontend requests
app.use(
  "/api/v1/*",
  cors({
    origin: "*", // Adjust to specific origin in production if needed
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

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

// Serve static files from React build directory if it exists
if (existsSync("./apps/web/dist")) {
  app.use("/*", serveStatic({ root: "./apps/web/dist" }));
  // Fallback to index.html for client-side routing (spa fallback)
  app.get("*", serveStatic({ path: "./apps/web/dist/index.html" }));
}

// Background runner for periodic payment generation
const syncIntervalMin = CONFIG.SYNC_INTERVAL_MINUTES; // Default: 24 hours (1440 mins)
if (syncIntervalMin > 0) {
  console.log(`Auto-sync background daemon active: running every ${syncIntervalMin} minutes.`);
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
