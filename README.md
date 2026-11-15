# AI Tutor

Private, family-first learning app for the National Curriculum in England (KS2).
Sprint 1 delivers a runnable foundation: parent accounts, learner profiles (Year 3 and Year 5),
verified Maths objectives with prerequisites and sources, one text lesson flow
(diagnostic → explanation → guided practice → independent assessment → delayed review),
saved attempts and deterministic mastery.

The product spec is in [CDC.md](./CDC.md).

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env     # defaults to the in-memory backend, no secrets needed
pnpm dev                 # http://localhost:3000
```

Create a family account, add a learner, open them and start a lesson.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` / `pnpm start` | Production build (Nitro) / run it |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit tests (mastery, lesson engine, authorization) |
| `pnpm test:e2e` | Playwright happy path (starts its own dev server on port 3100, memory backend) |
| `pnpm test:e2e:appwrite` | Same test against the Appwrite configured in `.env` |
| `pnpm appwrite:up` / `pnpm appwrite:down` | Start / stop the local self-hosted Appwrite (`down --volumes` wipes it) |
| `pnpm appwrite:bootstrap` | Create the local console admin, project and server key, write `.env`, run `appwrite:setup` |
| `pnpm check` | Biome lint + format check |
| `pnpm appwrite:setup` | Create/upgrade the Appwrite database, tables, indexes and seed the curriculum (idempotent) |

First Playwright run: `pnpm exec playwright install chromium`.

## Environment

All variables are server-only; nothing is exposed to the browser. See [.env.example](./.env.example).

| Variable | Default | Notes |
| --- | --- | --- |
| `DATA_BACKEND` | `memory` | `memory` (dev/tests, lost on restart) or `appwrite`. `memory` is refused in production unless `ALLOW_MEMORY_BACKEND_IN_PRODUCTION=true`. |
| `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY` | — | Required with `appwrite`. Server API key; never ship it to a client. |
| `APPWRITE_DATABASE_ID` | `ai_tutor` | |
| `AI_ENABLED` | `false` | Turns on the optional "Explain it another way" tutor. |
| `AI_MODEL` | `anthropic/claude-sonnet-5-5` | Mastra model-router id (`provider/model`). |
| `AI_API_KEY` | — | Required when `AI_ENABLED=true`. |
| `AI_DAILY_CALLS_PER_FAMILY` | `50` | Per-family daily cap on tutor calls. |
| `SESSION_COOKIE_SECURE` | prod only | Force the `Secure` cookie flag. |

### Local self-hosted Appwrite

`infra/appwrite/` runs Appwrite 2.7.1 (Postgres, Redis, geo, database and delete workers) as the Docker Compose
project `ai-tutor-appwrite` on `http://127.0.0.1:18480` (override with `AI_TUTOR_APPWRITE_PORT`).

```bash
pnpm appwrite:up          # generates infra/appwrite/appwrite.local secrets on first run
pnpm appwrite:bootstrap   # console admin, project ai-tutor-local, server key → .env (DATA_BACKEND=appwrite)
pnpm dev
```

