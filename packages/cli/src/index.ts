#!/usr/bin/env bun
import { Command } from "commander";
import { resolveConfig, saveConfig, loadConfig, getConfigPath } from "./config";
import { checkStatus, checkAuth, listBills, listPayments, payPayment, APIError, login, createApiKey } from "./api";
import { promptText, promptPassword } from "./prompt";
import { hostname } from "node:os";
import packageJson from "../package.json";

const program = new Command();

program
  .name("hornbill")
  .description("CLI client for Hornbill bill tracker")
  .version(packageJson.version)
  .option("-u, --url <url>", "Hornbill server URL")
  .option("-k, --key <key>", "Hornbill personal access token")
  .option("-j, --json", "Format output as JSON");

// Helper to format cents into currency string
function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Simple ASCII table formatter
function printTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => {
    return Math.max(h.length, ...rows.map(row => (row[i] || "").length));
  });

  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join(" | ");
  const separator = colWidths.map(w => "-".repeat(w)).join("-+-");

  console.log(headerLine);
  console.log(separator);
  for (const row of rows) {
    console.log(row.map((val, i) => (val || "").padEnd(colWidths[i])).join(" | "));
  }
}

// Global error handler
function handleError(err: unknown): never {
  if (err instanceof APIError) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  console.error("An unknown error occurred:", err);
  process.exit(1);
}

// Command: login
program
  .command("login")
  .description("Authenticate and generate a personal access token")
  .option("-e, --email <email>", "User email address")
  .option("-p, --password <password>", "User password")
  .option("-n, --name <name>", "Descriptive name for the API Key")
  .action(async (cmdOpts) => {
    const opts = program.opts();
    
    // Resolve URL: CLI flag > Env var > File config > prompt
    let url = opts.url || process.env.HORNBILL_API_URL;
    if (!url) {
      const fileConfig = loadConfig();
      url = fileConfig.url;
    }
    if (!url) {
      url = await promptText("Hornbill Server URL", "http://localhost:3000");
      url = url.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");

      console.log(`Checking connection to ${url}...`);
      try {
        await checkStatus(url);
        console.log("Server is online.");
      } catch (err) {
        console.error(`Error: Could not connect to Hornbill server at ${url}.`);
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    } else {
      url = url.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
    }

    // Resolve email
    let email = cmdOpts.email || process.env.HORNBILL_EMAIL;
    if (!email) {
      email = await promptText("Email");
      if (!email) {
        console.error("Email is required.");
        process.exit(1);
      }
    }

    // Resolve password
    let password = cmdOpts.password || process.env.HORNBILL_PASSWORD;
    if (!password) {
      password = await promptPassword("Password: ");
      if (!password) {
        console.error("Password is required.");
        process.exit(1);
      }
    }

    // Resolve API key name
    const defaultKeyName = `hornbill-cli@${hostname()}`;
    let keyName = cmdOpts.name || process.env.HORNBILL_API_KEY_NAME;
    if (!keyName) {
      keyName = await promptText("API Key Name", defaultKeyName);
    }

    try {
      console.log(`Connecting to ${url}...`);
      // 1. Call login to get auth token
      const authResult = await login(url, email, password);
      console.log("Authentication successful!");

      // 2. Call createApiKey using auth token
      console.log(`Creating API key "${keyName}"...`);
      const apiKeyResult = await createApiKey(url, authResult.auth_token, keyName);
      
      // 3. Save to local config
      const current = loadConfig();
      current.url = url;
      current.key = apiKeyResult.token;
      saveConfig(current);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              url,
              api_key_id: apiKeyResult.id,
              api_key_name: apiKeyResult.name,
              status: "success",
            },
            null,
            2
          )
        );
      } else {
        console.log("\nSuccessfully logged in!");
        console.log(`Server URL saved:  ${url}`);
        console.log(`API Key saved:     ${apiKeyResult.id} (${keyName})`);
        console.log(`Config path:       ${getConfigPath()}`);
      }
    } catch (err) {
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            },
            null,
            2
          )
        );
        process.exit(1);
      } else {
        handleError(err);
      }
    }
  });

// Command: status
program
  .command("status")
  .description("Check Hornbill connection and authentication status")
  .action(async () => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      const serverStatus = await checkStatus(config.url);
      const isAuthed = config.key ? await checkAuth(config.url, config.key) : false;

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              url: config.url,
              online: true,
              authenticated: isAuthed,
              registration_enabled: serverStatus.registration_enabled,
            },
            null,
            2
          )
        );
      } else {
        console.log(`Server URL:   ${config.url}`);
        console.log(`Connection:   Online`);
        console.log(`Auth Status:  ${isAuthed ? "Authenticated" : "Unauthenticated (or missing API key)"}`);
        console.log(`Registration: ${serverStatus.registration_enabled ? "Enabled" : "Disabled"}`);
      }
    } catch (err) {
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              url: config.url,
              online: false,
              authenticated: false,
              error: err instanceof Error ? err.message : String(err),
            },
            null,
            2
          )
        );
        process.exit(1);
      } else {
        console.error(`Failed to connect to Hornbill server at ${config.url}`);
        handleError(err);
      }
    }
  });

// Command: config
const configCmd = program.command("config").description("Manage local CLI configuration");

configCmd
  .command("set <key> <value>")
  .description("Set configuration value (keys: url, key)")
  .action((key: string, value: string) => {
    if (key !== "url" && key !== "key") {
      console.error("Invalid configuration key. Supported keys: url, key");
      process.exit(1);
    }
    const current = loadConfig();
    const configKey = key as keyof typeof current;
    current[configKey] = value;
    saveConfig(current);
    console.log(`Config updated: set ${key} to ${key === "key" ? "********" : value}`);
  });

