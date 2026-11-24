# ReachInbox Email Scheduler

A production-grade email scheduler built for the ReachInbox assignment.
Accepts email send requests via API, persists them in PostgreSQL, schedules them
through **BullMQ delayed jobs** (backed by Redis), delivers via **Ethereal SMTP**,
and exposes a React/TypeScript dashboard with Google OAuth, Elasticsearch search,
and Slack notifications.

```
flowchart LR
  UI[React + Vite] -->|HTTP-only session| API[Express API]
  API --> PG[(PostgreSQL / Prisma)]
  API --> Redis[(Memurai / Redis)]
  API --> Q[BullMQ delayed queue]
  Q --> W[Worker processes]
  W -->|atomic sender cap + delay| Redis
  W --> SMTP[Ethereal SMTP]
  API --> ES[(Elasticsearch)]
  W --> ES
  API --> Google[Google OAuth]
  API --> Slack[Slack OAuth / Web API]
  API --> BB[Bull Board]
```

---

## Architecture highlights

| Concern | Implementation |
|---|---|
| **Queue** | BullMQ delayed jobs — no cron, no polling |
| **Persistence** | PostgreSQL via Prisma ORM |
| **Session store** | Redis (connect-redis) |
| **Search** | Elasticsearch 8.15 — indexed on schedule + state change |
| **Auth** | Google OAuth 2.0 via Passport.js |
| **Encryption** | AES-256-GCM for SMTP credentials and Slack tokens |
| **Security** | Helmet, express-rate-limit, HTTP-only SameSite cookies |
| **Frontend** | React 18 + Vite + Tailwind CSS, TypeScript throughout |

---

## Throughput, rate-limiting and concurrency

### Worker concurrency

Configured via `WORKER_CONCURRENCY` (default `5`). The BullMQ Worker is
instantiated with that value and multiple jobs run in parallel.  Each job
independently acquires its own atomic Redis reservation before touching SMTP,
so parallel workers cannot overcount.

### Minimum delay between sends

**Default: 2 000 ms (2 seconds).** Configurable via `EMAIL_SEND_DELAY_MS`
(minimum enforced at 2 000 ms even if set lower).

The minimum is enforced with a Redis sorted-set key
`sender:<id>:last-send`. The Lua script computes
`dispatchAt = max(now, lastSendTime + gap)` and writes it atomically.
If `dispatchAt > now`, the job re-queues itself with the exact delay so the
worker thread is never blocked.

### Per-sender hourly rate limit

Configured via `MAX_EMAILS_PER_HOUR_PER_SENDER` (default `100`).
Each sender row in the database also carries its own `hourlyLimit` column which
takes precedence when set.

**How it works — single Lua script, three Redis keys:**

```
sender:<id>:hour:<epoch_hour>   INCR counter, expires in 3 605 s
sender:<id>:last-send           last dispatch timestamp (ms)
sender:<id>:reservation:<emailId> idempotency guard per job
```

The script runs atomically inside Redis (`redis.eval`):

1. If `reservation:<emailId>` already exists, the job was already processed —
   return its previously-computed dispatch time (idempotent replay).
2. Increment the hourly counter.  If it now exceeds the limit, decrement and
   return `{0, nextWindowMs, currentCount}` — job is **not** processed.
3. Otherwise compute `dispatchAt = max(now, lastSend + gap)`, write both keys,
   store the reservation, return `{1, dispatchAt, count}`.

When the limit is reached the worker calls `emailQueue.add('send', data, { delay })`
to push the job to the **next hourly window** (`TTL × 1 000 + 500 ms`).
Jobs are **never dropped or permanently failed** by the rate limiter.

### Safety across multiple workers / instances

All counter operations go through the single Lua script executed on Redis.
Redis executes Lua atomically — no race conditions regardless of the number of
Node.js worker processes or machines.

### Behavior when 1 000+ emails are scheduled at the same time

1. `POST /api/emails/schedule` persists all rows in a single Prisma transaction
   (using `upsert` on `idempotencyKey` — duplicates are silently skipped).
2. Each row gets a BullMQ delayed job with `jobId = email.id`.  BullMQ uses a
   Redis sorted-set so 10 000 delayed jobs add in O(n log n) and are stored
   durably on disk (AOF).
3. When jobs become due they enter the active set.  The concurrency limit
   (`WORKER_CONCURRENCY`) caps parallel SMTP calls.
4. The Lua reservation enforces the per-sender hourly cap.  Jobs that exceed
   the cap are re-queued into the next hour window, preserving approximate
   arrival order.
5. No emails are dropped; they all eventually send across multiple hour windows.

### Slack notification on rate-limit hit