Generated secrets stay in gitignored files with mode 600: `infra/appwrite/appwrite.local` (server secrets),
`infra/appwrite/console-admin.local` (console login for http://127.0.0.1:18480/console) and `.env`.

### Appwrite on Coolify

`infra/appwrite/coolify.compose.yaml` is the same stack for Coolify: no published ports, the domain is routed to the
API container, and Coolify generates every secret (`SERVICE_PASSWORD_*`). Console sign-up is limited to the first
account, which the bootstrap creates.

Live instance: Coolify `coolify.msadawaheri.fr`, project **AI Tutor**, service `appwrite-ai-tutor`,
https://appwrite.ai-tutor.msadawaheri.fr. `.mcp.json` exposes that Coolify through MCP with
`COOLIFY_MSADAWAHERI_TOKEN` from your shell.

```bash
APPWRITE_REMOTE_ENDPOINT=https://appwrite.ai-tutor.msadawaheri.fr/v1 infra/appwrite/bootstrap.sh coolify
```

This writes `.env.coolify.local` (server key, gitignored) and `infra/appwrite/console-admin.coolify.local`
(console login), then provisions the schema.

### Web app on Coolify

Coolify application `ai-tutor-web` (project **AI Tutor**) builds the repository `Dockerfile` through the `mkldevops`
GitHub app and serves https://ai-tutor.msadawaheri.fr. Runtime variables live in Coolify, not in the image:
`DATA_BACKEND=appwrite`, `APPWRITE_*` from `.env.coolify.local`, `AI_ENABLED=false`. It tracks
`feat/sprint-1-foundation` until that branch is merged; then switch it to `main`.

`E2E_BASE_URL=<url> pnpm exec playwright test` runs the e2e against any running instance (no local server).

### Appwrite setup (any instance)

1. Create an Appwrite project and a server API key (users, sessions, databases, tables, rows scopes).
2. Put the values in `.env` and set `DATA_BACKEND=appwrite`.
3. Run `pnpm appwrite:setup`. Tables are created with no client permissions; every read and write goes
   through server functions using the admin key after a family-scope check.

## Architecture

```
src/
  domain/            zod schemas and shared types (year groups, statuses, items)
  curriculum/        verified NC objectives, prerequisites, source provenance; seeded item generators
  learning-engine/   grading, mastery policy, review scheduling, lesson state machine (pure, unit-tested)
  server/
    store/           DataStore interface + memory and Appwrite (TablesDB) implementations
    auth/            AuthProvider: memory (scrypt) and Appwrite (Users + email/password sessions)
    services/        family/student CRUD, learning sessions, progress, overrides, export/delete
    functions.ts     TanStack Start server functions (the only API surface)
    session.ts       httpOnly session cookie, actor resolution, rate limits
  ai/tutor-agent.ts  Mastra agent with read-only, server-scoped tools (optional)
  routes/            UI: sign-in/up, dashboard, learner progress, lesson
scripts/appwrite-setup.ts
e2e/                 Playwright happy path
```

Key rules enforced in code:

- **Authorization on the server.** Every function resolves the signed-in parent's family and checks
  ownership of the learner/session. Another family's ids return `not found` (no enumeration).
- **Answers never reach the browser.** The client gets `PublicItem` (prompt, choices); grading happens server-side.
- **Mastery is deterministic** (`src/learning-engine/mastery.ts`). Guided answers alone cap at `developing`.
  `secure` needs an independent set (≥5 items, ≥80 %, ≥2 item types, no hints).
  `mastered` needs a later review (≥7 days after secure, ≥4 items, ≥80 %). A failed check gives `needs_review`.
  Parents can override with a mandatory reason; the computed status and an audit event are kept.
- **Curriculum is read-only data.** The AI agent can look objectives up but cannot change them; tool output
  and learner text are treated as untrusted data in the prompt.
- **Privacy.** Learners have a display name only (first name or nickname). Parents can export a learner's
  data as JSON or delete it with everything attached.

## Curriculum source

Objectives are quoted verbatim from the DfE *National curriculum in England: mathematics programmes of
study* (DFE-00180-2013, HTML updated 2021-09-28), Open Government Licence v3.0. Sprint 1 covers:

- Year 3 — add and subtract numbers mentally (ones, tens, hundreds); prerequisite Year 2 mental add/sub.
- Year 5 — multiply and divide by 10, 100 and 1,000; prerequisite Year 4 dividing by 10 and 100.

## Test status

- Unit: 39 tests (mastery policy, lesson engine, generators self-check, tenant isolation).
- E2E: one Playwright test — two learners (Y3, Y5) in one family complete lessons, both reach `secure`
  (not `mastered`), each sees only their year's objective, and a second family cannot open the first
  family's learner. It passes on both the memory backend and the local Appwrite 2.7.1.

## Known limitations

- **AI tutor is untested end-to-end** (no API key used during development). It is off by default and the
  lesson works without it.
- Rate limits are in-process memory; use a shared store before running several instances.
- Only Maths, two target objectives. No uploads, PDFs, voice, Qdrant/RAG or streaming chat yet (Sprints 2–4).
- No co-parent invitation flow yet (data model supports several members per family).
