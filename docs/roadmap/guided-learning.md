# Roadmap — Guided learning programme

Status: approved 2026-11-21. Owner chose the recommended option for D1–D4 (section 3).

## 1. Problem and target experience

**Problem.** The app behaves like a free catalogue. On the Missions tab the child switches subject, starts any
objective, plays, and leaves. Nothing imposes an order, nothing says "this is today's work", and the parent cannot
tell where the child stands in a programme.

**Target — child.** One screen, one imposed mission: "Today with Nova". The app decides what comes next (review due,
lesson to resume, or next step of the programme), in a fixed pedagogical order, alternating English and maths units.
A visible path shows done / current / locked steps. Extra practice exists, but in a separate zone that never moves
the path.

**Target — parent.** A programme report: position (unit X of Y, step n of N), what is acquired, what must be
reworked, what comes next, and whether the child is keeping the pace. Controls: pause, skip with a reason, mark as
already known.

## 2. Gap analysis

### Reusable as is

| Asset | Where | Use |
| --- | --- | --- |
| Objectives, strands, provenance | `src/curriculum/england-nc-maths.ts`, `england-nc-english.ts` | Steps of the programme |
| Per-year ordered lists (7 maths + 7 English per year) | `LESSON_OBJECTIVES_BY_YEAR` in `england-nc.ts` | Seed of the sequence; in-year prerequisites already respect array order |
| Prerequisite edges | `PREREQUISITES`, `getPrerequisiteCodes` | Ordering constraint and lesson diagnostic |
| Lesson flow (diagnostic → instruction → guided → independent) | `src/learning-engine/lesson.ts` | A programme step is one lesson |
| Deterministic mastery | `src/learning-engine/mastery.ts` (`evaluateMastery`) | "Acquired" = `secure` / `mastered` |
| Spaced reviews | `scheduling.ts`, `revision_schedules`, `recomputeCompetency` in `services/learning.ts` | Review interleaving |
| Retention, regressions, overdue reviews | `learning-engine/longitudinal.ts`, `services/longitudinal.ts`, `outcomes.ts` | "To rework" and parent evidence |
| Family overview | `services/overview.ts`, `routes/_authed/dashboard.tsx` | Add programme position per learner |
| Parent override with reason and audit | `overrideCompetency` in `services/learning.ts` | "Already known" and skip |
| Next-mission heuristic | `nextMission()` in `routes/_authed/students.$studentId.index.tsx` | Right priority (resume > review > lesson) but client-side, per subject, advisory |
| Printable worksheets | `services/printables.ts`, `worksheets.ts` | Already an "extra" outside the course |
| Design system | `DESIGN.md` (one focus per screen, `OrbitMap`, `StatTile`, `RecallCard`) | Mission screen, path states, parent report |

### Missing

1. **No programme sequence.** `LESSON_OBJECTIVES_BY_YEAR` is maths then English concatenated; there is no unit
   concept (only `strand`), no cross-subject order, no alternation.
2. **No path state.** Nothing records pause, skip or pace; position is not computed anywhere.
3. **No server guard.** `startSession` (`services/learning.ts`) only checks the year group, and for a review that
   one is scheduled, not that it is due. The client chooses the objective; any lesson can be started by its code.
4. **Free-choice UI.** `students.$studentId.index.tsx` shows `SubjectSwitch` plus a "Start lesson" button on every
   objective card.
5. **No extras concept.** `SessionKind` is `lesson | review`; every attempt counts as mastery evidence, so free
   practice and the course are the same thing.
6. **No child/parent separation.** The actor is always the signed-in parent. The child sees the Progress tab,
   including the "Already known?" override, and Settings. A guard alone does not stop a child from skipping.
7. **Parent views are objective-centric.** `progress.tsx` and `outcomes.tsx` list objectives and retention, with no
   notion of position, next step or pace.
8. **E2E tests rely on free choice.** `e2e/lesson-flow.spec.ts`, `english-lesson.spec.ts`,
   `learning-outcomes.spec.ts`, `tutor-chat.spec.ts`, `voice-pilot.spec.ts` click `objective-<CODE>` → "Start lesson".

### Constraints found in the code

- Most prerequisite edges point to another year (Y2/Y3/Y4 codes) that `allowedObjectives` rejects. The guard must
  gate on in-sequence predecessors only; out-of-year prerequisites stay covered by the lesson diagnostic.
