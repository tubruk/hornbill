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
| List Payments | `hornbill payments list` | List payments (defaults to unpaid) |
| Filter Payments | `hornbill payments list --status <all\|paid\|unpaid>` | Filter payments by payment status |
| Pay Bill/Payment | `hornbill payments pay <paymentId>` | Settle a specific payment cycle |
| Pay with Amount | `hornbill payments pay <paymentId> --amount <amount>` | Settle a payment overriding the amount |
| Pay with Date | `hornbill payments pay <paymentId> --date <date>` | Settle a payment with custom date (ISO or Epoch) |

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
