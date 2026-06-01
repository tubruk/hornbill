export const CONFIG = {
  TRAILBASE_URL: process.env.TRAILBASE_URL || "http://localhost:4000",
  TRAILBASE_TOKEN: process.env.TRAILBASE_TOKEN || "",
  TRAILBASE_DATA_DIR: process.env.TRAILBASE_DATA_DIR || "./data/hornbill",
  REGISTRATION_ENABLED: process.env.REGISTRATION_ENABLED !== "false",
  SYNC_INTERVAL_MINUTES: Number(process.env.SYNC_INTERVAL_MINUTES) || 60,
  PORT: Number(process.env.PORT) || 3000,
} as const;
