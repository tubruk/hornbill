# 🪶 Hornbill

![Hornbill Logo](.github/assets/hornbill_240.png)

[![CI](https://github.com/chickenzord/hornbill/actions/workflows/ci.yml/badge.svg)](https://github.com/chickenzord/hornbill/actions/workflows/ci.yml)
[![Docker Build](https://github.com/chickenzord/hornbill/actions/workflows/docker.yml/badge.svg)](https://github.com/chickenzord/hornbill/actions/workflows/docker.yml)
[![Docker Image](https://img.shields.io/badge/docker%20image-ghcr.io-blue?logo=docker&logoColor=white)](https://github.com/chickenzord/hornbill/pkgs/container/hornbill)
[![codecov](https://codecov.io/gh/chickenzord/hornbill/graph/badge.svg)](https://codecov.io/gh/chickenzord/hornbill)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Bun](https://img.shields.io/badge/Bun-%231A202C.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)


## 🧐 What is Hornbill?

[Hornbill](https://en.wikipedia.org/wiki/Hornbill) (known as **Rangkong** or **Enggang** in [Indonesia](https://id.wikipedia.org/wiki/Rangkong)) is a **self‑hosted personal bill tracker** you can run on a single Docker container. It helps you keep track of recurring bills, upcoming due dates, and payment history.

## 💡 Key Features

- **🔒 Your data stays with you** – stored in a local SQLite database (powered by [Trailbase](https://trailbase.io/)).
- **🐋 Docker-based setup** – simple to run via Docker or docker-compose.
- **💱 Multi-currency** – supports tracking bills in multiple currencies.
- **📅 Flexible recurrence** – configure monthly, yearly, or custom intervals.
- **🔔 Reminder notifications** – daily checks and alert notifications via Discord, Slack, Telegram, ntfy, Gotify, or generic Webhooks.
- **🔑 API Access & Personal Tokens** – manage Personal Access Tokens (API keys) and build integrations.
- **📂 Data Portability** – export and import your complete profile, bills, and payment records in JSON format at any time.
- **🖥️ Simple web UI** – clean, minimalist interface to manage bills and track payment history.
- **🛡️ Free and open source** – released under the AGPL‑v3.

## 📸 Screenshots

[<img alt="Hornbill Dashboard" src=".github/assets/ss_hornbill_dashboard.png" height="250px">](.github/assets/ss_hornbill_dashboard.png)
[<img alt="Hornbill Bills" src=".github/assets/ss_hornbill_bills.png" height="250px">](.github/assets/ss_hornbill_bills.png)

## 🚀 Quick Start (Docker)

To run the pre-built image from GitHub Container Registry (GHCR):

```bash
# Run the container (mounts a directory to persist data)
docker run -d \
  -p 3000:3000 -p 4000:4000 \
  -v ./data:/app/data \
  --name hornbill \
  ghcr.io/chickenzord/hornbill:latest
```

### Alternative: Run from Source (Docker Compose)

To build and run the image from the source code, you can use the provided [docker-compose.yml](docker-compose.yml) which builds from the local directory context:

```bash
# Build and run the container in the background
docker compose up -d
```

Open `http://localhost:3000` in your browser to start using Hornbill.

## ⚙️ Configuration (Environment Variables)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port for the web UI and API. | `3000` |
| `TRAILBASE_URL` | URL of the embedded SQLite server. | `http://localhost:4000` |
| `TRAILBASE_DATA_DIR` | Path to Trailbase data directory. | `./data/hornbill` |
| `REGISTRATION_ENABLED` | Show sign‑up page (`true`) or hide it (`false`). | `false` |
| `SYNC_INTERVAL_MINUTES` | How often the background job generates payments (minutes). | `1440` |
| `LOG_LEVEL` | Level of logging (`debug`, `info`, `warn`, `error`). | `info` |

## 🔁 Recurrence Models

When creating a bill you can select one of the following recurrence options:

- **One‑time** – a single invoice.
- **Monthly** – billed on a specific day each month (the date is clamped to the last valid day if the month is shorter).
- **Yearly** – billed on a specific month and day once a year (handles leap‑year dates gracefully).
- **Custom Interval** – repeat every **N** days, weeks, or months. You can choose the anchoring strategy:
- **From Due Date** – the next due date is calculated from the previous due date plus the interval.
- **From Paid Date** – the next due date is calculated from the actual payment date (`paid_at`) plus the interval, so the schedule shifts based on when you pay.

All recurrence settings are stored in the database, and the background daemon automatically creates the corresponding payment entries at the configured interval.

## 🎯 Goals & Non-Goals

### Planned / Goals
- **🔌 Webhook Dispatcher** – Send automated webhook payloads when bills are due or paid.
- **🤖 AI agent integration** – Integrations via CLI scripts and agent skills.
- **🔑 OAuth login** – Secure authentication options beyond simple password login.
- **👥 Account sharing** – Share accounts and bills with family members or other users.
- **💬 Telegram bot companion** – Interactive bot companion to check due dates and log payments.
- **☁️ SaaS offering** – A hosted version of the service.

### Non-Goals
- **Invoicing and Budgeting** – Not designed to generate professional client invoices or provide complex envelope-style budgeting tools.
- **Automatic Bank Syncing** – Keeping tracking manual to avoid the complexity, fragility, and security overhead of bank API integrations.
- **Double-Entry Bookkeeping** – Not a replacement for comprehensive personal ledger or accounting software.
- **Direct Payment Processing** – Processing actual monetary transactions (e.g., Stripe/PayPal integrations to transfer funds).
- **Native Mobile Apps** – A fully responsive web interface is prioritized over maintaining native iOS/Android apps.

## 🤝 Getting Help

- **Documentation** – see the `docs/` folder for a quick user guide.
- **API Reference** – interactive Scalar API documentation is served at `/docs` (or view raw spec at `/api/v1/openapi.json`).
- **Issues** – open a GitHub issue for bugs or feature requests.
- **Contributing** – feel free to submit pull requests; follow the guidelines in `CONTRIBUTING.md`.

## 🤖 Co-Development

This project is co-developed with **Gemini/Antigravity**, an agentic AI coding assistant. Features, test suites, and documentation are designed in collaborative pair-programming sessions.

## 📄 License

Hornbill is licensed under the **GNU Affero General Public License v3** – see the [LICENSE](LICENSE) file.


