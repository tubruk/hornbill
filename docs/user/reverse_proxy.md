# 🔒 Reverse Proxy & SSL Setup

To run Hornbill securely over HTTPS in a production environment, you should place it behind a reverse proxy. This guide provides minimal configurations for **Caddy** and **Nginx**.

Hornbill runs on port `3000` by default.

---

## 🦅 Caddy (Recommended)

[Caddy](https://caddyserver.com/) is the easiest way to secure Hornbill because it obtains and renews SSL certificates automatically.

Add the following to your `Caddyfile`:

```caddy
hornbill.yourdomain.com {
    reverse_proxy localhost:3000
}
```

---

## 🟢 Nginx

If you prefer using [Nginx](https://nginx.org/), you can use the following server block. You will need to obtain SSL certificates (e.g., using Let's Encrypt / Certbot) manually.

```nginx
server {
    listen 80;
    server_name hornbill.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name hornbill.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/hornbill.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hornbill.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
