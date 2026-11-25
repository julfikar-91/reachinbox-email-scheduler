# ReachInbox Email Scheduler & Campaign Dashboard

A full-stack, production-grade **Email Scheduling & Delivery Engine** built with **TypeScript, Express.js, Prisma (PostgreSQL), Redis/BullMQ, Nodemailer (Ethereal SMTP), Elasticsearch, and React + Vite**.

It accepts single or bulk email scheduling requests, persists jobs durably in PostgreSQL, dispatches them via BullMQ delayed jobs (with an automatic in-process DB fallback), enforces per-sender hourly rate limits and inter-send spacing atomically with a Redis Lua script, sends live Slack alerts on rate-limit hits, indexes emails in Elasticsearch, and provides an enterprise-grade React dashboard with Dark/Light mode and a WYSIWYG rich-text editor.

---

## Key Features

- **Authentication & Account Management**
  - **Google OAuth 2.0** (`Passport.js`) with HTTP-only session cookies (`reachinbox.sid`).
  - **Email & Password Sign-Up / Login** (`POST /auth/register`, `POST /auth/login`) using `node:crypto` `scrypt` hashing + `timingSafeEqual` verification.
- **Enterprise Dashboard (`/overview`)**
  - Real-time 2s background polling with zero UI flicker.
  - KPI cards with SVG sparklines, live System Status strip, Queue Distribution **Donut Chart** & progress bar, and activity tabs (`All Activity`, `Scheduled`, `Sent History`).
  - **Dark / Light Mode** toggle persisted in `localStorage`.
- **WYSIWYG Rich-Text Compose & Bulk Scheduling**
  - Full rich-text editor (Bold, Italic, Underline, Strikethrough, Headings, Bullet/Numbered Lists, Blockquotes, Code Blocks, Undo/Redo) with active toolbar highlights.
  - Bulk recipient chip input + `.csv` / `.txt` file upload.
  - Configurable start time (`Send Later` presets or custom datetime), per-email delay spacing, and hourly limits.
- **Reliable Queue, Rate Limiting & Idempotency**
  - **BullMQ** delayed jobs backed by Redis + **in-process DB polling fallback** if Redis is offline.
  - **Atomic Redis Lua Script** enforcing per-sender hourly caps (`MAX_EMAILS_PER_HOUR_PER_SENDER`) and minimum inter-send delay (`EMAIL_SEND_DELAY_MS`, >= 2000ms). Exceeded jobs are automatically rescheduled to the next hourly window without dropping emails.
  - **SHA-256 Idempotency Keys** preventing duplicate job creation on retries.
- **Multi-Sender & Encrypted Secrets**
  - Manage multiple SMTP sender accounts with AES-256-GCM encrypted credentials (`ENCRYPTION_KEY`) and custom hourly limits.
- **Ethereal SMTP & Live Previews**
  - Dispatches real emails via `smtp.ethereal.email:587` and stores each message's live Ethereal Preview URL in PostgreSQL.
- **Elasticsearch Search & PostgreSQL Fallback**
  - Indexes emails on creation and status transitions (`SCHEDULED` -> `PROCESSING` -> `SENT` / `FAILED`), with transparent PostgreSQL `ILIKE` fallback if Elasticsearch is offline.
- **Slack Integration & Bull Board**
  - OAuth 2.0 Slack connection (`/api/slack/authorize`) with encrypted tokens and deduplicated hourly rate-limit alerts.
  - Protected **Bull Board** queue UI mounted at `/admin/queues`.

---

## Architecture

```mermaid
flowchart LR
  UI["React 18 + Vite + Tailwind"] -->|HTTP-only Session Cookie| API["Express.js + TypeScript API"]
  API --> PG[("PostgreSQL (Neon / Local) via Prisma")]
  API --> Redis[("Redis")]
  API --> Q["BullMQ Delayed Queue"]
  Q --> W["Worker Process (Concurrency 5)"]
  W -->|Atomic Lua Rate Limit + Delay| Redis
  W --> SMTP["Ethereal SMTP :587"]
  API -->|Fallback Poller| SMTP
  API --> ES[("Elasticsearch")]
  W --> ES
  API --> Google["Google OAuth 2.0"]
  W --> Slack["Slack Web API Alerts"]
  API --> BB["Bull Board (/admin/queues)"]
```

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite 6, Tailwind CSS, React Router v7, Axios, Lucide Icons |
| **Backend** | Node.js v20+, Express.js 5, TypeScript, Zod, Helmet, Express Rate Limit |
| **Database & ORM** | PostgreSQL (Neon Cloud or Local Docker) + Prisma ORM |
| **Queue & Cache** | BullMQ, ioredis, `connect-redis` |
| **Email Transport** | Nodemailer (`smtp.ethereal.email:587`) |
| **Search** | Elasticsearch 8.15 (with PostgreSQL `ILIKE` fallback) |
| **Security** | `node:crypto` `scrypt` password hashing, AES-256-GCM token/SMTP encryption |

---

## Project Structure

