#!/usr/bin/env bun
import { Command } from "commander";
import { resolveConfig, saveConfig, loadConfig, getConfigPath } from "./config";
import {
  checkStatus,
  checkAuth,
  listBills,
  listPayments,
  payPayment,
  APIError,
  login,
  createApiKey,
  listAccounts,
  createBill,
  updatePayment,
  createPayment,
  updateBill,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  exportAccount,
  importAccount,
  type ExportPayload,
} from "./api";
import { promptText, promptPassword, promptSelect } from "./prompt";
import { hostname, homedir } from "node:os";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import packageJson from "../package.json";
import { getSkillContent } from "./macro" with { type: "macro" };

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
              cli_version: packageJson.version,
              server_version: serverStatus.version || "unknown",
            },
            null,
            2
          )
        );
      } else {
        console.log(`Server URL:     ${config.url}`);
        console.log(`Connection:     Online`);
        console.log(`Auth Status:    ${isAuthed ? "Authenticated" : "Unauthenticated (or missing API key)"}`);
        console.log(`Registration:   ${serverStatus.registration_enabled ? "Enabled" : "Disabled"}`);
        console.log(`CLI Version:    ${packageJson.version}`);
        console.log(`Server Version: ${serverStatus.version || "unknown"}`);
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
              cli_version: packageJson.version,
              server_version: "unknown",
            },
            null,
            2
          )
        );
        process.exit(1);
      } else {
        console.error(`Failed to connect to Hornbill server at ${config.url}`);
        console.log(`CLI Version:    ${packageJson.version}`);
        console.log(`Server Version: unknown`);
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
        const headers = ["ID", "Name", "Amount", "Currency", "Active", "Start Date"];
        const rows = bills.map(bill => [
          bill.id,
          bill.name,
          formatAmount(bill.amount_cents),
          bill.currency,
          bill.active ? "Yes" : "No",
          bill.start_date,
        ]);
        printTable(headers, rows);
      }
    } catch (err) {
      handleError(err);
    }
  });