- `mastered` needs a review at least 7 days after `secure` (`reviewMinDelayDays`). Advancing on `mastered` would
  freeze the path for a week per step.

## 3. Decisions needed from the owner

**D1 — Who sets the pace?**
1. **Auto-advancing path, parent can pause/skip (recommended).** The app always knows the next step; no weekly
   parent work; matches "the app decides like a teacher".
2. Parent assigns weekly objectives. Maximum control, but the programme stalls when the parent forgets.
3. Auto path + daily quota per subject. Good later as an option on top of 1 (see M4), heavier to build first.

**D2 — When does the path advance, and what if the child is stuck?**
1. **Advance on `secure` (independent assessment passed); delayed reviews keep running in parallel. After 2 failed
   independent assessments on a step, flag it to the parent, keep re-teaching, parent may skip (recommended).**
2. Advance on `mastered` only. Stronger proof, but at least 7 days per step.
3. Advance on lesson completion. Keeps the flow, but "position" would no longer mean "acquired".

**D3 — What are extras and do they count?**
1. **Guided-only practice on steps already reached (current or earlier), plus worksheets. Recorded as guided
   evidence, which by policy never confers mastery, so extras cannot move the path (recommended).**
2. Extras on any objective of the year, never counted. More freedom; reopens the "pick anything" door.
3. No interactive extras, worksheets only.

**D4 — How is the parent area protected from the child?**
1. **Parent PIN on Progress, Outcomes, Worksheets, Settings and the dashboard; the child surface is mission, path
   and extras only (recommended).**
2. No gate, rely on supervision. Cheapest; the child can still mark steps "already known".
3. Separate child login. Cleanest, but a large auth change, out of proportion for one family.

**Decided (2026-11-21): D1 = 1, D2 = 1, D3 = 1, D4 = 1.** The roadmap below implements these. D1 option 2 would replace M4 stories 4.1–4.2 with an
assignment screen; D2 option 2 only changes one constant.

## 4. Phased roadmap

Order by value: M1 alone removes the "too free" problem; M2 gives the parent the feedback; M3 restores sanctioned
freedom; M4 adds control and pace. 18 stories.

### M1 — Imposed path (the app decides)

**1.1 `feat(curriculum): define programme sequence with units and subject alternation`** — M · depends on: none
- Goal: one ordered programme per year group.
- Scope: `src/curriculum/programme.ts` with `PROGRAMME_BY_YEAR`: units (id, title, subject, objective codes),
  alternating English/maths, 2–3 objectives per unit, built from the existing 14 objectives per year. Owner reviews
  the order.
- Acceptance: every lesson objective appears exactly once; subjects alternate between consecutive units; unit tests
  fail if an in-year prerequisite comes after its dependant or a code is unknown.

**1.2 `feat(learning-engine): derive programme position from competencies`** — M · depends on: 1.1, D2
- Goal: a pure function answering "where is this learner".
- Scope: `learning-engine/programme.ts`: `programmePosition(sequence, competencies, skips)` → per step
  `done | current | locked | skipped | to_rework`, current unit, counts, and a `stuck` flag (2 failed independent
  assessments on the current step). Advance rule from D2. Position is derived, not stored.
- Acceptance: unit tests for new learner, mid-unit, unit change (English → maths), `needs_review` on an earlier
  step, skipped step, stuck step, programme complete.

**1.3 `feat(learning-engine): compute today's mission on the server`** — M · depends on: 1.2
- Goal: one authoritative next action.
- Scope: move `nextMission` out of the route into the engine: priority open session → due review (capped, see 3.3)
  → rework step → current step. Expose `getMissionFn` in `server/functions.ts`.
- Acceptance: unit tests per priority; result is identical whatever subject was last used; returns "programme
  complete" with next review date when nothing is left.

**1.4 `feat(learning): enforce the programme in startSession`** — M · depends on: 1.3
- Goal: the server refuses anything off the path.
- Scope: `startSession` accepts only the mission returned by 1.3 for kinds `lesson` and `review`; error code
  `off_programme`; audit entry. Gate on in-sequence predecessors only. Open off-path sessions created before the
  change can be resumed until `LESSON_EXPIRY_DAYS` (14 days), not restarted. Until 4.2 ships, the existing
  "Already known?" override is the parent's way to move past a blocked step.
