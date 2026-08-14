<div align="center">

# 🟢 Greenlight

**One-click leave approvals, straight from your inbox.**

Greenlight scans your Gmail for greythr leave-application mails, lays them out on a clean date-grouped dashboard, and lets you approve or reject each request with a single click — a warm, professional reply is composed and sent for you, with the right people CC'd.

Next.js 16 · TypeScript · Tailwind 4 · Gmail API · Upstash Redis · Vercel

</div>

---

## Why

Managers on greythr get a mail for every leave request, then hand-write an approval/rejection mail to the employee. That's slow, repetitive, and easy to drop. Greenlight turns the whole loop into one click.

## Features

- **Inbox radar** — detects greythr leave applications (`from:no-reply@greythr.com`); everything else is ignored
- **Date-grouped feed** — Today / Yesterday / older, newest first, with sticky headers, search, and KPI tiles
- **One-click decisions** — Approve or Reject opens a confirm dialog, then sends a warm professional mail from your own Gmail (employee in To, original managers in CC, optional personal note)
- **Employee directory** — 900+ employees bundled from HR data, matched by employee code, so mails go to the *exact* right address (✓ Verified badge); paste-in overrides supported without redeploys
- **Smart already-answered detection** — two detectors keep the pending list honest:
  1. you replied inside the Gmail thread → auto-marked handled
  2. you sent *any* mail to that employee after the request arrived → auto-marked handled
  plus manual **Mark handled** (single or bulk) for everything else — no mail is sent for these
- **Never re-asks** — every decision is stored against the Gmail message's permanent ID; handled requests can't resurface
- **Light & dark mode** — system-default with a toggle, no flash on load
- **Locked down** — passcode gate on every page and API route; OAuth tokens live only in your Redis store

## How tracking works

| State | Meaning |
| --- | --- |
| **Pending** | Matched leave mail with no decision recorded |
| **Approved / Rejected** | You clicked the button; reply mail was sent and logged |
| **Handled** | Answered outside Greenlight (auto-detected or manually marked); no mail sent |

> Note: the official greythr workflow approval still happens via the link in the original mail — Greenlight automates the human-communication side.

## Setup

### 1. Google (Gmail API) — ~10 min, one-time

1. [console.cloud.google.com](https://console.cloud.google.com) → New Project
2. **APIs & Services → Library** → enable **Gmail API**
3. **Google Auth Platform** → Get started → Audience: **Internal** if you have Workspace admin, else **External**
4. **Clients → Create client** → Web application → Authorized redirect URIs (⚠ no trailing slash):
   - `http://localhost:3000/api/auth/callback`
   - `https://YOUR-APP.vercel.app/api/auth/callback`
5. **Data Access** → add scopes `gmail.readonly` + `gmail.send`
6. External only: **Audience → Publish app** (staying in *Testing* expires tokens every 7 days)

### 2. Local

```bash
cp .env.example .env.local   # add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_PASSCODE
npm install
npm run dev                  # http://localhost:3000
```

### 3. Deploy (Vercel)

```bash
vercel link
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add APP_PASSCODE production
vercel --prod
```

Add **Upstash for Redis** from the Vercel Marketplace (free tier) and connect it to the project — `UPSTASH_REDIS_REST_URL/TOKEN` are injected automatically. Locally, data falls back to `.data/` files (gitignored).

## Environment variables

| Var | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client credentials |
| `APP_PASSCODE` | Dashboard passcode — required in production |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Injected by Vercel + Upstash (KV_* aliases also accepted) |
| `GOOGLE_REDIRECT_URI` | Optional override; derived from request origin by default |
| `LEAVE_MAIL_QUERY` | Optional custom Gmail search query for other HR tools |

## Architecture

```
app/
  page.tsx               dashboard (date-grouped feed, search, stats)
  login/                 passcode gate UI
  components/            Shell, RequestRow, modals, theme toggle, icons
  api/
    auth/                Google OAuth (login, callback, status) + passcode
    leaves/              fetch + parse greythr threads, auto-detection
    decide/              compose + send approval/rejection mail
    mark/                record handled without sending mail
    employees/           directory overrides
lib/
  parser.ts              greythr mail → structured request
  mailer.ts              warm-professional mail templates + Gmail send
  employees-data.ts      bundled HR directory (code → name, email)
  storage.ts             Upstash Redis with local file fallback
  google.ts              OAuth client + token persistence
proxy.ts                 passcode session enforcement on all routes
```

## Employee data

`lib/employees-data.ts` holds the HR export (TSV). To update it wholesale, replace that file and redeploy — or paste incremental changes into **Directory** in the app (stored as overrides in Redis, no redeploy needed).