```text
emailscheduler--main/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma         # User, Sender, Email, SlackIntegration models
│   ├── src/
│   │   ├── server.ts             # Express API, Auth, Bull Board, Fallback Poller
│   │   ├── worker.ts             # BullMQ worker + rate limit & Slack alert handling
│   │   ├── delivery.ts           # Nodemailer SMTP dispatch & status transitions
│   │   ├── rate-limit.ts         # Atomic Redis Lua sliding-window rate limiter
│   │   ├── scheduling.ts         # SHA-256 idempotency key & delay helpers
│   │   ├── security.ts           # AES-256-GCM encryption/decryption helpers
│   │   ├── store.ts              # Prisma, Redis, BullMQ & Elasticsearch clients
│   │   └── config.ts             # Typed environment configuration
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Routing, Auth state, Login & Create Account UI
│   │   ├── api.ts                # Typed Axios API client
│   │   ├── types.ts              # Shared TypeScript interfaces
│   │   ├── style.css             # Dashboard, Sidebar, Editor & Dark Mode styles
│   │   └── components/
│   │       ├── Shell.tsx         # Persistent sidebar layout & user dropdown
│   │       ├── OverviewPage.tsx  # Hero, KPI sparklines, Donut chart & Activity feed
│   │       ├── Compose.tsx       # WYSIWYG rich-text editor & bulk scheduler
│   │       ├── ScheduledPage.tsx # Scheduled emails table & quick actions
│   │       ├── SentPage.tsx      # Sent & failed history with Ethereal preview links
│   │       ├── SenderPage.tsx    # Multi-sender SMTP management
│   │       ├── SlackPage.tsx     # Slack OAuth connection page
│   │       ├── QueuePage.tsx     # Queue health & Bull Board link
│   │       └── EmailDetailsModal.tsx
│   └── package.json
├── docker-compose.yml            # Local PostgreSQL, Redis, and Elasticsearch
├── .env.example                  # Sample environment variables
└── package.json                  # Monorepo workspace scripts
```

---

## Getting Started

### 1. Prerequisites
- **Node.js** `v20+` and **npm**
- **PostgreSQL** (Neon Cloud PostgreSQL or local via Docker)
- **Redis** & **Elasticsearch** *(optional for local dev; Docker Compose included, and the backend includes resilient fallbacks if offline)*

### 2. Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd emailscheduler--main
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` (and `backend/.env` if running backend scripts directly) and fill in your credentials:

```bash
cp .env.example .env
```

Key variables in `.env`:

```env
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:4000

# PostgreSQL (Neon or local)
DATABASE_URL=postgresql://user:password@localhost:5432/reachinbox?schema=public

# Redis & Elasticsearch
REDIS_HOST=localhost
REDIS_PORT=6379
ELASTICSEARCH_URL=http://127.0.0.1:9200

# Security Secrets (generate strong random strings)
SESSION_SECRET=your_session_secret
ENCRYPTION_KEY=your_32_byte_hex_or_secret

# Ethereal SMTP
ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=your_ethereal_user
ETHEREAL_PASS=your_ethereal_pass

# Google OAuth (optional if using email/password signup)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Slack OAuth (optional)
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback

# Worker & Rate Limiting
WORKER_CONCURRENCY=5
EMAIL_SEND_DELAY_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=100
```

### 4. Start Infrastructure (Optional via Docker)

If you want local PostgreSQL, Redis, and Elasticsearch containers:

```bash
docker compose up -d
```

### 5. Push Database Schema & Generate Prisma Client

```bash
npm --workspace backend exec -- prisma db push
npm run db:generate
```

### 6. Run the Application

From the **project root** (`emailscheduler--main`), run all services together:

```bash
npm run dev
```

Or run them in **separate terminals**:
- **Backend API (`http://localhost:4000`):** `npm run dev:api` *(or `cd backend && npm run dev`)*
- **Email Worker:** `npm run dev:worker` *(or `cd backend && npm run worker`)*
- **Frontend (`http://localhost:5173`):** `npm run dev:web` *(or `cd frontend && npm run dev`)*

---

## Available Scripts

| Command (from Root) | Description |
| :--- | :--- |
| `npm run dev` | Starts API, Worker, and Frontend concurrently |
| `npm run dev:api` | Starts Express backend (`tsx watch src/server.ts`) |
| `npm run dev:worker` | Starts BullMQ worker (`tsx watch src/worker.ts`) |
| `npm run dev:web` | Starts Vite frontend dev server |
| `npm run build` | Compiles TypeScript for both backend and frontend |
| `npm run test` | Runs backend test suite (`tsx --test test/*.test.ts`) |
| `npm run db:generate` | Generates Prisma Client |
| `npm run db:migrate` | Runs Prisma migrations |

---

## API Overview

| Group | Endpoints |
| :--- | :--- |
| **Auth** | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/google`, `GET /auth/google/callback` |
| **Emails** | `POST /api/emails/schedule`, `GET /api/emails`, `GET /api/emails/scheduled`, `GET /api/emails/sent`, `GET /api/emails/search`, `GET /api/emails/:id`, `POST /api/emails/:id/send-now`, `POST /api/emails/:id/cancel` |
| **Dashboard** | `GET /api/dashboard/stats` |
| **Senders** | `GET /api/senders`, `POST /api/senders`, `POST /api/senders/:id/test`, `DELETE /api/senders/:id` |
| **Slack** | `GET /api/slack/status`, `GET /api/slack/authorize`, `GET /api/slack/callback`, `POST /api/slack/disconnect` |
| **Queues** | `GET /admin/queues` (Bull Board UI, authenticated) |

---

## License

MIT
