# Greenlight

**One-click leave approvals, straight from your inbox.**

Greenlight is a self-hosted dashboard for managers who receive leave-application emails from [greytHR](https://www.greythr.com/) and reply to each one by hand. It scans your Gmail for leave requests, presents them in a clean date-grouped feed, and sends a professional approval or rejection reply — threaded into the original conversation, with the right people in CC — in a single click.

Built with Next.js 16, TypeScript, Tailwind CSS 4, the Gmail API, and Upstash Redis. Deploys to Vercel in minutes.

---

## How it works

1. greytHR emails you when someone applies for leave
2. Greenlight matches those mails (`from:no-reply@greythr.com`), parses out the employee, leave type, dates, and reason, and shows them as **Pending**
3. You click **Approve** or **Reject** → a reply is sent from your own Gmail to the employee (resolved via your employee directory), CC'ing the managers from the original mail, with your Gmail signature appended
4. Every decision is recorded against the mail's permanent ID — handled requests never resurface

Requests you answered outside Greenlight are detected automatically (reply in the same thread, or any sent mail to that employee after the request) and filed as **Handled**.

### Multi-user

Each manager who opens the app connects their own Gmail and gets a fully isolated workspace — own requests, own decisions, own sent mail. The employee directory is shared. Access is gated by a common passcode; identity is bound to the connected Google account via a signed HTTP-only cookie.

---

## Getting started

### Prerequisites

- Node.js 20+
- A Google account that receives greytHR leave mails
- (Production) A [Vercel](https://vercel.com) account and an [Upstash Redis](https://upstash.com) database (free tiers suffice)

### 1. Google Cloud setup (one-time, ~10 minutes)

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. **APIs & Services → Library** → enable **Gmail API**
3. **Google Auth Platform** → configure the consent screen
   - Audience **Internal** if your organisation uses Google Workspace (recommended: no verification, no warning screens)
   - Otherwise **External**, then **Audience → Publish app** — do *not* stay in Testing status, or refresh tokens expire every 7 days
4. **Data Access** → add scopes `gmail.readonly` and `gmail.send`
5. **Clients → Create client** → *Web application* → add redirect URIs (exact, no trailing slash):
   - `http://localhost:3000/api/auth/callback`
   - `https://<your-deployment>.vercel.app/api/auth/callback`
6. Note the Client ID and Client Secret (the secret is shown only once)

### 2. Run locally

```bash
git clone https://github.com/AnkitPorwal04/greenlight.git
cd greenlight
cp .env.example .env.local    # fill in the values below
npm install
npm run dev                   # http://localhost:3000
```

### 3. Deploy to Vercel

1. Import the repository in the Vercel dashboard (framework auto-detects)
2. Add the environment variables (table below)
3. Add **Upstash for Redis** from the Vercel Marketplace and connect it to the project — or create a database at [console.upstash.com](https://console.upstash.com) and set the two `UPSTASH_*` variables manually
4. Deploy, then add the production callback URL to your Google OAuth client (step 1.5)

### 4. Load your employee directory

The repository ships **without** employee data. In the app, open **Directory** and paste your HR export as CSV, TSV, or JSON — columns `code`, `name`, `email` (a header row is detected automatically):

```
Employee Code	Employee Name	Email
GRP1234	Jane Doe	jane.doe@example.com
```

Requests are matched to directory entries by employee code, so decision mails always go to the verified address. Entries are stored in Redis; update them anytime without redeploying.

---

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 client secret |
| `APP_PASSCODE` | Production | Shared passcode gating the app; also signs identity cookies |
| `UPSTASH_REDIS_REST_URL` | Production | Injected by the Vercel + Upstash integration (`KV_REST_API_URL` also accepted) |
| `UPSTASH_REDIS_REST_TOKEN` | Production | As above (`KV_REST_API_TOKEN` also accepted) |
| `GOOGLE_REDIRECT_URI` | No | Override; defaults to `<request-origin>/api/auth/callback` |
| `LEAVE_MAIL_QUERY` | No | Custom Gmail search query, for HR systems other than greytHR |

Without Redis configured, data falls back to local `.data/` files (development only — serverless filesystems are ephemeral).

---

## Architecture

```
app/
  page.tsx                Dashboard: date-grouped feed, search, stats
  login/                  Passcode gate
  components/             Navbar/footer shell, request rows, modals, theming
  api/
    auth/                 Google OAuth, passcode session, logout
    leaves/               Fetch + parse greytHR threads, auto-detection
    decide/               Compose and send the decision reply (threaded)
    mark/                 Record externally-handled requests
    employees/            Directory read/update
lib/
  parser.ts               greytHR mail → structured leave request
  compose.ts              Mail templates (shared server/client for live preview)
  mailer.ts               RFC 2047 headers, threading, signature, Gmail send
  session.ts              HMAC-signed per-user identity cookie
  storage.ts              Upstash Redis adapter with file fallback
  employees.ts            Shared directory (bundled baseline + Redis overrides)
proxy.ts                  Passcode enforcement on every route
```

**Security model:** all pages and APIs sit behind the passcode (`proxy.ts`); each user's OAuth tokens are stored server-side keyed by their Google account and never reach the browser; the identity cookie is HMAC-signed to prevent impersonation; employee data lives in your Redis instance, not in this repository.

---

## Privacy

This repository contains no personal data. Your employee directory, OAuth tokens, and decision history exist only in your own Redis database and Gmail account.

## License

[MIT](LICENSE)