When `reservation[0] === 0` (cap reached) **and** the counter equals the
configured limit, the worker calls `slackAlert(userId, senderEmail, count)`:

- Fetches the user's `SlackIntegration` row (token stored AES-256-GCM
  encrypted).
- Uses a Redis key `slack-alert:<userId>:<sender>:<hourEpoch>` with `SET NX EX 3600`
  to guarantee exactly-one alert per sender per hour across all workers.
- Posts to `chat.postMessage` on the Slack Web API using the user's own token
  (direct message to themselves).
- If the user has not connected Slack the function returns silently — no crash.
- Connecting Slack later requires no redeploy; the next rate-limit hit picks up
  the newly stored integration row.

---

## Hard constraints compliance

| Requirement | Status |
|---|---|
| ❌ No cron jobs | ✅ BullMQ delayed jobs only — no `node-cron`, no `setInterval` scheduling |
| ✅ Persistence across restarts | ✅ Worker `ready` event reconciles `SCHEDULED` DB rows into BullMQ on startup |
| ❌ No duplicate sends | ✅ `idempotencyKey` unique constraint + `SCHEDULED→SENDING` conditional claim |
| ✅ Multiple senders | ✅ Each sender has its own SMTP config and hourly counter |

---

## Software prerequisites (Windows 10, no Docker)

| Software | Version | Link |
|---|---|---|
| Node.js | 20 LTS or later | https://nodejs.org/en/download/ |
| PostgreSQL | 16 | https://www.postgresql.org/download/windows/ |
| Memurai (Redis) | Developer Edition | https://www.memurai.com/get-memurai |
| Elasticsearch | 8.15.3 | https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.15.3-windows-x86_64.zip |

Docker is optional (`docker-compose.yml` included for postgres, redis and
elasticsearch).  Java is bundled inside the Elasticsearch ZIP.

---

## Windows local setup

```powershell
# 1. Clone / extract and enter the project root
Set-Location 'C:\path\to\emailscheduler--main'

# 2. Create .env from template (never overwrites an existing file)
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

# 3. Generate application secrets — paste results into .env
node -e "const c=require('crypto'); console.log('SESSION_SECRET='+c.randomBytes(48).toString('base64url')); console.log('ENCRYPTION_KEY='+c.randomBytes(32).toString('hex'))"

# 4. Start PostgreSQL, Redis, and Elasticsearch (Docker Desktop must be running)
docker compose up -d

# 5. Install all workspace dependencies
npm install

# 6. Generate Prisma client and apply migrations
npm run db:generate
npm run db:migrate

# 7. Start API, worker, and frontend together
npm run dev
```

The checked-in `.env.example` contains safe local-only PostgreSQL credentials for
the Compose setup. Replace `SESSION_SECRET` and `ENCRYPTION_KEY` with generated
values before starting. Add Google OAuth credentials to enable sign-in; Slack
credentials are optional. If you prefer installing services directly on
Windows, follow the PostgreSQL, Memurai, and Elasticsearch sections below.

### PostgreSQL

In pgAdmin or psql:

```sql
CREATE ROLE reachinbox_app LOGIN PASSWORD 'choose-a-local-password';
CREATE DATABASE reachinbox OWNER reachinbox_app;
```

Set `DATABASE_URL` in `.env`:

```dotenv
DATABASE_URL=postgresql://reachinbox_app:URL_ENCODED_PASSWORD@localhost:5432/reachinbox?schema=public
```

### Memurai / Redis

After installing Memurai, enable AOF persistence (PowerShell as Administrator):

```powershell
New-Item -ItemType Directory -Force 'C:\ProgramData\ReachInbox\redis-data' | Out-Null
icacls 'C:\ProgramData\ReachInbox\redis-data' /grant 'NT AUTHORITY\NETWORK SERVICE:(OI)(CI)M'
notepad 'C:\Program Files\Memurai\memurai.conf'
```

Add to `memurai.conf`:

```conf
bind 127.0.0.1
protected-mode yes
appendonly yes
appendfsync everysec
dir C:/ProgramData/ReachInbox/redis-data
```

Restart the service and verify:

```powershell
Get-Service '*memurai*' | Restart-Service
Test-NetConnection 127.0.0.1 -Port 6379
```

### Elasticsearch

Extract the ZIP to your user profile and configure `elasticsearch.yml`:

```yaml
discovery.type: single-node
xpack.security.enabled: false
network.host: 127.0.0.1
```

Start and verify:

