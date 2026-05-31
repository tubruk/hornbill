# hornbill

![Hornbill Logo](.github/assets/hornbill_240.png)

## Self‑Hosted Docker Setup

Hornbill can be run locally using Docker. The provided `Dockerfile` builds a multi‑stage image that:

- Compiles the Bun‑based web frontend.
- Bundles the Hono API server with the Trailbase binary.
- Sets necessary environment variables:
  - `PORT` – API server port (default `3000`).
  - `TRAILBASE_URL` – URL to the Trailbase DB (default `http://localhost:4000`).
  - `REGISTRATION_ENABLED` – controls whether the registration tab is shown on the login screen (`true` by default).
- Includes a health‑check that pings `/api/v1/ping`.

### Building the Image
```bash
# From the project root
docker build -t hornbill:latest .
```

### Running the Container
```bash
docker run -d \
  -p 3000:3000 -p 4000:4000 \
  -e REGISTRATION_ENABLED=true \
  --name hornbill hornbill:latest
```

Adjust `REGISTRATION_ENABLED` to `false` if you wish to hide the registration UI.

### Stopping the Container
```bash
docker stop hornbill && docker rm hornbill
```

For more details on environment configuration, see the project's `.env.example` file.
