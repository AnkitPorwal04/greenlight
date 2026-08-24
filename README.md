# Greenlight

**Approve leave requests in one click — right from the inbox you already live in.**

If you manage a team that runs on [greytHR](https://www.greythr.com/), you know the routine: someone applies for leave, greytHR emails you, and you write back "Approved — enjoy!" by hand. Again. And again.

Greenlight takes that little chore off your plate. It quietly reads those greytHR emails from your Gmail, lays them out as a tidy to-do list, and — the moment you hit **Approve** or **Reject** — writes and sends the reply for you: in the right thread, with the right people copied, signed with your signature. You stay in control (nothing goes out until you click), but the busywork disappears.

Built with Next.js 16, TypeScript, Tailwind CSS 4, the Gmail API, and Upstash Redis. It's yours to self-host, and it's live on Vercel in a few minutes.

---

## What it actually does

1. Someone on your team applies for leave, and greytHR sends you the usual email.
2. Greenlight spots it (`from:no-reply@greythr.com`), reads out the who / what / when / why, and drops it into your **Pending** list. Both ordinary leave and **Restricted Holiday** applications are understood.
3. You glance at it and click **Approve** or **Reject**. Before it sends, you can tweak the CC list or reword the message — or just send the sensible default. The reply goes from your own Gmail, threaded into the original conversation, CC'ing the managers who were already on it.
4. The decision is remembered against the email's permanent ID, so a handled request never nags you again — and it will **never send twice**, even if you double-click or your connection hiccups.

Dealt with something outside the app? Greenlight notices. If you already replied in the thread, or emailed that person after their request, it quietly files it under **Handled**.

### Everyone gets their own desk

Open the app, connect your Gmail, and you get a workspace that's entirely yours — your requests, your decisions, your sent mail. The employee directory is the one thing everyone shares. A common passcode guards the door, and your identity is tied to your Google account with a signed, HTTP-only cookie, so nobody can wear your badge.

---

## Get it running

### You'll need

- Node.js 20+
- A Google account that receives greytHR leave mail
- For production: a free [Vercel](https://vercel.com) account and a free [Upstash Redis](https://upstash.com) database

### 1. Set up Google (one-time, ~10 minutes)

The one slightly fiddly part — and you only do it once:

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. **APIs & Services → Library** → turn on the **Gmail API**
3. **Google Auth Platform** → set up the consent screen
   - Choose **Internal** if your org is on Google Workspace (simplest — no review, no scary warning screens)
   - Otherwise choose **External**, then **Publish** the app — don't leave it in Testing, or your login expires every 7 days
4. **Data Access** → add the scopes `gmail.readonly` and `gmail.send`
5. **Clients → Create client → Web application** → add these redirect URIs exactly (no trailing slash):
   - `http://localhost:3000/api/auth/callback`
   - `https://<your-deployment>.vercel.app/api/auth/callback`
6. Copy the Client ID and Client Secret — the secret is shown only once, so grab it now

### 2. Run it on your machine

```bash
git clone https://github.com/ArchanaShaji1311/greenlight.git
cd greenlight
npm install
npm run dev            # → http://localhost:3000
```

Create a `.env.local` in the project root with (at least) your Google credentials — the full list is under [Settings](#settings):

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Open the app, click **Connect Gmail**, and your requests roll in.

### 3. Put it on Vercel

1. Import the repo in Vercel (it auto-detects Next.js)
2. Add the environment variables from the table below
3. Add **Upstash for Redis** from the Vercel Marketplace and connect it — or spin one up at [console.upstash.com](https://console.upstash.com) and set the two `UPSTASH_*` values yourself
4. Deploy, then add your production callback URL back in the Google console (step 1.5)

### 4. Teach it your team

Greenlight ships with **no** employee data. Open **Directory** (it's in the profile menu, top-right) and paste your HR export — CSV, TSV, or JSON with `code`, `name`, `email` columns. A header row is detected for you:

```
Employee Code	Employee Name	Email
GRP1234	Jane Doe	jane.doe@example.com
```

Requests match to the directory by employee code, so every reply lands at the *verified* address — not a guess. Entries live in Redis; edit them anytime, no redeploy needed.

---

## Settings

| Variable | Needed? | What it's for |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes | Your OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Your OAuth 2.0 client secret |
| `APP_PASSCODE` | Production | The shared passcode that gates the app |
| `SESSION_SECRET` | Production | Signs identity cookies. At least 32 characters, and **not** the same value as `APP_PASSCODE` — generate one with `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | Production | Set by the Vercel + Upstash integration (`KV_REST_API_URL` works too) |
| `UPSTASH_REDIS_REST_TOKEN` | Production | Same idea (`KV_REST_API_TOKEN` works too) |
| `GOOGLE_REDIRECT_URI` | No | Override; defaults to `<request-origin>/api/auth/callback` |
| `LEAVE_MAIL_QUERY` | No | A custom Gmail search, if your HR tool isn't greytHR |

No Redis configured? Data falls back to local `.data/` files — fine for tinkering, but not for production (serverless disks don't stick around).

---

## Under the hood

```
app/
  page.tsx        The dashboard — date-grouped feed, search, stats
  login/          The passcode gate
  components/     Shell, request rows, modals (keyboard-friendly Modal + confirm), theming
  api/
    auth/         Google OAuth, passcode session, logout
    leaves/       Fetch + parse greytHR threads, auto-detect the ones you handled
    decide/       Compose and send the reply — atomic, with no duplicate sends
    mark/         Record things you handled elsewhere
    employees/    Read/update the directory
lib/
  parser.ts       greytHR mail → structured request (regular leave + Restricted Holiday)
  compose.ts      The reply template (shared client/server, so the preview matches)
  mailer.ts       RFC 2047 headers, threading, signature, the actual Gmail send
  session.ts      HMAC-signed per-user identity cookie
  storage.ts      Upstash Redis, with a local-file fallback
  employees.ts    The shared directory
proxy.ts          Passcode check on every route
```

**On security:** everything sits behind the passcode (`proxy.ts`). Your OAuth tokens are kept server-side, keyed to your Google account, and never touch the browser. The identity cookie is HMAC-signed so it can't be forged. And your employee data lives in your Redis — never in this repo.

---

## Your data stays yours

There's no personal data in this repository. Your directory, your tokens, and your decision history live only in your own Redis and your own Gmail. That's the whole point.

## License

[MIT](LICENSE)

---

*Made to give managers their afternoons back.* 🌱