- Acceptance: service tests: locked objective rejected, current step accepted, review accepted only when due,
  cross-family access still 404 (`authorization.test.ts`), Y5 learner not blocked by Y3/Y4 prerequisites.

**1.5 `feat(missions): replace the objective catalogue with a single mission and a path view`** — L · depends on: 1.3, 1.4
- Goal: the child sees one thing to do and their progress through the programme.
- Scope: `students.$studentId.index.tsx`: remove `SubjectSwitch` and per-card start buttons; one "Today with Nova"
  panel with a single button; path view by unit (done / current / locked, non-clickable) reusing `OrbitMap`
  states, `LessonArt`, `StatusBadge`; "unit complete, next: Maths" transition; end of mission returns to the path.
  Follow `DESIGN.md` (one primary button per screen, mature tone); name the path "Course", since `FlightPlan`
  already means the steps inside a lesson.
- Acceptance: no control starts a locked step; after securing a step the next one becomes current without reload
  tricks; keyboard and screen-reader labels on path states.

**1.6 `chore(programme): place existing learners on the path`** — S · depends on: 1.2
- Goal: nobody loses progress or restarts.
- Scope: verify derived position on real data shapes: `secure`/`mastered`/parent overrides count as done wherever
  they sit; started-but-not-secure steps ahead of the position keep their evidence and become locked until
  reached; pending reviews stay scheduled. Read-only script printing each learner's computed position before
  release.
- Acceptance: fixture tests for "random order" histories; no write to `student_competencies` or
  `assessment_attempts`; script output reviewed by the owner.

**1.7 `test(e2e): cover the guided path and migrate free-choice specs`** — M · depends on: 1.4, 1.5
- Goal: tests describe the new behaviour.
- Scope: helper "start today's mission" in `e2e/lesson-helpers.ts`; rewrite the five specs listed in section 2;
  new spec: two missions in a row cross from one step to the next, a locked step cannot be started through the UI
  or a forged `startSessionFn` call.
- Acceptance: `vitest` and Playwright suites green; no test selects an arbitrary objective to start a lesson.

### M2 — Parent programme report

**2.1 `feat(progress): add programme report service`** — M · depends on: 1.2
- Goal: one payload for "where, acquired, to rework, next".
- Scope: `services/programme-report.ts` combining 1.2 with `learnerLongitudinal`: position (unit/step, percent),
  acquired steps with date, to-rework list (`needs_review`, regressions, stuck flag, overdue reviews), next three
  steps, last activity, missions in the last 7 days.
- Acceptance: unit tests on memory store; tenant isolation test; no percentage shown under the existing
  `MIN_RATE_SAMPLE`.

**2.2 `feat(progress): show the programme report as the parent's first view`** — M · depends on: 2.1
- Goal: a parent understands the situation in ten seconds.
- Scope: top of `students.$studentId.progress.tsx`: position sentence, timeline by unit, "Acquired", "To rework"
  (with reason from `MasteryDecision.reasons`), "Coming next". Existing objective cards and `outcomes.tsx` stay
  below as detail.
- Acceptance: each list links to the objective evidence; empty states for a new learner; e2e asserts position
  changes after a secured mission.

**2.3 `feat(dashboard): show programme position and attention flags per learner`** — S · depends on: 2.1
- Goal: family-level view.
- Scope: extend `LearnerOverview` (`services/overview.ts`) and `dashboard.tsx` with "Unit 3 of 6 · step 7 of 14",
  "needs attention" (stuck step, overdue reviews, inactive for 7 days).
- Acceptance: overview tests updated; flags have a text label, not colour only.

### M3 — Extras and reviews around the course

**3.1 `feat(learning): add an "extra" session kind that cannot move the path`** — M · depends on: 1.4, D3
- Goal: sanctioned free practice.
- Scope: `sessionKindSchema` gains `extra`; lesson state for extras is guided practice only (no diagnostic, no
  independent phase); allowed on reached steps only (D3); attempts stored with mode `guided`; excluded from
  mission priority and from the "missions this week" count; Appwrite enum updated in `store/appwrite-setup.ts`.
- Acceptance: tests prove an extra never changes a status to `secure`, cannot target a locked step, and is exported
  and deleted with the learner (`deletion.ts`, export, `retention.ts`).

