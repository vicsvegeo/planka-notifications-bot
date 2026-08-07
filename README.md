# planka-notifications-bot

A small Discord bot service that delivers [planka-gamification](https://github.com/vicsvegeo/planka-gamification)'s project nudges and due-date card reminders as Discord DMs, and handles the snooze buttons attached to those messages.

It's a standalone Node/TypeScript service, deployed separately from the Planka server, that talks to the same Postgres database.

## How it fits together

```
Planka backend (scan.js / nudges helper)
        │  POST /dm  (X-Bot-Secret header)
        ▼
planka-notifications-bot ──▶ Discord Gateway (DM the user)
        │
        ▼
  Postgres (shared with Planka) — reads discord_user_id, writes project_snooze
```

- The Planka backend decides *when* a reminder or nudge is due (see `server/api/helpers/card-reminders/scan.js` and the project-nudges helper in the main repo) and calls this bot's internal HTTP API to actually deliver it.
- This bot never decides scheduling — it's a thin delivery + interaction layer over Discord.
- Project nudge DMs include snooze buttons (3 days / 1 week / 2 weeks / 1 month); due-date reminder DMs don't, since there's nothing to snooze them against.

## Features

- **`POST /dm`** — internal HTTP endpoint the Planka backend calls to DM a Discord user a native embed (title, body, optional fields/color/link). Authenticated via a shared-secret `X-Bot-Secret` header.
- **Snooze buttons** — clicking a snooze button on a project nudge DM writes/updates a `project_snooze` row (keyed by `project_id` + `user_id`, resolved from the clicking Discord user via `user_account.discord_user_id`) so the backend stops nudging that project for the chosen duration.
- **Resilient Gateway connection** — retries the initial Discord login with exponential backoff (5s up to 5min) on transient failures, and logs shard disconnects/reconnects/errors.
- **Graceful failure handling on `/dm`** — distinguishes "user can't be DMed" (blocked bot, closed DMs, unknown user, etc. — Discord codes `10013`, `50007`, `50001`, `10004`) from actual send failures, so the caller gets a meaningful status.

## Setup

### Prerequisites

- Node.js >= 20
- A Discord bot application (Developer Portal) with a bot token, invited to your server with permission to DM members
- Access to the same Postgres database as your Planka instance

### Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Bot token from the Discord Developer Portal (Bot page → Reset Token). |
| `DATABASE_URL` | Postgres connection string for the same database Planka uses (`postgres://user:password@host:port/database`). |
| `PORT` | Port for the internal HTTP server. Optional, defaults to `4000`. |
| `BOT_SERVICE_SECRET` | Shared secret the Planka backend must send as `X-Bot-Secret` when calling `POST /dm`. Requests without a match get `401`. Generate one with `openssl rand -hex 32`. |

The Planka backend needs the matching `BOT_SERVICE_SECRET` (and this bot's URL) configured on its side to actually call `POST /dm`.

### Local development

```bash
npm install
npm run dev        # tsx watch — restarts on change
```

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run build        # compiles src/ -> dist/
npm start             # runs the compiled dist/index.js
```

## Deployment

### Docker

The included multi-stage `Dockerfile` builds and runs the compiled bot; the container exposes port `4000` (the `/dm` HTTP server) and expects the four environment variables above.

```bash
docker build -t planka-notifications-bot .
docker run -p 4000:4000 --env-file .env planka-notifications-bot
```

### docker-compose

`docker-compose.snippet.yml` has a service block to paste into your existing `docker-compose.yml` alongside Planka. Update the `image:` reference to match your GHCR org/user once you've pushed an image.

### CI

`.github/workflows/docker-publish.yml` builds and pushes the image to `ghcr.io/<repo>` on every push to `main`, tagged `latest` and with a short commit SHA.

## Project layout

```
src/
  index.ts         entrypoint — env checks, DB connectivity check, wires bot + HTTP server
  bot.ts           Discord client creation, Gateway connection/reconnect logging
  server.ts        Express app: POST /dm, embed + snooze-button construction
  interactions.ts  snooze button click handling -> project_snooze upsert
```
