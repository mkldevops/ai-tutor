# Privacy and data handling

This page describes what the code stores and sends today. It is an engineering record, not a privacy notice
or legal advice. Lawful bases are placeholders for the data controller to decide.

Source of truth: `src/server/store/types.ts`, `scripts/appwrite-setup.ts`, `src/server/services/`.

## Who is in the data

- **Parents**: an Appwrite user account (email, password hash held by Appwrite, sessions). The app keeps
  only the Appwrite user id in its own tables.
- **Learners (children)**: a display name (first name or nickname), a year group and preferences. No surname,
  date of birth, school, photo, voice or contact detail is collected.

## Tables

All tables live in one Appwrite database (`APPWRITE_DATABASE_ID`). Rows carry `createdAt` / `updatedAt`.
Every student read or write goes through a server function that checks the parent's family.

| Table | Content | Purpose | Lawful basis | Retention |
| --- | --- | --- | --- | --- |
| `families` | Family name, owner user id | Group parents and learners | _TBD_ | Until the owner deletes the family (settings) |
| `family_members` | Family id, user id, role | Authorization | _TBD_ | Same as family |
| `students` | Display name, year group, preferences (voice on/off, etc.) | Run lessons for the right year | _TBD_ | Until the parent deletes the learner |
| `learning_sessions` | Objective, lesson state (items shown, answers so far), completion time, self-rated confidence | Run a lesson; completed lessons feed progress | _TBD_ | Unfinished: `RETENTION_OPEN_SESSION_DAYS` (30). Completed: evidence, see below |
| `assessment_attempts` | Item prompt, expected answer, the child's answer (≤ 64 chars), correct, hints used, mode | Mastery evidence | _TBD_ | Evidence, see below |
| `student_competencies` | Status per objective, computed status, reasons, parent override with reason | Progress view | _TBD_ | Until the learner is deleted. Never purged by retention |
| `mastery_events` | Status changes, actor (system/parent), reason | Explain how a status was reached | _TBD_ | Evidence, see below |
| `revision_schedules` | Objective, due date, status | Spaced review | _TBD_ | Pending rows kept; done/superseded rows follow evidence retention |
| `worksheet_checks` | Image sha256, MIME type, byte size, model id, transcribed items, handwriting note, flags, parent review | Check a printed worksheet from a photo | _TBD_ | `RETENTION_WORKSHEET_CHECK_DAYS` (90). Parents can delete one at any time |
| `session_messages` | Nova chat turns during a lesson: role (child/tutor), text (child ≤ 500 chars, reply ≤ 1,500), session, expiry | Show the conversation and give the model the last turns | _TBD_ | `RETENTION_SESSION_MESSAGES_DAYS` (30): hidden after expiry, pruned on the next chat write, deleted by the purge task |
| `audit_logs` | Action, target id, actor user id, family id, small detail (counts, field names; no names or answers) | Accountability, abuse investigation | _TBD_ | `RETENTION_AUDIT_LOG_DAYS` (400, minimum 30) |
| `rate_limits` | Hashed bucket id (sha256 of key + window), count, expiry | Abuse protection | _TBD_ | Deleted after the window ends (purge task) |
| `knowledge_sources`, `knowledge_versions`, `learning_resources`, `ingestion_jobs`, `curricula`, `learning_objectives`, `objective_prerequisites` | Public curriculum text (DfE programme of study), versions, admin review notes and user ids | Curriculum retrieval | _TBD_ | Kept; not child data |
| Bucket `speech` | MP3 clips of lesson text, named by sha256 of voice + model + text | Avoid paying for the same clip twice | _TBD_ | Kept; contains no child input |

Rate limit keys can include the sign-in email or client IP before hashing. Only the hash is stored.

Worksheet photos are not stored. The server validates the image (type by magic bytes, ≤ 3 MB, ≤ 10,000 px per
side, ≤ 50 MP), sends it to the vision model and keeps the hash and the transcription only.

**Evidence** means completed `learning_sessions`, `assessment_attempts`, `mastery_events` and done/superseded
`revision_schedules`. It is kept forever unless `RETENTION_EVIDENCE_DAYS` is set (minimum 365).

## Retention job

Nitro task `retention:purge` (`src/server/tasks/retention-purge.ts`) runs daily at 03:41.

