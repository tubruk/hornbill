# 🪶 Hornbill

![Hornbill Logo](.github/assets/hornbill_240.png)

## 🧐 What is Hornbill?

[Hornbill](https://en.wikipedia.org/wiki/Hornbill) (known as **Rangkong** or **Enggang** in [Indonesia](https://id.wikipedia.org/wiki/Rangkong)) is a **self‑hosted personal bill tracker** you can run on a single Docker container. It helps you keep track of recurring bills, upcoming due dates, and payment history.

## 💡 Why use it?

- **🔒 Your data stays with you** – stored in a local SQLite database (powered by [Trailbase](https://trailbase.io/)).
- **🐋 Docker-based setup** – simple to run via Docker or docker-compose.
- **💱 Multi-currency** – supports tracking bills in multiple currencies.
- **📅 Flexible recurrence** – configure monthly, yearly, or custom intervals.
- **🖥️ Simple web UI** – clean, minimalist interface to manage bills and track payment history.
- **🛡️ Free and open source** – released under the AGPL‑v3.

## 🎯 Goals & Non-Goals

### Planned / Goals
- **🔌 API-driven automation** – E.g., webhook receiver and sender.
- **🤖 AI agent integration** – Integrations via CLI scripts and agent skills.
- **🔑 OAuth login** – Secure authentication options beyond simple password login.
- **👥 Account sharing** – Share accounts and bills with family members or other users.
- **☁️ SaaS offering** – A hosted version of the service.

### Non-Goals
- **Invoicing and Budgeting** – Not designed to generate professional client invoices or provide complex envelope-style budgeting tools.
- **Automatic Bank Syncing** – Keeping tracking manual to avoid the complexity, fragility, and security overhead of bank API integrations.
- **Double-Entry Bookkeeping** – Not a replacement for comprehensive personal ledger or accounting software.
- **Direct Payment Processing** – Processing actual monetary transactions (e.g., Stripe/PayPal integrations to transfer funds).
- **Native Mobile Apps** – A fully responsive web interface is prioritized over maintaining native iOS/Android apps.

## 📸 Screenshots

[<img alt="Hornbill Dashboard" src=".github/assets/ss_hornbill_dashboard.png" height="250px">](.github/assets/ss_hornbill_dashboard.png)
[<img alt="Hornbill Bills" src=".github/assets/ss_hornbill_bills.png" height="250px">](.github/assets/ss_hornbill_bills.png)

## 🚀 Quick Start (Docker)

```bash
# Build the image
docker build -t hornbill:latest .

# Run the container (adjust env vars as needed)


docker run -d \
  -p 3000:3000 -p 4000:4000 \
  -e REGISTRATION_ENABLED=false \
  --name hornbill \
  hornbill:latest
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

## 🔁 Recurrence Models

When creating a bill you can select one of the following recurrence options:

- **One‑time** – a single invoice.
- **Monthly** – billed on a specific day each month (the date is clamped to the last valid day if the month is shorter).
- **Yearly** – billed on a specific month and day once a year (handles leap‑year dates gracefully).
- **Custom Interval** – repeat every **N** days, weeks, or months. You can choose the anchoring strategy:
  - **From Due Date** – the next due date is calculated from the previous due date plus the interval.
  - **From Paid Date** – the next due date is calculated from the actual payment date (`paid_at`) plus the interval, so the schedule shifts based on when you pay.

All recurrence settings are stored in the database, and the background daemon automatically creates the corresponding payment entries at the configured interval.

## 🤝 Getting Help

- **Documentation** – see the `docs/` folder for a quick user guide.
- **Issues** – open a GitHub issue for bugs or feature requests.
- **Contributing** – feel free to submit pull requests; follow the guidelines in `CONTRIBUTING.md`.

## 📄 License

Hornbill is licensed under the **GNU Affero General Public License v3** – see the [LICENSE](LICENSE) file.

---

[![CI Status](https://github.com/chickenzord/hornbill/actions/workflows/ci.yml/badge.svg)](https://github.com/chickenzord/hornbill/actions/workflows/ci.yml)
