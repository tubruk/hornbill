# Hornbill

![Hornbill Logo](.github/assets/hornbill_240.png)

## What is Hornbill?

Hornbill is a **self‑hosted personal billing tool** you can run on a single Docker container. It helps you track your own invoices, recurring payments, and simple budgeting without any third‑party service.

## Why use it?

- **Your data stays with you** – everything lives in a local SQLite file.
- **One‑click Docker setup** – just build and run.
- **Flexible recurrence** – choose monthly, yearly, or a custom interval (days, weeks, or months) with two anchoring options (from the previous due date or from the actual payment date).
- **Simple web UI** – clean interface to create accounts, bills, and view generated payments.
- **Free and open source** – released under the AGPL‑v3.

## Quick Start (Docker)

```bash
# Build the image
docker build -t hornbill:latest .

# Run the container (adjust env vars as needed)
# Example: generate a random JWT secret for security.

docker run -d \
  -p 3000:3000 -p 4000:4000 \
  -e REGISTRATION_ENABLED=false \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  --name hornbill \
  hornbill:latest
```

Open `http://localhost:3000` in your browser to start using Hornbill.

## Configuration (Environment Variables)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port for the web UI and API. | `3000` |
| `TRAILBASE_URL` | URL of the embedded SQLite server. | `http://localhost:4000` |
| `REGISTRATION_ENABLED` | Show sign‑up page (`true`) or hide it (`false`). | `false` |
| `SYNC_INTERVAL_MINUTES` | How often the background job generates payments (minutes). | `1440` |
| `JWT_SECRET` | Secret for signing authentication tokens – **must be set**. | *(none)* |
| `DATABASE_URL` | Path to the SQLite file. | `./data/hornbill.db` |

## Recurrence Models

When creating a bill you can select one of the following recurrence options:

- **One‑time** – a single invoice.
- **Monthly** – billed on a specific day each month (the date is clamped to the last valid day if the month is shorter).
- **Yearly** – billed on a specific month and day once a year (handles leap‑year dates gracefully).
- **Custom Interval** – repeat every **N** days, weeks, or months. You can choose the anchoring strategy:
  - **From Due Date** – the next due date is calculated from the previous due date plus the interval.
  - **From Paid Date** – the next due date is calculated from the actual payment date (`paid_at`) plus the interval, so the schedule shifts based on when you pay.

All recurrence settings are stored in the database, and the background daemon automatically creates the corresponding payment entries at the configured interval.

## Getting Help

- **Documentation** – see the `docs/` folder for a quick user guide.
- **Issues** – open a GitHub issue for bugs or feature requests.
- **Contributing** – feel free to submit pull requests; follow the guidelines in `CONTRIBUTING.md`.

## License

Hornbill is licensed under the **GNU Affero General Public License v3** – see the [LICENSE](LICENSE) file.

---

[![CI Status](https://github.com/chickenzord/hornbill/actions/workflows/ci.yml/badge.svg)](https://github.com/chickenzord/hornbill/actions/workflows/ci.yml)