```powershell
Set-Location 'C:\Users\prach\Documents\elasticsearch-8.15.3'
$env:ES_JAVA_OPTS='-Xms512m -Xmx512m'
.\bin\elasticsearch.bat
# In another shell:
Invoke-RestMethod http://127.0.0.1:9200
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values below.  **Never commit `.env`.**

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://reachinbox_app:PASSWORD@localhost:5432/reachinbox?schema=public

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

ELASTICSEARCH_URL=http://127.0.0.1:9200

# Google OAuth — from Google Cloud Console
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Sessions
SESSION_SECRET=          # 48+ random bytes, base64url

# Ethereal SMTP — from https://ethereal.email/
ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=
ETHEREAL_PASS=
ETHEREAL_TEST_RECIPIENT=

# Slack OAuth — from your Slack App settings
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback

# Credential encryption — 64 hex chars (32 bytes)
ENCRYPTION_KEY=

# Worker tuning
WORKER_CONCURRENCY=5
EMAIL_SEND_DELAY_MS=2000          # min 2 s between sends per sender
MAX_EMAILS_PER_HOUR_PER_SENDER=100

FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:4000
PORT=4000
```

---

## Google OAuth setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services → OAuth consent screen** — configure app name, support email.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
4. Authorized JavaScript origins: `http://localhost:5173`
5. Authorized redirect URIs: `http://localhost:4000/auth/google/callback`
6. Copy the client ID and secret into `.env`.

---

## Ethereal SMTP setup