configCmd
  .command("get <key>")
  .description("Get configuration value")
  .action((key: string) => {
    if (key !== "url" && key !== "key") {
      console.error("Invalid configuration key. Supported keys: url, key");
      process.exit(1);
    }
    const current = loadConfig();
    const configKey = key as keyof typeof current;
    console.log(current[configKey] || "");
  });

configCmd
  .command("list")
  .description("List all configuration keys and paths")
  .action(() => {
    const opts = program.opts();
    const current = loadConfig();
    if (opts.json) {
      const redacted = { ...current };
      if (redacted.key) {
        redacted.key = "********";
      }
      console.log(JSON.stringify({ configPath: getConfigPath(), config: redacted }, null, 2));
    } else {
      console.log(`Config file: ${getConfigPath()}`);
      console.log(`url:         ${current.url || "(not set)"}`);
      console.log(`key:         ${current.key ? "********" : "(not set)"}`);
    }
  });

// Command: bills
const billsCmd = program.command("bills").description("Manage and view bills");

billsCmd
  .command("list")
  .description("List all bills")
  .action(async () => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      const bills = await listBills(config.url, config.key);

      if (opts.json) {
        console.log(JSON.stringify(bills, null, 2));
      } else {
        if (bills.length === 0) {
          console.log("No bills found.");
          return;
        }
        const headers = ["ID", "Name", "Amount", "Currency", "Type", "Active", "Start Date"];
        const rows = bills.map(bill => [
          bill.id,
          bill.name,
          formatAmount(bill.amount_cents),
          bill.currency,
          bill.amount_type,
          bill.active ? "Yes" : "No",
          bill.start_date,
        ]);
        printTable(headers, rows);
      }
    } catch (err) {
      handleError(err);
    }
  });

// Command: payments
const paymentsCmd = program.command("payments").description("Manage and view payments");

paymentsCmd
  .command("list")
  .description("List payments")
  .option("-s, --status <status>", "Filter by status: all, paid, unpaid", "unpaid")
  .option("-b, --bill-id <billId>", "Filter payments by Bill ID")
  .option("-l, --limit <limit>", "Limit number of payments printed (only for human output)", "20")
  .action(async (cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      // Fetch bills to get names for formatting
      let billsMap = new Map<string, string>();
      try {
        const bills = await listBills(config.url, config.key);
        billsMap = new Map(bills.map(b => [b.id, b.name]));
      } catch {
        // Fallback if bills list fails (e.g. key has limited scopes, but we continue anyway)
      }

      let payments = await listPayments(config.url, config.key, { billId: cmdOpts.billId });

      // Apply status filter
      if (cmdOpts.status === "paid") {
        payments = payments.filter(p => p.paid_at != null);
      } else if (cmdOpts.status === "unpaid") {
        payments = payments.filter(p => p.paid_at == null);
      } else if (cmdOpts.status !== "all") {
        console.error("Invalid status filter. Choose: all, paid, unpaid");
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(payments, null, 2));
      } else {
        // Apply limit for text display to prevent spam
        const limit = parseInt(cmdOpts.limit, 10);
        const displayPayments = payments.slice(0, isNaN(limit) ? 20 : limit);

        if (displayPayments.length === 0) {
          console.log(`No ${cmdOpts.status} payments found.`);
          return;
        }

        const headers = ["ID", "Bill Name", "Due Date", "Amount", "Status", "Paid At"];
        const rows = displayPayments.map(p => {
          const billName = billsMap.get(p.bill_id) || p.bill_id;
          const status = p.paid_at != null ? "Paid" : "Unpaid";
          const paidAtStr = p.paid_at != null ? new Date(p.paid_at * 1000).toISOString().split("T")[0] : "-";
          return [
            p.id,
            billName,
            p.due_date,
            formatAmount(p.amount_cents),
            status,
            paidAtStr,
          ];
        });

        printTable(headers, rows);
        if (payments.length > displayPayments.length) {
          console.log(`\nShowing first ${displayPayments.length} of ${payments.length} payments. Use --limit to show more.`);
        }
      }
    } catch (err) {
      handleError(err);
    }
  });

paymentsCmd
  .command("pay <paymentId>")
  .description("Settle a payment cycle")
  .option("-d, --date <date>", "ISO date string or Unix timestamp of payment settlement")
  .option("-a, --amount <amount>", "Override amount to pay (in standard format, e.g. 15.99)")
  .action(async (paymentId, cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    let amountCents: number | undefined;
    if (cmdOpts.amount !== undefined) {
      const num = parseFloat(cmdOpts.amount);
      if (isNaN(num) || num < 0) {
        console.error("Invalid amount. Must be a positive number.");
        process.exit(1);
      }
      amountCents = Math.round(num * 100);
    }

    try {
      const updated = await payPayment(config.url, config.key, paymentId, {
        paidAt: cmdOpts.date,
        amountCents,
      });

      if (opts.json) {
        console.log(JSON.stringify(updated, null, 2));
      } else {
        console.log(`Payment ${paymentId} successfully settled!`);
        console.log(`Amount:      ${formatAmount(updated.amount_cents)}`);
        console.log(`Paid At:     ${updated.paid_at ? new Date(updated.paid_at * 1000).toISOString() : "-"}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

program.parse(process.argv);