- Dry run by default: it logs the counts it would delete. It deletes only with `RETENTION_PURGE_ENABLED=true`.
- Each real run writes one `retention.purge` audit entry with the policy, counts and truncated steps.
- At most 5,000 rows per step per run; larger backlogs finish over the next runs.
- Unfinished lessons cannot be continued after 14 days (a new one starts), so the open-lesson sweep
  (minimum 14 days) never races a lesson being completed.
- A row already deleted by another run is skipped. If a step fails, the run still writes its audit entry with
  the counts so far and the failed step, then stops.
- Chat audit entries (`tutor.chat`, `tutor.chat_refused`) hold the outcome, phase, duration and lengths,
  never the text.
- `student_competencies` are never purged. Purging evidence does not recompute statuses.

## Export and deletion

- **Export**: the learner page downloads a JSON file with the learner record and every row of
  `learning_sessions`, `assessment_attempts`, `student_competencies`, `mastery_events`, `revision_schedules`
  `worksheet_checks` and `session_messages` for that learner (full history, paged). Audited as
  `student.export`.
Deletion code: `src/server/services/deletion.ts`. Both flows need a typed confirmation that the server checks,
are rate limited per user, and resolve the family from the session, never from a client-sent id.

- **Delete a learner** (learner settings, type the learner's name): removes every row of the learner in
  `learning_sessions`, `assessment_attempts`, `student_competencies`, `mastery_events`, `revision_schedules`,
  `worksheet_checks` and `session_messages`, then the `students` row. Audited as `student.delete_requested`
  and `student.delete` (row counts per table only; no name, answer or message).
- **Delete the family and account** (account settings, owner only, type the account email): deletes every
  learner as above, sweeps any remaining row with the family id in those tables, then `families`,
  `family_members` (all members of the family) and the owner's Appwrite user, which also ends its sessions.
  Audited as `family.delete_requested`, `family.delete` (counts) and `account.delete`. A parent who is not the
  owner cannot delete the family.
- **Resumable**: the learner row, the family row and the membership are deleted after the rows that depend on
  them, and a row already gone is skipped. If a step fails, the parent runs the same action again; a signed-in
  user left without a family can still delete their account from settings.
- **Audit entries** that reference a deleted learner, family or user id stay until their own retention ends.
  They hold ids and counts only, never a display name, email, answer or message.
- **Rate limits** are not keyed by learner. Buckets keyed by the user or family id are stored as hashes and
  expire within 24 hours; the purge task removes them.
- **Storage**: no file is tied to a learner or family. The `speech` bucket holds lesson-text clips shared by
  everyone (no child input), and worksheet photos are never stored, so deletion touches no bucket.
- **Delete a worksheet check**: parents can remove a single check. Audited as `worksheet.delete`.

## Processors

| Processor | What it receives | When |
| --- | --- | --- |
| Appwrite (self-hosted on Coolify, Hostinger VPS) | All stored data above, parent accounts and sessions | Always with `DATA_BACKEND=appwrite` |
| Coolify / Hostinger | Hosts the app, Appwrite and Qdrant containers; server logs | Always |
| OpenRouter (and the model provider it routes to) | Tutor: objective, curriculum passages, the child's last 5 wrong answers on that objective. Chat: the child's message and the last 12 turns of that lesson's chat. Vision: the worksheet photo and a fixed instruction. No display name | Only with `AI_ENABLED` / `VISION_ENABLED` |
| ElevenLabs | Lesson text to read aloud. No child input, no audio from the child | Only with `ELEVENLABS_API_KEY` and voice switched on for the learner |
| Qdrant (self-hosted) | Approved curriculum passages and their vectors | Only with `KNOWLEDGE_INDEX=qdrant` |

Spoken answers use on-device browser recognition (`processLocally = true`); no audio leaves the device.

## Open items before a public launch

- Decide the data controller, the lawful basis per table and the retention values; write a user-facing
  privacy notice and parental consent flow.
- Data processing agreements and transfer assessments for OpenRouter (and its upstream model providers) and
  ElevenLabs; confirm their retention and training settings.
- Backups: Appwrite backups are not described here; deletions and the purge do not reach existing backups.
- Server logs (Coolify) may hold IP addresses and request paths; their retention is not configured by the app.
- The client IP used for rate limits comes from the first `X-Forwarded-For` entry; the proxy must overwrite it.
- No age verification: the app assumes a parent creates and supervises every learner.
