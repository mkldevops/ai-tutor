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
| `VISION_ENABLED` | `false` | Turns on worksheet photo checks (Sprint 3). Uses `AI_API_KEY`. **Untested on real children's handwriting.** |
| `VISION_MODEL` | `openrouter/deepseek/deepseek-v4.1-flash` | Vision model that only transcribes the page; the app grades the arithmetic. |
| `VISION_DAILY_CHECKS_PER_FAMILY` | `20` | Per-family daily cap on photo checks (cost cap). |
| `SESSION_COOKIE_SECURE` | prod only | Force the `Secure` cookie flag. |
| `KNOWLEDGE_INDEX` | `memory` | `memory` or `qdrant` vector index for approved knowledge. |
| `QDRANT_URL` / `QDRANT_API_KEY` | — | Required when `KNOWLEDGE_INDEX=qdrant`. Server-only. |
| `QDRANT_COLLECTION` | `ai_tutor_knowledge` | Collection prefix; the embedder id is appended. |
| `KNOWLEDGE_ADMIN_EMAILS` | empty | Comma-separated accounts allowed to check and approve sources. |
| `KNOWLEDGE_AUTO_CHECK` | `false` | Enable the daily scheduled update check. |

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

Live instance: Coolify `coolify.msadawaheri.fr`, project **AI Tutor**, service `appwrite`,
https://appwrite.ai-tutor.digital. `.mcp.json` exposes that Coolify through MCP with
`COOLIFY_MSADAWAHERI_TOKEN` from your shell.

```bash
APPWRITE_REMOTE_ENDPOINT=https://appwrite.ai-tutor.digital/v1 infra/appwrite/bootstrap.sh coolify
```

This writes `.env.coolify.local` (server key, gitignored) and `infra/appwrite/console-admin.coolify.local`
(console login), then provisions the schema.

### Web app on Coolify

Coolify application `ai-tutor-web` (project **AI Tutor**) builds the repository `Dockerfile` through the `mkldevops`
GitHub app and serves https://ai-tutor.digital (and `www`). Runtime variables live in Coolify, not in the image:
`DATA_BACKEND=appwrite`, `APPWRITE_*`, `AI_*`, `KNOWLEDGE_*` and `QDRANT_*`. It tracks `main`.
Qdrant runs as the internal Coolify service `qdrant` (no public domain), reached at `http://qdrant-<uuid>:6333`.

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
  knowledge/         source registry, GOV.UK fetch + parse, versioning/approval, embeddings, vector index, retrieval
  server/tasks/      Nitro scheduled task: daily knowledge update check (opt-in)
  ai/tutor-agent.ts  Mastra agent with read-only, server-scoped tools (optional)
  routes/            UI: sign-in/up, dashboard, learner progress, lesson, knowledge admin
scripts/appwrite-setup.ts
e2e/                 Playwright: lesson flow, knowledge admin access
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

## Knowledge pipeline (Sprint 2)

Approved curriculum guidance is retrieved by the tutor with citations. The official objectives in
`src/curriculum/` stay the source of truth; the vector index only stores approved passages.

- **Registry** (`src/knowledge/sources.ts`): each source records publisher, URLs, licence, redistribution
  rights and the date rights were checked. Ingestion refuses a licence not in the cleared list (today: OGL v3.0).
  Only `www.gov.uk` over https can be fetched (no redirects, 2 MB cap, 20 s timeout).
- **Ingestion**: the GOV.UK Content API document is parsed into chunks per year, strand and statutory vs
  non-statutory guidance, mapped to objective codes, and screened for prompt-injection text.
  Key stages 3–4 are excluded. Unchanged content (same checksum) creates no version.
- **Versioning and approval**: a change creates a new `staged` version with an added/removed diff.
  Nothing is indexed until an admin approves it with a note. Approval supersedes the previous version and
  removes its vectors; rejection keeps the previous version live. Flagged passages are never indexed.
  Every stage/approve/reject is audited.
- **Retrieval** (`retrieveApprovedKnowledge`): filtered by subject, year groups (the objective's year and its
  prerequisites) and embedder id, then re-checked against the store (approved resource, approved version,
  active source, no flags). Returns `insufficientEvidence` when nothing qualifies.
- **Admin**: `/knowledge`, visible only to emails in `KNOWLEDGE_ADMIN_EMAILS` (others get not found).
- **Periodic check**: Nitro task `knowledge:check` runs daily at 03:17 when `KNOWLEDGE_AUTO_CHECK=true`.
  It only stages versions; approval stays manual.

Index backends: `KNOWLEDGE_INDEX=memory` (default, rebuilt only on approval, so lost on restart) or
`qdrant` (`QDRANT_URL`, `QDRANT_API_KEY`). Local Qdrant: set `QDRANT_API_KEY` in `.env`, then `pnpm qdrant:up`
(`qdrant/qdrant:v1.20.0`, bound to 127.0.0.1:6333).

## Test status

- Unit: 61 tests (mastery policy, lesson engine, generators self-check, tenant isolation; knowledge parser on a
  real GOV.UK extract, ingestion/approval lifecycle, retrieval scoping and citations, Qdrant adapter against a
  fake HTTP server, fetcher guards).
- E2E (knowledge): non-admin parents cannot reach `/knowledge`; an allowlisted admin sees the registry.
  Passes on memory and local Appwrite.
- Opt-in integration (skipped by default):
  `QDRANT_TEST_URL=http://127.0.0.1:6333 QDRANT_TEST_API_KEY=… pnpm test` runs ingestion → approval →
  year-filtered search → superseding against a real Qdrant (passes on v1.20.0);
  `APPWRITE_IT=1 pnpm test` runs the lifecycle on the Appwrite tables from `.env` (passes on local 2.7.1).
- E2E: one Playwright test — two learners (Y3, Y5) in one family complete lessons, both reach `secure`
  (not `mastered`), each sees only their year's objective, and a second family cannot open the first
  family's learner. It passes on both the memory backend and the local Appwrite 2.7.1.

## Known limitations

- **AI tutor is untested end-to-end** (no API key used during development). It is off by default and the
  lesson works without it.
- Rate limits are in-process memory; use a shared store before running several instances.
- Only Maths, two target objectives. No uploads, PDFs, voice or streaming chat yet (Sprints 3–4).
- **Embeddings are lexical** (`hash-v1-512`, feature hashing). Retrieval matches words, not meaning.
  A semantic embedding model is a follow-up; vectors are tagged by embedder id so models never mix.
- Qdrant on Coolify is internal only; the production knowledge flow is not covered by automated tests.
- The live GOV.UK fetch is not exercised by automated tests (fixture used); run "Check for updates" once
  after deploy to confirm.
- Only the DfE programme of study is registered. Oak National Academy and other sources are not ingested
  until their terms, API access and redistribution rights are verified.
- No co-parent invitation flow yet (data model supports several members per family).
