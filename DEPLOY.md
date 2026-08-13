# Deploying Sprout

Sprout is two deployables plus a database:

```
  Next.js web  ──HTTPS──▶  Express API  ──▶  MongoDB
  Vercel/Netlify           Render/Railway     Atlas free tier
```

They are separate because they scale and fail differently — but if you would rather run one
box, `docker compose up` gives you the API and MongoDB together, and the web app can be served
from anywhere.

Total cost on free tiers: nothing.

---

## 1. Database — MongoDB Atlas

1. Create a free **M0** cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Database Access** → add a user, note the password.
3. **Network Access** → allow `0.0.0.0/0` (Render's egress IPs are not fixed on the free plan).
4. Copy the connection string; append the database name:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/sprout?retryWrites=true&w=majority
   ```

   Don't omit the `/sprout` path segment — without a database name the driver silently uses
   `test`.

5. Verify it before you deploy anything:

   ```bash
   node api/scripts/check-db.mjs "mongodb+srv://..."
   ```

   That checks DNS, connection, authentication and a write in turn, and tells you which step
   failed rather than making you decode a driver error.

---

## 2. API — Render

The repo ships a `render.yaml` blueprint, so **New → Blueprint** and pointing Render at the repo
does everything except the two secrets it cannot guess.

Set at deploy time:

| Variable | Value |
|---|---|
| `MONGODB_URI` | the Atlas string from step 1 |
| `CORS_ORIGIN` | your web origin, e.g. `https://sprout-health.vercel.app` |

`JWT_SECRET` is generated automatically. `NODE_ENV=production` is set in the blueprint, and the
API **refuses to boot** in production without a real `MONGODB_URI` and a non-default
`JWT_SECRET` — an ephemeral in-memory database in production is a data-loss bug waiting to
happen, so it fails loudly rather than quietly.

Health check path is `/api/v1/health`. Once live:

```bash
node api/scripts/smoke.mjs https://sprout-api.onrender.com/api/v1
```

46 checks against the real deployment. If that passes, the deployment genuinely works.

> **Free-tier note:** Render spins instances down after ~15 minutes idle, so the first request
> after a quiet spell takes ~30 s. The web client detects the network failure and says the API
> may be waking up rather than showing a raw error.

### Or: Railway / Fly / anything that runs a container

`api/Dockerfile` is a multi-stage production build (non-root user, `--omit=dev`, health check).

```bash
docker build -f api/Dockerfile -t sprout-api .
docker run -p 4000:4000 -e MONGODB_URI=... -e JWT_SECRET=... sprout-api
```

---

## 3. Web — Vercel or Netlify

Both need the project root set to `web/`.

**Vercel** — Import the repo, set **Root Directory** to `web`, then add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://sprout-api.onrender.com/api/v1` |

**Netlify** — `web/netlify.toml` is already configured; set **Base directory** to `web` and add
the same variable.

⚠️ `NEXT_PUBLIC_*` variables are inlined at **build** time. Changing the API URL later needs a
redeploy, not just a restart.

---

## 4. Wire the two together

Go back and set the API's `CORS_ORIGIN` to the exact web origin — scheme and host, no trailing
slash. The API allowlists origins rather than reflecting them, so a mismatch shows up as a CORS
failure in the browser console.

Then open the site and click **Explore the live demo**. If you get a dashboard with two children
and a populated growth chart, everything is connected.

Optionally seed a stable login for people who prefer credentials:

```bash
MONGODB_URI="mongodb+srv://..." npm run seed
# → demo@sprout.health / sproutdemo
```

---

## Environment reference

### API (`api/.env`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MONGODB_URI` | in production | in-memory | Boot fails in production without it |
| `JWT_SECRET` | in production | dev default | Boot fails in production if left as the default |
| `CORS_ORIGIN` | yes | `http://localhost:3000` | Comma-separated; `*` allows any |
| `PORT` | no | `4000` | |
| `NODE_ENV` | no | `development` | |
| `JWT_EXPIRES_IN` | no | `7d` | |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | no | `demo@sprout.health` / `sproutdemo` | Used by `npm run seed` |
| `LOG_LEVEL` | no | `info` | |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Web (`web/.env`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Include the `/api/v1` suffix. Baked in at build time. |

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Could not reach the Sprout API" | Free instance asleep (wait ~30 s), or `NEXT_PUBLIC_API_URL` is wrong |
| CORS error in console | `CORS_ORIGIN` does not exactly match the web origin |
| API exits immediately on boot | Missing `MONGODB_URI` or default `JWT_SECRET` in production — check the logs, it says which |
| Charts empty, everything else fine | `npm run who:build` was never run and `api/src/data/who/*.json` is missing |
| Atlas connection times out | Network Access allowlist does not include `0.0.0.0/0` |
| `querySrv ENOTFOUND` on boot | The cluster hostname does not exist — deleted, still provisioning, or mistyped. Run `node api/scripts/check-db.mjs` for a step-by-step diagnosis |
| Data lands in a `test` database | The connection string has no `/sprout` path segment |