**3.2 `feat(missions): add a separate "Extra practice" zone`** — M · depends on: 3.1, 1.5
- Goal: extras are visibly outside the course.
- Scope: secondary section or tab under the mission: reached steps grouped by unit, "Practise" button, link to
  worksheets; shown after the mission of the day, not before; distinct label and style from the path.
- Acceptance: zone hidden for a learner with no reached step; e2e: extra done, path position unchanged.

**3.3 `feat(learning-engine): interleave due reviews into the daily mission`** — M · depends on: 1.3
- Goal: retention checks happen without the child choosing them.
- Scope: mission queue rule: at most 2 due reviews before the new step, oldest first, alternate with the lesson
  when more are due; overdue reviews beyond the cap surface in the parent report.
- Acceptance: unit tests for 0, 1, 3 and 6 due reviews; a review backlog can never block new content for more than
  one mission.

**3.4 `feat(progress): report extras separately from the programme`** — S · depends on: 3.1, 2.1
- Goal: the parent sees effort outside the course without confusing it with progress.
- Scope: "Extra practice" line in the report: count, objectives practised, accuracy.
- Acceptance: extras never appear in "Acquired"; service test.

### M4 — Parent controls and pace

**4.1 `feat(programme): store per-learner programme settings`** — S · depends on: D1
- Goal: persist the little that is not derivable.
- Scope: `programme` JSON on `students` (paused, skipped steps with reason/date/user, pace target), Zod schema in
  `domain/types.ts`, column in `appwrite-setup.ts` and `JSON_COLUMNS`, memory store, export.
- Acceptance: defaults for existing learners without a data migration; included in export and deletion tests.

**4.2 `feat(programme): let parents pause, skip and mark steps as already known`** — M · depends on: 4.1, 1.2
- Goal: the parent stays in charge.
- Scope: controls on the report: pause/resume, skip the current or a stuck step with a mandatory reason, undo
  skip; "already known" reuses `overrideCompetency`; every action audited; paused state shown to the child.
- Acceptance: service and authorization tests; skipped steps show as "skipped", not "acquired"; undo restores
  the previous position.

**4.3 `feat(auth): gate the parent area with a PIN`** — M · depends on: D4. Can ship any time after M1
- Goal: the child cannot reach overrides, settings or reports.
- Scope: per-family PIN (hashed, server-side, rate-limited with the existing limiter); parent routes and parent
  server functions require an unlocked session flag; auto-lock after inactivity; child surface = mission, path,
  extras.
- Acceptance: parent functions return 403 when locked even if called directly; brute-force limited; reset via
  account password.

**4.4 `feat(programme): track weekly pace against a target`** — S · depends on: 4.1, 2.1
- Goal: tell the parent whether the child is on track.
- Scope: pace target (missions per week, default 4) in 4.1 settings; report and dashboard show "on track / behind"
  and a projected end date; optional daily cap of one new step.
- Acceptance: pure-function tests for the projection; no nagging copy on the child surface.

## 5. Risks and out of scope

**Risks**
- **Short programme.** 14 steps per year; a regular child finishes in a few weeks. The guided structure makes the
  content gap visible. Mitigation: 1.1 keeps the sequence data-driven so new objectives slot in.
- **Stuck child.** A hard step blocks everything behind it. Mitigation: stuck flag (D2), parent skip (4.2),
  re-teaching through the existing diagnostic and tutor chat.
- **Sequence legitimacy.** The National Curriculum sets content per year, not a teaching order; the sequence is the
  app's own scheme of work. Mitigation: owner review in 1.1, stated as such in the parent UI.
- **Guard without PIN.** Between M1 and 4.3 the child can still open the parent tabs and use "Already known?".
  Mitigation: ship 4.3 early if this is observed.
- **Review pile-up after a break.** Mitigation: cap in 3.3, backlog shown to the parent.
- **Regression on existing learners.** Mitigation: derived position, read-only check script (1.6), 14-day grace for
  open sessions.

**Out of scope**
- New objectives, year groups or subjects; changes to mastery thresholds or review intervals.
- Separate child accounts, co-parent invitations, notifications; rewards or streaks; AI-chosen ordering (the
  sequence stays deterministic and reviewable).
