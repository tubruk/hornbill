# 💿 Installation & Deployment Guide

This guide covers the deployment of Hornbill using Docker. Docker is the only supported deployment method.

---

## 🚀 1. Recommended: Docker Compose

The primary and recommended method to run Hornbill is using **Docker Compose**. 

Use the provided [docker-compose.yml](../../docker-compose.yml) in the repository:

```bash
# Start the container in the background
docker compose up -d
```

Open `http://localhost:3000` in your browser to access the Web UI.

---

## 🐳 2. Alternative: Docker Run

If you prefer to run a single container directly without compose, you can use `docker run`:

```bash
docker run -d \
  -p 3000:3000 -p 4000:4000 \
  -v ./data:/app/data \
  --name hornbill \
  ghcr.io/tubruk/hornbill:latest
```

### Explanation of flags:
- `-d`: Run the container in the background.
- `-p 3000:3000 -p 4000:4000`: Maps port `3000` (Web UI/API) and port `4000` (SQLite/Trailbase).
- `-v ./data:/app/data`: Mounts a directory on the host to persist data.
- `--name hornbill`: Names the running container.

---

## 🔒 3. Reverse Proxy & SSL Setup

> [!NOTE]
> Hornbill does not manage or provision SSL certificates directly. To run Hornbill securely over HTTPS, it is highly recommended to deploy it behind a reverse proxy. See the [Reverse Proxy & SSL Setup](reverse_proxy.md) guide for Caddy and Nginx configuration templates.
