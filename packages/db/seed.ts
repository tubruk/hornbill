import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { spawn } from "child_process";

const TRAILBASE_URL = process.env.TRAILBASE_URL || "http://127.0.0.1:4000";
let trailProcess: any = null;

async function isTrailbaseRunning(): Promise<boolean> {
  try {
    await fetch(`${TRAILBASE_URL}/api/records/v1/accounts`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}
// Find Trailbase binary path
function getTrailbaseBinary(): string {
  if (process.env.TRAIL_BIN) return process.env.TRAIL_BIN;
  
  const homeBin = join(process.env.HOME || "", ".local/bin/trail");
  const localBin = join(process.cwd(), "bin/trail");
  
  if (existsSync(localBin)) return localBin;
  if (existsSync(homeBin)) return homeBin;
  
  return "trail"; // Fallback to system path
}

// Start Trailbase background daemon if not already running
async function startTrailbase(): Promise<boolean> {
  const running = await isTrailbaseRunning();
  if (running) {
    console.log("Trailbase is already running.");
    return true;
  }

  const binary = getTrailbaseBinary();
  console.log(`Starting Trailbase daemon using: ${binary}`);
  
  trailProcess = spawn(binary, [
    "--data-dir", "packages/db/traildepot",
    "run",
    "--address", "127.0.0.1:4000"
  ], { stdio: "inherit" });

  // Poll until database is active
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const ready = await isTrailbaseRunning();
    if (ready) {
      console.log("Trailbase started successfully.");
      return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error("Timed out waiting for Trailbase server to start.");
}

// Stop Trailbase daemon if we spawned it
function stopTrailbase() {
  if (trailProcess) {
    console.log("Stopping Trailbase daemon...");
    trailProcess.kill();
  }
}

// Execute the fixtures seeder logic
async function runSeeder() {
  const filePath = join(__dirname, "fixtures.yaml");
  console.log(`Loading fixtures from: ${filePath}`);
  const yamlContent = readFileSync(filePath, "utf8");
  const data = parse(yamlContent);
  const apiRequest = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${TRAILBASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`API error for ${path}: [${res.status}] ${text}`);
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return text;
    }
  };

  // 1. Purge existing data
  console.log("Purging existing accounts to trigger CASCADE deletes...");
  try {
    const accounts = await apiRequest("/api/records/v1/accounts?limit=1000");
    for (const acc of accounts.records || []) {
      console.log(`Deleting Account: ${acc.id}`);
      await apiRequest(`/api/records/v1/accounts/${acc.id}`, { method: "DELETE" });
    }
  } catch (err) {
    console.warn("Purge warning (database might be uninitialized):", err);
  }

  // 2. Insert Accounts
  console.log("Seeding accounts...");
  for (const account of data.accounts || []) {
    console.log(`Creating Account: ${account.name} (${account.id})`);
    const now = Math.floor(Date.now() / 1000);
    await apiRequest("/api/records/v1/accounts", {
      method: "POST",
      body: JSON.stringify({
        id: account.id,
        name: account.name,
        created_at: now,
        updated_at: now,
      }),
    });
  }

  // 3. Insert Bills
  console.log("Seeding bills...");
  for (const bill of data.bills || []) {
    console.log(`Creating Bill: ${bill.name} (${bill.id})`);
    const now = Math.floor(Date.now() / 1000);
    await apiRequest("/api/records/v1/bills", {
      method: "POST",
      body: JSON.stringify({
        id: bill.id,
        account_id: bill.account_id,
        name: bill.name,
        currency: bill.currency,
        amount_cents: bill.amount_cents,
        amount_type: bill.amount_type,
        recurrence: JSON.stringify(bill.recurrence),
        start_date: bill.start_date,
        active: bill.active ? 1 : 0,
        notes: bill.notes || null,
        created_at: now,
        updated_at: now,
      }),
    });
  }

  // 4. Insert Payments
  console.log("Seeding payments...");
  for (const p of data.payments || []) {
    console.log(`Creating Payment: Bill ID ${p.bill_id} due ${p.due_date} (${p.id})`);
    const now = Math.floor(Date.now() / 1000);
    
    // Parse human-readable string dates to Unix timestamps if provided
    let paidAtSeconds: number | null = null;
    if (p.paid_at) {
      if (typeof p.paid_at === "string") {
        paidAtSeconds = Math.floor(new Date(p.paid_at).getTime() / 1000);
      } else {
        paidAtSeconds = p.paid_at;
      }
    }

    await apiRequest("/api/records/v1/payments", {
      method: "POST",
      body: JSON.stringify({
        id: p.id,
        bill_id: p.bill_id,
        due_date: p.due_date,
        amount_cents: p.amount_cents,
        paid_at: paidAtSeconds,
        notes: p.notes || null,
        created_at: now,
        updated_at: now,
      }),
    });
  }

  console.log("Database fixtures seeded successfully!");
}

async function main() {
  try {
    await startTrailbase();
    await runSeeder();
  } catch (err) {
    console.error("Failed to seed database fixtures:", err);
    process.exitCode = 1;
  } finally {
    stopTrailbase();
  }
}

main();