billsCmd
  .command("create")
  .description("Create a new bill")
  .option("-n, --name <name>", "Name of the bill")
  .option("-a, --amount <amount>", "Billing amount (e.g. 15.99)")
  .option("-c, --currency <currency>", "Currency code (e.g. USD, IDR)", "USD")
  .option("-s, --start-date <date>", "Start date YYYY-MM-DD (defaults to today)")
  .option("-u, --account-id <accountId>", "Account UUID")
  .option("-r, --recurrence <recurrence>", "Recurrence: one-time, monthly:<day>, yearly:<month>-<day>, interval:<every>-<unit>-<from>, or JSON string")
  .option("--notes <notes>", "Optional notes")
  .option("--upcoming-threshold-days <days>", "Upcoming threshold days")
  .option("--last-payment-date <date>", "Last payment date YYYY-MM-DD")
  .action(async (cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      let accountId = cmdOpts.accountId;
      if (!accountId) {
        const accounts = await listAccounts(config.url, config.key);
        if (accounts.length === 1) {
          accountId = accounts[0].id;
        } else if (accounts.length > 1) {
          const choices = accounts.map(a => ({ name: `${a.name} (${a.id})`, value: a.id }));
          accountId = await promptSelect("Select an Account", choices);
        } else {
          console.error("Error: No accounts found. Please create an account first.");
          process.exit(1);
        }
      }

      let name = cmdOpts.name;
      if (!name) {
        name = await promptText("Bill Name");
        if (!name) {
          console.error("Error: Bill name is required.");
          process.exit(1);
        }
      }

      const amountVal = cmdOpts.amount ? parseFloat(cmdOpts.amount) : 0;
      if (isNaN(amountVal) || amountVal < 0) {
        console.error("Error: Amount must be a positive number.");
        process.exit(1);
      }
      const amountCents = Math.round(amountVal * 100);

      let recurrence: unknown = null;
      let recStr = cmdOpts.recurrence;
      if (recStr === undefined) {
        recStr = await promptText("Recurrence (one-time, monthly:<day>, yearly:<month>-<day>, interval:<every>-<unit>-<from>)", "one-time");
      }

      if (recStr && recStr !== "one-time" && recStr !== "none") {
        if (recStr.trim().startsWith("{")) {
          recurrence = JSON.parse(recStr);
        } else {
          const monthlyMatch = recStr.match(/^monthly:(\d+)$/);
          const yearlyMatch = recStr.match(/^yearly:(\d+)-(\d+)$/);
          const intervalMatch = recStr.match(/^interval:(\d+)-(days|weeks|months)-(due_date|paid_at)$/);

          if (monthlyMatch) {
            recurrence = { type: "monthly", monthly: { day: parseInt(monthlyMatch[1], 10) } };
          } else if (yearlyMatch) {
            recurrence = { type: "yearly", yearly: { month: parseInt(yearlyMatch[1], 10), day: parseInt(yearlyMatch[2], 10) } };
          } else if (intervalMatch) {
            recurrence = {
              type: "interval",
              interval: {
                every: parseInt(intervalMatch[1], 10),
                unit: intervalMatch[2],
                from: intervalMatch[3],
              },
            };
          } else {
            console.error("Error: Invalid recurrence format. Use one-time, monthly:<day>, yearly:<month>-<day>, interval:<every>-<unit>-<from>, or a raw JSON string.");
            process.exit(1);
          }
        }
      }

      const startDate = cmdOpts.startDate || new Date().toISOString().split("T")[0];

      const payload: Record<string, unknown> = {
        account_id: accountId,
        name,
        currency: cmdOpts.currency,
        amount_cents: amountCents,
        recurrence,
        start_date: startDate,
        active: true,
      };

      if (cmdOpts.notes) {
        payload.notes = cmdOpts.notes;
      }
      if (cmdOpts.upcomingThresholdDays) {
        payload.upcoming_threshold_days = parseInt(cmdOpts.upcomingThresholdDays, 10);
      }
      if (cmdOpts.lastPaymentDate) {
        payload.last_payment_date = cmdOpts.lastPaymentDate;
      }

      const bill = await createBill(config.url, config.key, payload);

      if (opts.json) {
        console.log(JSON.stringify(bill, null, 2));
      } else {
        console.log(`Bill "${bill.name}" created successfully!`);
        console.log(`ID:           ${bill.id}`);
        console.log(`Amount:       ${formatAmount(bill.amount_cents)} ${bill.currency}`);
        console.log(`Recurrence:   ${bill.recurrence ? JSON.stringify(bill.recurrence) : "one-time"}`);
        console.log(`Start Date:   ${bill.start_date}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

billsCmd
  .command("update <billId>")
  .description("Update details of an existing bill")
  .option("-n, --name <name>", "New name of the bill")
  .option("-a, --amount <amount>", "New billing amount (e.g. 15.99)")
  .option("-r, --recurrence <recurrence>", "New recurrence: one-time, monthly:<day>, yearly:<month>-<day>, interval:<every>-<unit>-<from>, or JSON string")
  .option("--notes <notes>", "Optional notes (or 'null' to clear)")
  .option("--upcoming-threshold-days <days>", "Upcoming threshold days (or 'null' to clear)")
  .option("--active <active>", "Active state (true/false)")
  .action(async (billId, cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    const payload: Record<string, unknown> = {};

    if (cmdOpts.name !== undefined) {
      const name = cmdOpts.name.trim();
      if (!name) {
        console.error("Error: Bill name cannot be empty.");
        process.exit(1);
      }
      payload.name = name;
    }

    if (cmdOpts.amount !== undefined) {
      const num = parseFloat(cmdOpts.amount);
      if (isNaN(num) || num < 0) {
        console.error("Error: Amount must be a positive number.");
        process.exit(1);
      }
      payload.amount_cents = Math.round(num * 100);
    }

    if (cmdOpts.recurrence !== undefined) {
      const recStr = cmdOpts.recurrence;
      if (recStr === "one-time" || recStr === "none") {
        payload.recurrence = null;
      } else if (recStr.trim().startsWith("{")) {
        payload.recurrence = JSON.parse(recStr);
      } else {
        const monthlyMatch = recStr.match(/^monthly:(\d+)$/);
        const yearlyMatch = recStr.match(/^yearly:(\d+)-(\d+)$/);
        const intervalMatch = recStr.match(/^interval:(\d+)-(days|weeks|months)-(due_date|paid_at)$/);

        if (monthlyMatch) {
          payload.recurrence = { type: "monthly", monthly: { day: parseInt(monthlyMatch[1], 10) } };
        } else if (yearlyMatch) {
          payload.recurrence = { type: "yearly", yearly: { month: parseInt(yearlyMatch[1], 10), day: parseInt(yearlyMatch[2], 10) } };
        } else if (intervalMatch) {
          payload.recurrence = {
            type: "interval",
            interval: {
              every: parseInt(intervalMatch[1], 10),
              unit: intervalMatch[2],
              from: intervalMatch[3],
            },
          };
        } else {
          console.error("Error: Invalid recurrence format. Use one-time, monthly:<day>, yearly:<month>-<day>, interval:<every>-<unit>-<from>, or a raw JSON string.");
          process.exit(1);
        }
      }
    }

    if (cmdOpts.notes !== undefined) {
      payload.notes = cmdOpts.notes === "null" ? null : cmdOpts.notes;
    }
    if (cmdOpts.upcomingThresholdDays !== undefined) {
      payload.upcoming_threshold_days = cmdOpts.upcomingThresholdDays === "null" ? null : parseInt(cmdOpts.upcomingThresholdDays, 10);
    }
    if (cmdOpts.active !== undefined) {
      if (cmdOpts.active === "true") {
        payload.active = true;
      } else if (cmdOpts.active === "false") {
        payload.active = false;
      } else {
        console.error("Error: --active must be 'true' or 'false'.");
        process.exit(1);
      }
    }

    if (Object.keys(payload).length === 0) {
      console.error("Error: Please provide at least one option to update (--name, --amount, --recurrence, --notes, --upcoming-threshold-days, --active). To change when a bill was last paid, use 'payments update <paymentId> --paid-at' instead.");
      process.exit(1);
    }

    try {
      const bill = await updateBill(config.url, config.key, billId, payload);

      if (opts.json) {
        console.log(JSON.stringify(bill, null, 2));
      } else {
        console.log(`Bill ${billId} updated successfully!`);
        console.log(`Name:        ${bill.name}`);
        console.log(`Amount:      ${formatAmount(bill.amount_cents)} ${bill.currency}`);
        console.log(`Recurrence:  ${bill.recurrence ? JSON.stringify(bill.recurrence) : "one-time"}`);
        console.log(`Active:      ${bill.active ? "Yes" : "No"}`);
        if (bill.notes !== undefined) {
          console.log(`Notes:       ${bill.notes || "-"}`);
        }
        if (bill.upcoming_threshold_days !== undefined) {
          console.log(`Threshold:   ${bill.upcoming_threshold_days ?? "-"} days`);
        }
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

paymentsCmd
  .command("update <paymentId>")
  .description("Update details of an existing payment cycle")
  .option("-d, --due-date <date>", "Scheduled due date (YYYY-MM-DD)")
  .option("-a, --amount <amount>", "Payment amount override (e.g. 15.99)")
  .option("-p, --paid-at <date>", "Payment settlement date/timestamp, or 'null' to clear paid status")
  .option("-n, --notes <notes>", "Optional notes")
  .action(async (paymentId, cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    const payload: Record<string, unknown> = {};
    if (cmdOpts.dueDate !== undefined) {
      payload.due_date = cmdOpts.dueDate;
    }
    if (cmdOpts.amount !== undefined) {
      const num = parseFloat(cmdOpts.amount);
      if (isNaN(num) || num < 0) {
        console.error("Invalid amount. Must be a positive number.");
        process.exit(1);
      }
      payload.amount_cents = Math.round(num * 100);
    }
    if (cmdOpts.paidAt !== undefined) {
      if (cmdOpts.paidAt === "null") {
        payload.paid_at = null;
      } else {
        payload.paid_at = cmdOpts.paidAt;
      }
    }
    if (cmdOpts.notes !== undefined) {
      payload.notes = cmdOpts.notes;
    }

    if (Object.keys(payload).length === 0) {
      console.error("Error: Please provide at least one option to update (--due-date, --amount, --paid-at, --notes).");
      process.exit(1);
    }

    try {
      const updated = await updatePayment(config.url, config.key, paymentId, payload);

      if (opts.json) {
        console.log(JSON.stringify(updated, null, 2));
      } else {
        console.log(`Payment ${paymentId} updated successfully!`);
        console.log(`Due Date:    ${updated.due_date}`);
        console.log(`Amount:      ${formatAmount(updated.amount_cents)}`);
        console.log(`Paid At:     ${updated.paid_at ? new Date(updated.paid_at * 1000).toISOString() : "-"}`);
        console.log(`Notes:       ${updated.notes || "-"}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

paymentsCmd
  .command("create")
  .description("Create an ad-hoc payment cycle for a bill")
  .option("-b, --bill-id <billId>", "Associated Bill ID")
  .option("-d, --due-date <date>", "Scheduled due date YYYY-MM-DD (defaults to today)")
  .option("-a, --amount <amount>", "Payment amount (e.g. 15.99)")
  .option("-p, --paid-at <date>", "Payment settlement date/timestamp")
  .option("-n, --notes <notes>", "Optional notes")
  .action(async (cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      let billId = cmdOpts.billId;
      if (!billId) {
        const bills = await listBills(config.url, config.key);
        if (bills.length === 1) {
          billId = bills[0].id;
        } else if (bills.length > 1) {
          const choices = bills.map(b => ({ name: `${b.name} (${b.id})`, value: b.id }));
          billId = await promptSelect("Select a Bill", choices);
        } else {
          console.error("Error: No bills found. Please create a bill first.");
          process.exit(1);
        }
      }

      let amountStr = cmdOpts.amount;
      if (amountStr === undefined) {
        amountStr = await promptText("Amount (e.g. 15.99)");
      }
      const amountVal = parseFloat(amountStr || "0");
      if (isNaN(amountVal) || amountVal <= 0) {
        console.error("Error: A positive amount is required.");
        process.exit(1);
      }
      const amountCents = Math.round(amountVal * 100);

      const dueDate = cmdOpts.dueDate || new Date().toISOString().split("T")[0];

      const payload: Record<string, unknown> = {
        bill_id: billId,
        due_date: dueDate,
        amount_cents: amountCents,
      };

      if (cmdOpts.paidAt !== undefined) {
        payload.paid_at = cmdOpts.paidAt;
      }
      if (cmdOpts.notes !== undefined) {
        payload.notes = cmdOpts.notes;
      }

      const payment = await createPayment(config.url, config.key, payload);

      if (opts.json) {
        console.log(JSON.stringify(payment, null, 2));
      } else {
        console.log(`Payment created successfully!`);
        console.log(`ID:          ${payment.id}`);
        console.log(`Bill ID:     ${payment.bill_id}`);
        console.log(`Due Date:    ${payment.due_date}`);
        console.log(`Amount:      ${formatAmount(payment.amount_cents)}`);
        console.log(`Paid At:     ${payment.paid_at ? new Date(payment.paid_at * 1000).toISOString() : "-"}`);
        console.log(`Notes:       ${payment.notes || "-"}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

// Command: accounts
const accountsCmd = program.command("accounts").description("Manage and view financial accounts");

accountsCmd
  .command("list")
  .description("List all accounts")
  .action(async () => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      const accounts = await listAccounts(config.url, config.key);

      if (opts.json) {
        console.log(JSON.stringify(accounts, null, 2));
      } else {
        if (accounts.length === 0) {
          console.log("No accounts found.");
          return;
        }
        const headers = ["ID", "Name", "Default Currency", "Currencies", "Threshold", "Archived"];
        const rows = accounts.map(acc => [
          acc.id,
          acc.name,
          acc.default_currency,
          acc.currencies.join(", "),
          `${acc.upcoming_threshold_days} days`,
          acc.archived ? "Yes" : "No",
        ]);
        printTable(headers, rows);
      }
    } catch (err) {
      handleError(err);
    }
  });

accountsCmd
  .command("create")
  .description("Create a new financial account")
  .option("-n, --name <name>", "Name of the account")
  .option("-t, --threshold <days>", "Threshold in days for upcoming bills alert")
  .option("-c, --currencies <currencies>", "Comma-separated list of supported currencies (e.g. USD,IDR)")
  .option("-d, --default-currency <currency>", "Primary currency of the account (e.g. USD)")
  .option("--archived <archived>", "Archived state (true/false)")
  .action(async (cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      let name = cmdOpts.name;
      if (!name) {
        name = await promptText("Account Name");
        if (!name) {
          console.error("Error: Account name is required.");
          process.exit(1);
        }
      }

      const payload: Record<string, unknown> = {
        name,
      };

      if (cmdOpts.threshold !== undefined) {
        const threshold = parseInt(cmdOpts.threshold, 10);
        if (isNaN(threshold) || threshold <= 0) {
          console.error("Error: Threshold must be a positive integer.");
          process.exit(1);
        }
        payload.upcoming_threshold_days = threshold;
      }

      if (cmdOpts.currencies !== undefined) {
        payload.currencies = cmdOpts.currencies.split(",").map((c: string) => c.trim().toUpperCase());
      }

      if (cmdOpts.defaultCurrency !== undefined) {
        payload.default_currency = cmdOpts.defaultCurrency.trim().toUpperCase();
      }

      if (cmdOpts.archived !== undefined) {
        if (cmdOpts.archived === "true") {
          payload.archived = true;
        } else if (cmdOpts.archived === "false") {
          payload.archived = false;
        } else {
          console.error("Error: --archived must be 'true' or 'false'.");
          process.exit(1);
        }
      }

      const account = await createAccount(config.url, config.key, payload);

      if (opts.json) {
        console.log(JSON.stringify(account, null, 2));
      } else {
        console.log(`Account "${account.name}" created successfully!`);
        console.log(`ID:               ${account.id}`);
        console.log(`Default Currency: ${account.default_currency}`);
        console.log(`Currencies:       ${account.currencies.join(", ")}`);
        console.log(`Threshold:        ${account.upcoming_threshold_days} days`);
      }
    } catch (err) {
      handleError(err);
    }
  });

accountsCmd
  .command("show <accountId>")
  .description("Get details of a specific account")
  .action(async (accountId) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      const account = await getAccount(config.url, config.key, accountId);

      if (opts.json) {
        console.log(JSON.stringify(account, null, 2));
      } else {
        console.log(`Account:          ${account.name}`);
        console.log(`ID:               ${account.id}`);
        console.log(`Default Currency: ${account.default_currency}`);
        console.log(`Currencies:       ${account.currencies.join(", ")}`);
        console.log(`Threshold:        ${account.upcoming_threshold_days} days`);
        console.log(`Archived:         ${account.archived ? "Yes" : "No"}`);
        console.log(`Created At:       ${new Date(account.created_at * 1000).toISOString()}`);
        console.log(`Updated At:       ${new Date(account.updated_at * 1000).toISOString()}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

accountsCmd
  .command("update <accountId>")
  .description("Update details of an existing account")
  .option("-n, --name <name>", "New name of the account")
  .option("-t, --threshold <days>", "New threshold in days for upcoming bills alert")
  .option("-c, --currencies <currencies>", "New comma-separated list of supported currencies (e.g. USD,IDR)")
  .option("-d, --default-currency <currency>", "New primary currency of the account (e.g. USD)")
  .option("--archived <archived>", "Archived state (true/false)")
  .action(async (accountId, cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    const payload: Record<string, unknown> = {};

    if (cmdOpts.name !== undefined) {
      const name = cmdOpts.name.trim();
      if (!name) {
        console.error("Error: Account name cannot be empty.");
        process.exit(1);
      }
      payload.name = name;
    }

    if (cmdOpts.threshold !== undefined) {
      const threshold = parseInt(cmdOpts.threshold, 10);
      if (isNaN(threshold) || threshold <= 0) {
        console.error("Error: Threshold must be a positive integer.");
        process.exit(1);
      }
      payload.upcoming_threshold_days = threshold;
    }

    if (cmdOpts.currencies !== undefined) {
      payload.currencies = cmdOpts.currencies.split(",").map((c: string) => c.trim().toUpperCase());
    }

    if (cmdOpts.defaultCurrency !== undefined) {
      payload.default_currency = cmdOpts.defaultCurrency.trim().toUpperCase();
    }

    if (cmdOpts.archived !== undefined) {
      if (cmdOpts.archived === "true") {
        payload.archived = true;
      } else if (cmdOpts.archived === "false") {
        payload.archived = false;
      } else {
        console.error("Error: --archived must be 'true' or 'false'.");
        process.exit(1);
      }
    }

    if (Object.keys(payload).length === 0) {
      console.error("Error: Please provide at least one option to update (--name, --threshold, --currencies, --default-currency, --archived).");
      process.exit(1);
    }

    try {
      const account = await updateAccount(config.url, config.key, accountId, payload);

      if (opts.json) {
        console.log(JSON.stringify(account, null, 2));
      } else {
        console.log(`Account ${accountId} updated successfully!`);
        console.log(`Name:             ${account.name}`);
        console.log(`Default Currency: ${account.default_currency}`);
        console.log(`Currencies:       ${account.currencies.join(", ")}`);
        console.log(`Threshold:        ${account.upcoming_threshold_days} days`);
        console.log(`Archived:         ${account.archived ? "Yes" : "No"}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

accountsCmd
  .command("delete <accountId>")
  .description("Permanently delete an account")
  .option("-y, --yes", "Skip delete confirmation prompt")
  .action(async (accountId, cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      if (!cmdOpts.yes && !opts.json) {
        const confirm = await promptText(`Are you sure you want to delete account ${accountId}? (y/N)`, "n");
        if (confirm.toLowerCase() !== "y") {
          console.log("Deletion cancelled.");
          return;
        }
      }

      const res = await deleteAccount(config.url, config.key, accountId);

      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`Account ${accountId} successfully deleted.`);
      }
    } catch (err) {
      handleError(err);
    }
  });

accountsCmd
  .command("export <accountId>")
  .description("Export a full backup of the account (including bills and payments) to a JSON file")
  .option("-o, --output <path>", "File path to save the JSON backup")
  .action(async (accountId, cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      const payload = await exportAccount(config.url, config.key, accountId);

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else if (cmdOpts.output) {
        let dest = cmdOpts.output;
        if (dest.startsWith("~")) {
          dest = join(homedir(), dest.slice(1));
        } else if (!dest.startsWith("/") && !dest.startsWith(".")) {
          dest = join(process.cwd(), dest);
        }
        writeFileSync(dest, JSON.stringify(payload, null, 2), "utf-8");
        console.log(`Backup successfully exported to ${dest}`);
      } else {
        const safeName = payload.account.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
        const defaultFilename = `hornbill-backup-${safeName}-${payload.exported_at}.json`;
        const dest = join(process.cwd(), defaultFilename);
        writeFileSync(dest, JSON.stringify(payload, null, 2), "utf-8");
        console.log(`Backup successfully exported to ${dest}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

accountsCmd
  .command("import <filepath>")
  .description("Import a backup from a JSON file to recreate the account, bills, and payments")
  .option("--regenerate-ids", "Regenerate all UUIDs to resolve conflicts")
  .action(async (filepath, cmdOpts) => {
    const opts = program.opts();
    const config = resolveConfig(opts);

    try {
      let resolvedPath = filepath;
      if (resolvedPath.startsWith("~")) {
        resolvedPath = join(homedir(), resolvedPath.slice(1));
      } else if (!resolvedPath.startsWith("/") && !resolvedPath.startsWith(".")) {
        resolvedPath = join(process.cwd(), resolvedPath);
      }

      if (!existsSync(resolvedPath)) {
        console.error(`Error: File does not exist at ${resolvedPath}`);
        process.exit(1);
      }

      const raw = readFileSync(resolvedPath, "utf-8");
      const payload = JSON.parse(raw) as ExportPayload;

      if (!payload || typeof payload !== "object" || !payload.account || !Array.isArray(payload.bills) || !Array.isArray(payload.payments)) {
        console.error("Error: Invalid backup file format. Expected a JSON with 'account', 'bills', and 'payments' properties.");
        process.exit(1);
      }

      const regenerateIds = !!cmdOpts.regenerateIds;
      const account = await importAccount(config.url, config.key, payload, regenerateIds);

      if (opts.json) {
        console.log(JSON.stringify(account, null, 2));
      } else {
        console.log(`Account "${account.name}" imported successfully!`);
        console.log(`ID:               ${account.id}`);
        console.log(`Default Currency: ${account.default_currency}`);
        console.log(`Currencies:       ${account.currencies.join(", ")}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

// Command: skill

const skillCmd = program.command("skill").description("Manage agent skills");

skillCmd
  .command("install")
  .description("Install the Hornbill agent skill")
  .option("-s, --show", "Only print the skill markdown file to stdout")
  .option("--preset <preset>", "Skill location preset (gemini, claude)")
  .option("--scope <scope>", "Installation scope (global, project)")
  .option("--dir <dir>", "Custom skill installation directory")
  .action(async (cmdOpts) => {
    const opts = program.opts();

    if (cmdOpts.show) {
      console.log(getSkillContent());
      return;
    }

    try {
      const skillContent = getSkillContent();
      let scope = cmdOpts.scope;
      const preset = cmdOpts.preset;
      let dir = cmdOpts.dir;
      let targetPath = "";

      if (dir) {
        if (dir.startsWith("~")) {
          dir = join(homedir(), dir.slice(1));
        } else if (!dir.startsWith("/") && !dir.startsWith(".")) {
          dir = join(process.cwd(), dir);
        }
        targetPath = join(dir, "hornbill", "SKILL.md");
      } else {
        if (scope && scope !== "global" && scope !== "project") {
          console.error(`Invalid scope: ${scope}. Supported scopes: global, project`);
          process.exit(1);
        }

        if (preset && preset !== "gemini" && preset !== "claude" && preset !== "cursor" && preset !== "cline" && preset !== "agents") {
          console.error(`Invalid preset: ${preset}. Supported presets: gemini, claude, cursor, cline, agents`);
          process.exit(1);
        }

        // 1. Resolve directly if both preset and scope are supplied
        if (preset && scope) {
          if (preset === "gemini") {
            targetPath = scope === "global"
              ? join(homedir(), ".gemini", "skills", "hornbill", "SKILL.md")
              : join(process.cwd(), ".gemini", "skills", "hornbill", "SKILL.md");
          } else if (preset === "claude") {
            targetPath = scope === "global"
              ? join(homedir(), ".claude", "skills", "hornbill", "SKILL.md")
              : join(process.cwd(), ".claude", "skills", "hornbill", "SKILL.md");
          } else if (preset === "cursor") {
            targetPath = scope === "global"
              ? join(homedir(), ".cursor", "skills", "hornbill", "SKILL.md")
              : join(process.cwd(), ".cursor", "skills", "hornbill", "SKILL.md");
          } else if (preset === "cline") {
            targetPath = scope === "global"
              ? join(homedir(), ".cline", "skills", "hornbill", "SKILL.md")
              : join(process.cwd(), ".cline", "skills", "hornbill", "SKILL.md");
          } else if (preset === "agents") {
            targetPath = scope === "global"
              ? join(homedir(), ".agents", "skills", "hornbill", "SKILL.md")
              : join(process.cwd(), ".agents", "skills", "hornbill", "SKILL.md");
          }
        }

        // 2. Otherwise, prompt interactively
        if (!targetPath) {
          let selectedScopeOrCustom = scope;
          if (!scope && !preset) {
            const firstChoices = [
              { name: "Global", value: "global", desc: "Install globally in the home directory" },
              { name: "Project", value: "project", desc: "Install locally in the current project directory" },
              { name: "Custom", value: "custom", desc: "Enter a custom directory path manually" }
            ];
            selectedScopeOrCustom = await promptSelect("Select installation target:", firstChoices);
          }

          if (selectedScopeOrCustom === "custom") {
            console.log("\nCustom directory structure will be: <entered-directory>/hornbill/SKILL.md");
            const customDir = await promptText("Enter custom skill installation directory");
            if (!customDir) {
              console.error("Installation directory is required.");
              process.exit(1);
            }
            let cdir = customDir;
            if (cdir.startsWith("~")) {
              cdir = join(homedir(), cdir.slice(1));
            } else if (!cdir.startsWith("/") && !cdir.startsWith(".")) {
              cdir = join(process.cwd(), cdir);
            }
            targetPath = join(cdir, "hornbill", "SKILL.md");
          } else {
            scope = selectedScopeOrCustom as "global" | "project" || "global";

            if (preset) {
              if (preset === "gemini") {
                targetPath = scope === "global"
                  ? join(homedir(), ".gemini", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".gemini", "skills", "hornbill", "SKILL.md");
              } else if (preset === "claude") {
                targetPath = scope === "global"
                  ? join(homedir(), ".claude", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".claude", "skills", "hornbill", "SKILL.md");
              } else if (preset === "cursor") {
                targetPath = scope === "global"
                  ? join(homedir(), ".cursor", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".cursor", "skills", "hornbill", "SKILL.md");
              } else if (preset === "cline") {
                targetPath = scope === "global"
                  ? join(homedir(), ".cline", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".cline", "skills", "hornbill", "SKILL.md");
              } else if (preset === "agents") {
                targetPath = scope === "global"
                  ? join(homedir(), ".agents", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".agents", "skills", "hornbill", "SKILL.md");
              }
            } else {
              let choices;
              if (scope === "global") {
                choices = [
                  { name: "~/.agents/skills/hornbill", value: "agents", desc: "Universal / General Agents" },
                  { name: "~/.gemini/skills/hornbill", value: "gemini", desc: "Google Gemini / Antigravity" },
                  { name: "~/.claude/skills/hornbill", value: "claude", desc: "Claude Code" },
                  { name: "~/.cursor/skills/hornbill", value: "cursor", desc: "Cursor" },
                  { name: "~/.cline/skills/hornbill", value: "cline", desc: "Cline" }
                ];
              } else {
                choices = [
                  { name: "./.agents/skills/hornbill", value: "agents", desc: "Universal / General Agents" },
                  { name: "./.gemini/skills/hornbill", value: "gemini", desc: "Google Gemini / Antigravity" },
                  { name: "./.claude/skills/hornbill", value: "claude", desc: "Claude Code" },
                  { name: "./.cursor/skills/hornbill", value: "cursor", desc: "Cursor" },
                  { name: "./.cline/skills/hornbill", value: "cline", desc: "Cline" }
                ];
              }

              const selectedPreset = await promptSelect("Select target skill location preset:", choices);
              if (selectedPreset === "gemini") {
                targetPath = scope === "global"
                  ? join(homedir(), ".gemini", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".gemini", "skills", "hornbill", "SKILL.md");
              } else if (selectedPreset === "claude") {
                targetPath = scope === "global"
                  ? join(homedir(), ".claude", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".claude", "skills", "hornbill", "SKILL.md");
              } else if (selectedPreset === "cursor") {
                targetPath = scope === "global"
                  ? join(homedir(), ".cursor", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".cursor", "skills", "hornbill", "SKILL.md");
              } else if (selectedPreset === "cline") {
                targetPath = scope === "global"
                  ? join(homedir(), ".cline", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".cline", "skills", "hornbill", "SKILL.md");
              } else if (selectedPreset === "agents") {
                targetPath = scope === "global"
                  ? join(homedir(), ".agents", "skills", "hornbill", "SKILL.md")
                  : join(process.cwd(), ".agents", "skills", "hornbill", "SKILL.md");
              }
            }
          }
        }
      }

      const destDir = join(targetPath, "..");
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      writeFileSync(targetPath, skillContent, "utf-8");

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              status: "success",
              path: targetPath,
            },
            null,
            2
          )
        );
      } else {
        console.log(`Hornbill agent skill successfully installed to: ${targetPath}`);
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

program.parse(process.argv);
