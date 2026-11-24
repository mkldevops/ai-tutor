# Roadmap — Learning insights, known limits and content

Status: approved 2026-11-24. Owner chose the recommended option for D1–D6 (section 3).

## 1. Problem and target

**Problem.** The guided programme ships (M1–M4 of `guided-learning.md`), but we cannot see how children use it.
We do not know which items they fail, which wrong answers repeat, where a lesson is abandoned, how long an item
takes, or which step blocks them. The programme is also short (14 steps per year) and six known limits remain.

**Target — owner.** An Insights view, refreshed from live data, that answers "what should we improve next?":
per-objective accuracy, hints and time, the lesson funnel (where children stop), the most frequent wrong answers per
item template, stuck steps and review backlog. It ranks improvement candidates by rule, so the owner reads a list,
not raw tables.

**Target — parent.** The same signals for their own children only, folded into the existing programme report.

"Constantly" here is a product capability: the app records and aggregates on every lesson. No agent loop, cron
watch or scheduled job is part of this roadmap.

## 2. Gap analysis

### Already recorded

| Signal | Where | Limit |
| --- | --- | --- |
| Answer, correct, hints, item type, mode | `assessment_attempts` (`AttemptRecord`) | No item template key: prompts differ per draw, so the same exercise cannot be grouped |
| Time between answers | `createdAt` of consecutive attempts | Approximation only; includes reading the hint and chat |
| Lesson progress, phase, completion | `learning_sessions.state`, `phase`, `completedAt` | Abandon point derivable from open sessions, not from UI exits |
| Status changes and reasons | `mastery_events`, `student_competencies.reasons` | — |
| Chat usage | `audit_logs` `tutor.chat` / `tutor.chat_refused` (lengths, phase, duration) | No link to the item the child was stuck on |
| Self-rated confidence | `learning_sessions.confidence` | — |

### Missing

- Stable item template key (`templateKey`) on generated items and attempts.
- Measured response time (`responseMs`: item shown → answer submitted, client-measured, capped).
- UI events that leave no row today: lesson exit without finishing, audio replay, hint opened, chat opened.
- Aggregation service and an Insights page.

### Known limits carried from the guided-learning roadmap

1. Daily new-step cap uses the UTC day, not the family's day.
2. `deferredReviews` ignores the review cap.
3. Extras stay open while the programme is paused.
4. The extras report has no time window.
5. The review cap has no time decay (an old backlog weighs like a fresh one).
6. Preview deploys have no `PARENT_LOCK_SECRET`, so the parent area fails closed there.

### Content

Years 3 and 5 only, 14 steps each (7 English + 7 maths). A regular child finishes in a few weeks.

## 3. Decisions needed from the owner

**D1 — Who sees cross-family insights?**
1. **Owner only, behind the knowledge-admin gate (recommended).** Aggregates across families; parents keep a
   family-scoped view in the report. Reuses `requireKnowledgeAdmin` and the parent PIN.
2. Family-scoped only. Simpler, but the owner cannot see patterns across families.

**D2 — Where are new signals stored?**
1. **In our Appwrite database (recommended).** Optional `templateKey` and `responseMs` columns on attempts, plus a
   `learning_events` table (event name, session, objective, phase, small numeric detail, no free text). Retention
   400 days like audit logs; included in export and deletion; `PRIVACY.md` updated.
2. A third-party product analytics tool. Rejected by default: child data leaves our processors.

**D3 — Does a model read the data?**
1. **No, rule-based aggregates only (recommended for now).** Improvement candidates are ranked by thresholds
   (accuracy, hints, drop-off, repeated wrong answers).
2. A weekly model-written digest over aggregates. Wrong answers are child input (≤ 64 chars) and would go to the
   model provider; needs a `PRIVACY.md` processor update.

**D4 — Which day boundary for the daily cap?**
1. **Family timezone, captured from the browser on sign-in, default `Europe/London` (recommended).**
2. Fixed `Europe/London` for everyone.

**D5 — How much content?**
1. **Append 2 new units per year (one English, one maths, about 6 steps per year) after the current path,
   from a validated objective list (recommended).** Appending keeps existing positions; the list is approved before
   issues are created.
2. Full Year 3 and Year 5 programme of study in one go. Much larger, many new generators.

**D6 — Notifications, child accounts, co-parents?**
1. **Out of this roadmap (recommended).** They need their own design.
2. Include them now.

## 4. Phased roadmap

Schema rule: new columns are optional; the coordinator runs `appwrite-setup` on prod before merging any PR that
changes `scripts/appwrite-setup.ts` (every merge to main auto-deploys).

### M5 — Baseline from existing data (read-only)

- `scripts/usage-baseline.ts`, same style as `programme-placement.ts`: per objective accuracy, hints, median gap
  between answers, sessions started vs completed, phase where open sessions stopped, chat turns per session.
- Aggregates only in the output; no names, no answers.
- Acceptance: runs against prod read-only; unit test on the aggregation function with the memory store.

### M6 — Instrumentation (do early: it cannot be backfilled)

- 6.1 `templateKey` on every generated item (maths, English, GPS generators), stored on attempts.
- 6.2 `responseMs` measured client-side, sent with the answer, clamped (0–10 min), stored on attempts.
- 6.3 `learning_events` table and a `recordLearningEvent` server function: `lesson_exit`, `hint_opened`,
  `audio_replayed`, `chat_opened`; family check, rate limit, retention, export and deletion, `PRIVACY.md`.
- Acceptance: e2e lesson writes the key, a time and the events; deletion test removes them.

### M7 — Insights

- 7.1 `services/insights.ts`: aggregates per objective and per template (accuracy, hints, median `responseMs`,
  top 5 wrong answers, funnel by phase, stuck steps, review backlog), date window, family filter.
- 7.2 `/insights` page (owner, D1): tables, funnel, ranked "improvement candidates" with the rule that fired.
- 7.3 Parent report: per-child "where it is hard" block (slowest and least accurate templates, exits).
- Acceptance: fixtures produce known rankings; locked parent area hides the page; no cross-family leak test.

### M8 — Known limits

One issue each for limits 1–5 (section 2); limit 6 is a Coolify preview env change done by the coordinator.

### M9 — Content

- 9.1 Objective list for D5, reviewed by the owner (doc PR only).
- 9.2+ One issue per new unit: objectives, prerequisites, generators with `templateKey`, programme append, tests.
  Chained with dependencies: they edit the same curriculum files.
- Acceptance: placement script before/after shows no position change for existing learners.

## 5. Order

M5 and M6 first (in parallel), then M7 and M8 (in parallel), then M9. M9.1 can start any time.
