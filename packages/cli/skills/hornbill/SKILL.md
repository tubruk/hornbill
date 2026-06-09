---
name: hornbill
description: Manages bills and payments tracking. Use when user wants to view bills, check unpaid/paid payments, or pay bills.
---

# Hornbill CLI Skill

Manage and track bills and payments using the `hornbill` CLI client.

## Quick Reference

| Action | Command | Description |
|--------|---------|-------------|
| Check Status | `hornbill status` | Check connection and authentication status |
| Authenticate | `hornbill login` | Authenticate and generate a personal access token |
| List Config | `hornbill config list` | List all local configurations and paths |
| Set Config | `hornbill config set <key> <value>` | Set configuration (keys: `url`, `key`) |
| Get Config | `hornbill config get <key>` | Get configuration value |
| List Bills | `hornbill bills list` | List all tracked bills |
| Create Bill | `hornbill bills create --name <name> --amount <amount> --recurrence <recurrence>` | Create a new bill schedule with recurrence |
| List Payments | `hornbill payments list` | List payments (defaults to unpaid) |
| Filter Payments | `hornbill payments list --status <all\|paid\|unpaid>` | Filter payments by payment status |
| Pay Bill/Payment | `hornbill payments pay <paymentId>` | Settle a specific payment cycle |
| Pay with Amount | `hornbill payments pay <paymentId> --amount <amount>` | Settle a payment overriding the amount |
| Pay with Date | `hornbill payments pay <paymentId> --date <date>` | Settle a payment with custom date (ISO or Epoch) |
| Update Payment | `hornbill payments update <paymentId> [options]` | Update due date, amount, paid_at, or notes |
| Create Payment | `hornbill payments create --bill-id <billId> --amount <amount>` | Log an ad-hoc payment cycle for a bill |

---

## Configuration & Authentication

The CLI needs a server URL and an API key. You can authenticate interactively or set them manually.

### Check Status
Verify if the CLI is connected to the server and authenticated:
```bash
hornbill status
```

### Authentication
To authenticate and generate a personal access token automatically:
```bash
hornbill login --email <email> --password <password> --name <apiKeyName>
```
If flags are not provided, the command will prompt you for them.

### Manual Configuration
You can view and set configuration directly:
```bash
# View configuration
hornbill config list

# Set server URL
hornbill config set url http://localhost:3000

# Set API key manually
hornbill config set key your_personal_access_token
```

---

## Tracking Bills and Payments

### List Bills
To view all bills configured in the system:
```bash
hornbill bills list
```

### List Payments
To list payments:
```bash
# List all unpaid payments (default behavior)
hornbill payments list

# List all payments (both paid and unpaid)
hornbill payments list --status all

# List only paid payments
hornbill payments list --status paid

# Filter payments by a specific Bill ID
hornbill payments list --bill-id <billId>

# Limit the output size
hornbill payments list --limit 50
```

---

## Settling Payments

To mark an unpaid payment as settled:
```bash
hornbill payments pay <paymentId>
```

### Overrides
If you settled a payment with a different amount or on a different date:
```bash
# Pay a different amount (e.g. 15.99)
hornbill payments pay <paymentId> --amount 15.99

# Pay with a custom date (ISO date string or Unix timestamp)
hornbill payments pay <paymentId> --date "2026-06-09"
```

## JSON Output
Append `-j` or `--json` to any command to format the output as JSON.
```bash
hornbill bills list --json
```

---

## How-To: End-to-End Bill & Payment Management (Daily Operations)

For daily operations, manage your bills and payments using the Hornbill CLI.

### 1. Creating a New Bill & Setting Recurrence (CLI)
To track a new bill, use the `hornbill bills create` command. Specify the correct recurrence format so future payment cycles are generated automatically:

*   **Fixed Subscriptions (Monthly):** Due on the same calendar day every month.
    ```bash
    hornbill bills create --name "Netflix" --amount 15.49 --currency USD --start-date "2026-06-17" --recurrence "monthly:17"
    ```
*   **Annual Renewals (Yearly):** Due once a year on a specific day and month.
    ```bash
    hornbill bills create --name "Domain Renewal" --amount 12.00 --currency USD --start-date "2026-06-09" --recurrence "yearly:6-9"
    ```
*   **One-Time Invoices (One-time):** A single payment cycle that does not repeat. Pass `one-time` as the recurrence strategy:
    ```bash
    hornbill bills create --name "Dental Checkup" --amount 75.00 --currency USD --start-date "2026-06-09" --recurrence "one-time"
    ```
*   **Utility & Shifting Bills (Custom Intervals):** Repeats every **N** days, weeks, or months. Select the correct anchoring strategy (`due_date` or `paid_at`):
    *   `due_date` (From Due Date): For bills with strict deadlines (e.g. credit cards). Next cycle is relative to current due date.
    *   `paid_at` (From Paid Date): For service cycles that shift depending on when you pay (e.g. parking passes). Next cycle is relative to actual payment date.
    ```bash
    hornbill bills create --name "Water Bill" --amount 45.00 --currency USD --start-date "2026-06-09" --recurrence "interval:1-months-due_date"
    ```

### 2. Checking Unpaid Payments (CLI)
To check which bills are currently outstanding and unpaid:
```bash
hornbill payments list --status unpaid
```

### 3. Changing the Due Date of an Unpaid Payment (CLI)
To change the due date of a current unpaid payment cycle (for example, if the billing date was adjusted by the provider), update it using:
```bash
hornbill payments update <payment_uuid> --due-date "2026-06-25"
```

### 4. Marking a Payment as Paid with Overrides (CLI)
When a bill is paid, mark the payment cycle as settled:
```bash
hornbill payments pay <payment_uuid>
```
To override the default amount or the payment date (e.g., if you paid early/late or the amount varied):
```bash
# Settle with a custom amount
hornbill payments pay <payment_uuid> --amount 48.50

# Settle with a custom payment date (ISO date string)
hornbill payments pay <payment_uuid> --date "2026-06-08"

# Combine both overrides
hornbill payments pay <payment_uuid> --amount 48.50 --date "2026-06-08"
```

### 5. Making an Arbitrary/Ad-Hoc Payment (CLI)
To log a manual, arbitrary payment cycle for a bill that is not part of the standard recurrence schedule:
```bash
hornbill payments create --bill-id <bill_uuid> --amount 50.00 --due-date "2026-06-09" --paid-at "2026-06-09" --notes "Ad-hoc mid-cycle payment"
```

### Fallback for Undescribed Tasks
If you need to perform operations or use options not detailed in this guide:
1.  **CLI Help:** Append `-h` or `--help` to any CLI command (e.g., `hornbill payments list --help`, `hornbill config --help`).
2.  **API Help:** Access the interactive Scalar API documentation served by the Hornbill server at `/docs` (or inspect the raw OpenAPI spec at `/api/v1/openapi.json`).