1. Visit [https://ethereal.email/](https://ethereal.email/) and click **Create Account**.
2. Copy the SMTP credentials shown into `.env` (`ETHEREAL_USER`, `ETHEREAL_PASS`).
3. All sent emails appear in the Ethereal web inbox — nothing reaches real recipients.
4. Alternatively, add credentials through the **Senders** page in the app.

---

## Slack OAuth setup

1. Create a Slack app at [https://api.slack.com/apps](https://api.slack.com/apps).
2. Under **OAuth & Permissions → Redirect URLs** add `http://localhost:4000/api/slack/callback`.
3. Under **OAuth & Permissions → User Token Scopes** add `chat:write`.
4. Copy the client ID and secret into `.env`.
5. Click **Connect Slack** in the dashboard to authorize.

---

## Migrate and run

```powershell
npm run db:generate        # generate Prisma client
npm run db:migrate         # apply SQL migrations
npm run db:encrypt-smtp-secrets   # encrypt any legacy plain credentials

npm run dev                # starts API + worker + frontend concurrently
```

| URL | Purpose |
|---|---|
| http://localhost:5173 | React dashboard |
| http://localhost:4000/health | API liveness |
| http://localhost:4000/ready | Dependency readiness (redis/postgres/es) |
| http://localhost:4000/admin/queues | Bull Board (sign-in required) |

---

## Tests

```powershell
# Unit tests (no external services needed)
npm test

# Redis integration (Memurai must be running)
$env:RUN_REDIS_INTEGRATION='1'; npm test; Remove-Item Env:\RUN_REDIS_INTEGRATION

# PostgreSQL + Redis integration
$env:RUN_DB_INTEGRATION='1'; npm test; Remove-Item Env:\RUN_DB_INTEGRATION

# Elasticsearch integration
$env:RUN_ELASTICSEARCH_INTEGRATION='1'; npm test; Remove-Item Env:\RUN_ELASTICSEARCH_INTEGRATION

# Ethereal SMTP integration (requires ETHEREAL_* env vars)
$env:RUN_SMTP_INTEGRATION='1'; npm test; Remove-Item Env:\RUN_SMTP_INTEGRATION

# Production builds
npm run build
```

---

## API reference

All `/api/*` routes require the HTTP-only session cookie (set after Google OAuth login).

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/auth/google` | Redirect to Google OAuth |
| `GET` | `/auth/google/callback` | OAuth callback, sets session |
| `POST` | `/auth/logout` | Destroy session |
| `GET` | `/auth/me` | Current user profile |
| `POST` | `/api/emails/schedule` | Schedule a recipient batch |
| `GET` | `/api/emails/scheduled` | Paginated SCHEDULED/SENDING list |
| `GET` | `/api/emails/sent` | Paginated SENT/FAILED/CANCELLED list |
| `GET` | `/api/emails/search?q=` | Elasticsearch search with PG fallback |
| `GET` | `/api/emails/:id` | Email detail |
| `POST` | `/api/emails/:id/cancel` | Cancel a scheduled email |
| `GET` | `/api/senders` | List sender accounts |
| `POST` | `/api/senders` | Add sender account |
| `PUT` | `/api/senders/:id` | Update sender |
| `DELETE` | `/api/senders/:id` | Remove sender |
| `POST` | `/api/senders/:id/test` | Send SMTP test, returns Ethereal preview URL |
| `GET` | `/api/dashboard/stats` | Live counts (scheduled/sent/failed/pending/cancelled) |
| `GET` | `/api/slack/connect` | Start Slack OAuth flow |
| `GET` | `/api/slack/callback` | Slack OAuth callback |
| `GET` | `/api/slack/status` | Slack connection status |
| `POST` | `/api/slack/disconnect` | Remove Slack integration |
| `GET` | `/admin/queues` | Bull Board (authenticated) |
| `GET` | `/health` | Liveness probe |
| `GET` | `/ready` | Readiness probe (redis + postgres + elasticsearch) |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `SESSION_SECRET is required` | Set `SESSION_SECRET` in `.env` before starting the API |
| `ENCRYPTION_KEY must be 64 hex characters` | Generate with `node -e "require('crypto').randomBytes(32).toString('hex')"` |
| `Redis connection unavailable` | Start Memurai: `Get-Service '*memurai*' \| Start-Service` |
| `P1001: Can't reach database server` | Verify PostgreSQL is running and `DATABASE_URL` is correct |
| Google OAuth callback mismatch | Ensure `GOOGLE_CALLBACK_URL` exactly matches the URI in Google Cloud Console |
| Slack OAuth `invalid_state` | Session cookie must be set before starting OAuth; ensure `sameSite: lax` |
| Elasticsearch fails silently | Search falls back to PostgreSQL automatically; check `/ready` endpoint |
| Stale `SENDING` emails after crash | Worker startup marks them `FAILED` after 15 min; inspect Ethereal before retrying |
| `npm` scripts disabled in PowerShell | Run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` once |

---

## Security notes

- SMTP credentials and Slack tokens are stored **AES-256-GCM encrypted** in PostgreSQL.
- Sessions use **HTTP-only, SameSite=Lax** cookies backed by Redis.
- All data APIs are scoped to the authenticated user; no cross-tenant leakage.
- Helmet sets standard HTTP security headers on every response.
- API rate-limited to 120 requests/minute per IP.
- Keep `SESSION_SECRET` and `ENCRYPTION_KEY` stable and out of source control.
- Bull Board (`/admin/queues`) is gated behind the same session auth as the API.
- Local Elasticsearch has `xpack.security.enabled: false` only on loopback.

---

## Neon Cloud PostgreSQL

This project is configured to run with [Neon Serverless PostgreSQL](https://neon.tech):

1. Set your Neon connection string in `.env`:
   ```dotenv
   DATABASE_URL="postgresql://<user>:<password>@<neon-host>/neondb?sslmode=require&channel_binding=require"
   ```
2. Push your schema:
   ```powershell
   npx prisma db push --schema backend/prisma/schema.prisma
   ```
3. Test database connectivity:
   ```powershell
   Invoke-RestMethod http://localhost:4000/ready
   # Response includes: { ready: false, checks: { redis: ..., postgres: true, ... } }
   ```

---

## Submission guidelines & reviewer access

### GitHub repository access
1. Create a private GitHub repository for this monorepo.
2. Under **Settings → Collaborators → Add people**, invite:
   - `Mitrajit`
   - `Yadav036`

### 5-Minute Demo Video Walkthrough Script
To record the required demo video (max 5 minutes):

1. **Creating scheduled emails (1:00):**
   - Open [http://localhost:5173/](http://localhost:5173/).
   - Click **Compose New Email** / **New Campaign**.
   - Enter Subject, Body, and either enter manual recipient emails or upload a CSV/TXT leads file.
   - Set the scheduled time into the future, adjust the delay (default 2s) and hourly limit.
   - Click **Schedule** → confirm the success toast appears.
2. **Dashboard views (1:00):**
   - Navigate to the **Scheduled** tab → show the queued email with `SCHEDULED` badge.
   - Click the row to open the **Email Details Modal** showing metadata and idempotency key.
   - Show the **Overview** dashboard updating total and scheduled counts.
3. **Email delivery & Ethereal preview (1:00):**
   - Wait for the scheduled time or schedule one for immediate execution (+10s).
   - Once processed, navigate to the **Sent** tab.
   - Show the `SENT` status and click the **Ethereal Preview URL** button to open the delivered email in the Ethereal web inbox.
4. **Server restart persistence scenario (1:00):**
   - Schedule an email 5 minutes into the future.
   - Stop the backend server and worker (`Ctrl+C` in terminal).
   - Start them again (`npm run dev`).
   - Show that on boot, the worker reconciles `SCHEDULED` emails from PostgreSQL into BullMQ without duplication, and the future email sends at the correct scheduled timestamp.
5. **Rate limiting and Slack notification (1:00):**
   - Click **Connect Slack** in the dashboard to authorize Slack integration.
   - Demonstrate scheduling a batch that exceeds the sender's configured hourly limit.
   - Show the job deferred into the next hour window and the real Slack alert delivered.
