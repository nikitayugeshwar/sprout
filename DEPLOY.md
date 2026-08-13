# Deploying Sprout

Sprout is two deployables plus a database:

```
  Next.js web  ──HTTPS──▶  Express API  ──▶  MongoDB
                                             Atlas free tier
```

Total cost on free tiers: nothing. **A working MongoDB is required first** — there is no way
around it, and the in-memory fallback is development-only.

## Where the API can run

The web app is a normal Next.js site and goes on Vercel or Netlify without ceremony. The API is
the part with a real choice, because Express is a long-running server and Vercel is not:

| | How it runs | Trade-off |
|---|---|---|
| **Vercel** (`api/vercel.json`) | `api/api/index.js` wraps the app as a serverless function | Same platform as the web app, no sleeping. Cold starts, and the Mongo connection must be cached — it is |
| **Render** (`render.yaml`) | `node api/src/index.js`, an ordinary server | Simplest mental model, nothing to reason about. Free instances sleep after ~15 min idle |

Both are committed and both work. Pick one, and skip the other section below.

Before deploying either, verify the serverless wiring still holds:

```bash
npm run check:vercel --workspace=api
```

That mounts the real handler behind a plain HTTP server — the same `handler(req, res)` contract
Vercel uses — and drives routing, the connection cache, auth and a full write path against a
throwaway MongoDB.

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

## 2a. API — Vercel (same platform as the web app)

Create a **second Vercel project** from the same repository — one project cannot serve two root
directories.

| Setting | Value |
|---|---|
| Root Directory | `api` |
| Framework Preset | Other |

`api/vercel.json` routes every path to the function. It uses `routes` rather than `rewrites`
deliberately: `routes` preserves the original `req.url`, which Express needs to match a route,
whereas `rewrites` would replace the path and 404 everything.

Environment variables:

| Variable | Value |
|---|---|
| `MONGODB_URI` | the Atlas string from step 1 |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CORS_ORIGIN` | your web origin, e.g. `https://sprout.vercel.app` |
| `NODE_ENV` | `production` |

Serverless notes that are already handled, but worth knowing:

- The Mongo connection is cached on `globalThis`, so a warm container reuses it. Without that,
  every invocation would open a new connection and a traffic spike would exhaust the Atlas
  connection limit.
- `USE_IN_MEMORY_DB` cannot work here — the fallback spawns a `mongod` binary, which a read-only
  serverless filesystem will not allow. The handler fails with that message rather than hanging.

Then verify:

```bash
node api/scripts/smoke.mjs https://sprout-api.vercel.app/api/v1
```

## 2b. API — Render (an ordinary long-running server)

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
