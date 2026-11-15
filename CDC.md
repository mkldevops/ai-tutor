AI Tutor — Handoff to Claude Code

0. Mission

Build a private, family-first, AI-powered learning application for children following the National Curriculum in England, starting with Year 3 and Year 5 (Key Stage 2). The product should feel like a responsive teacher–student relationship, not a static catalogue of lessons and quizzes. It must assess whether each child has genuinely understood a concept, test independently, revisit later, and track durable mastery per child.

Language: product instruction and curriculum content primarily in English; parent-facing UI may support French later. Keep localization possible. Initial users: one family only; design tenant boundaries for possible future family sign-ups, without building public onboarding or billing now.

1. Confirmed decisions

• Frontend/full-stack: TanStack Start + TypeScript (TanStack Router; TanStack Query where useful).

• Authentication, transactional records, file storage: Appwrite (Auth, Databases/Tables, Storage, Functions where appropriate).

• AI orchestration: Mastra, starting with one tutor agent and specialized tools rather than a complex multi-agent swarm.

• Chat UI / streaming: Vercel AI SDK where compatible with TanStack Start and Mastra.

• Vector retrieval: Qdrant; support hybrid lexical/semantic retrieval when justified.

• Runtime model providers should be replaceable; avoid coupling pedagogical state to one LLM.

• Unit and end-to-end tests: Vitest + Playwright.

• GitHub target: mkldevops/ai-tutor, intended to be private. Previous GitHub connector attempts to read/write [README.md](http://README.md) returned 404; do not claim repository is accessible. Check with the user’s local Git credentials (git remote -v, gh repo view) before pushing. Ask for authorization/configuration if needed.

2. Product requirements

2.1 Family and student profiles

• Parent signs in; creates multiple student profiles with year group and preferences.

• Each student has separate sessions, submissions, skills, assessments, and review schedule.

• Parent dashboard shows progress by student, subject, objective, difficulty, and retention over time.

• All child data must be tenant-isolated and private by default.

2.2 Curriculum

• First curricula: England National Curriculum, Year 3 and Year 5; first subjects Maths and English.

• Curriculum is structured as subject → year → strand/topic → learning objective → prerequisite relationships → assessment criteria.

• Make curriculum pluggable for other national curricula later. Store provenance, version and applicability of objectives.

• First end-to-end proof: one Year 3 or Year 5 Maths concept from initial diagnostic to instruction, practice, independent assessment, saved evidence and scheduled follow-up.

2.3 Interactive AI tutor

• Conversational tutor that explains concepts, asks questions, elicits the student’s reasoning, and adapts explanation based on mistakes.

• Text + visual exercises initially; voice input/output planned, with a graceful text fallback.

• Never simply provide answers during an independent assessment. Separate tutoring and testing modes.

• Use age-appropriate, safe language and explain uncertainty; avoid overstating ability to infer understanding.

2.4 Exercises, photos and printable work

• Interactive exercises with typed/selected answers.

• Student/parent can upload a photo of handwritten exercises for answer checking and feedback on legibility/letter formation. Treat handwriting judgments as approximate, surface uncertainty, and allow parent review; do not make high-stakes judgments from a photo alone.

• Generate printable PDFs and separate answer keys, tailored to objectives and student needs.

• Link uploads, corrections and feedback to student, learning objective, and attempt.

2.5 Learning evidence and assessment

• Keep diagnostic, guided practice, independent assessment and spaced review as distinct events.

• Model mastery from observable evidence: correctness, independence, varied question types, explanation, and delayed retention; not solely the LLM’s subjective confidence.

• Prefer deterministic, testable mastery rules and configurable thresholds. Keep audit trail of scores, rubrics and evidence; allow parent override with reason.

• Wrong answers trigger prerequisite review and alternative explanations; correct answers trigger progressively harder or transfer questions.

• Schedule later reassessment to verify durable learning.

3. Knowledge architecture: structured curriculum + reviewed RAG

Do not use a vector database as the curriculum’s source of truth.

1. Structured knowledge / prerequisite graph: authoritative learning objectives and prerequisite edges in Appwrite (no Neo4j needed for MVP).

2. Versioned content store: Appwrite records and Storage for approved source documents, worksheets, metadata, license, origin URL, publication/verification timestamps, checksum and curriculum mapping.

3. Retrieval index: Qdrant vectors + metadata filters (year, subject, objective, approved status, source/version); optionally combine with keyword retrieval and reranking.

4. Ingestion pipeline: discover → fetch → parse → normalize → deduplicate → classify → map to objectives → check license/provenance → stage → human/parent approval → publish/index. Changes create new versions; avoid silently replacing approved content.

5. Tutor retrieval: only approved, age-appropriate, relevant sources; return source references and note insufficient evidence. Protect against prompt injection in retrieved documents.

6. Personal learning memory: student progress and misconception history belong in private transactional data, not shared curriculum knowledge. Never mix students’ records in retrieval.

Priority official/authoritative source candidates

• UK Department for Education: National Curriculum in England and statutory programmes of study.

• Oak National Academy: curriculum materials and available API/content, subject to current API access and usage/license conditions.

• Ofqual: assessment/regulatory guidance where relevant, not a replacement for Year 3/5 lesson content.

• Cambridge International Education only if/when a Cambridge curriculum is added; do not conflate it with England’s National Curriculum.

Source availability, API endpoints, currentness, rights, rate limits and permitted redistribution must be verified before ingestion. Do not assume every publicly viewable resource can be republished or embedded. Support periodic update checks and manual approval of changed content. Never allow an LLM response to rewrite the official curriculum automatically.

4. Suggested modular structure

apps/

  web/                 # TanStack Start: parent dashboard + student experience

  ai/                  # Mastra agents, tools, workflows (if separate service needed)

packages/

  shared/              # TypeScript types, Zod schemas

  curriculum/          # Objectives, prerequisites, curriculum adapters

  learning-engine/     # Deterministic mastery, review scheduling

  appwrite/            # Server-side repositories, schema/migrations

  knowledge/           # Ingestion, retrieval, provenance, Qdrant

  ui/                  # Optional shared components

Keep this flexible: do not introduce monorepo/service complexity unless justified by actual dependencies and deployment.

5. Initial domain entities

• families, family_members, students

• curricula, subjects, learning_objectives, objective_prerequisites

• learning_resources, knowledge_sources, knowledge_versions, ingestion_jobs

• learning_sessions, session_messages (minimal/retention-controlled)

• student_competencies, exercise_items, assessment_attempts, submissions

• revision_schedules, mastery_events

Every private record needs a family/student ownership model and server-verified access. Avoid storing children’s full names or voice recordings unless needed; implement data deletion/export and reasonable retention.

6. Agent/tools design

Start with one Mastra tutor agent using tools:

• lookupCurriculumObjective / getPrerequisites

• retrieveApprovedKnowledge

• generatePractice / gradeObjectiveResponse

• recordLearningEvidence / getStudentProgress

• scheduleReview

• analyzeWorksheetImage (later)

• generatePrintableWorksheet (later)

Use explicit tool input/output schemas, server-side authorization, bounded context and deterministic checks. An assessment grader may use AI for free-text answers but should produce rubric-based evidence with uncertainty and be checked for consistency; no unreviewed model output should directly confer mastery.

7. Delivery plan

Sprint 1 — runnable foundation (P0)

1. Inspect existing repository and the starter scaffold described below; do not overwrite user changes.

2. Bootstrap a currently supported TanStack Start app and lock compatible package versions (verify docs rather than guessing).

3. Add Appwrite configuration, reproducible schema provisioning and environment example; no credentials committed.

4. Implement parent sign-in, secure family/student CRUD, Year 3/5 selection, minimal parent/student screens.

5. Seed a small, manually verified set of Maths objectives with prerequisite edges and source attribution.

6. Implement one text-based lesson flow with diagnostic → explanation → practice → independent assessment; save attempts and deterministic progress.

7. Add unit tests for mastery policy and authorization; at least one Playwright happy-path test.

8. README: setup, environment, dev/test commands, architecture, current limitations.

Sprint 2 — knowledge ingestion

• Source registry, ingestion jobs, versioning/approval, Qdrant indexing and provenance-aware retrieval.

Sprint 3 — multimodal work

• Image upload, worksheet photo feedback, printable PDF exercises/keys, voice pilot.

Sprint 4 — retention and analytics

• Spaced reviews, longitudinal evidence, parent dashboard and evaluation of learning outcomes.

Acceptance for first vertical slice: Two independent students (Year 3 and Year 5) can each complete a Maths lesson, have distinct persisted histories and skill statuses, and cannot access each other’s private data via client or API. A correct guided answer must not automatically equal mastery.

8. Existing artifact — inspect before implementing

An earlier starter ZIP was generated in the conversation: [ai-tutor-starter.zip](http://ai-tutor-starter.zip). It is a partial scaffold, not a working application. It includes:

• src/lib/domain.ts: TypeScript/Zod models and preliminary mastery policy

• src/lib/domain.test.ts: preliminary unit tests

• src/lib/appwrite.ts: Appwrite client factory

• docs/[ARCHITECTURE.md](http://ARCHITECTURE.md): architecture/security notes

• package.json, .env.example, [README.md](http://README.md)

If the ZIP is available in the local workspace, inspect it and reuse valid parts. If not, implement from this spec without assuming those files exist. Do not claim tests passed without running them.

9. Engineering and security requirements

• Strict TypeScript, Zod validation, linting, tests and clear error handling.

• Never expose Appwrite admin/API keys, model secrets or Qdrant admin credentials in the browser.

• All student reads/writes authorized on server; permissions verified in integration tests.

• Enforce rate limits, request size limits, upload MIME/type/size checks, cost caps and audit logs.

• Treat retrieved documents and image OCR as untrusted input; defend against prompt injection.

• Child safety/privacy by design; consider applicable GDPR/UK GDPR and child-data obligations before any public launch.

• Avoid fabricated references and unsupported pedagogical claims; cite actual resources in lesson provenance.

• Keep providers replaceable and cost/latency observable.

10. Instructions for Claude Code

1. First inspect the local filesystem, Git status/remotes, package manager and any existing code.

2. Report a short implementation plan and identified blockers; then implement Sprint 1 incrementally, prioritizing a runnable vertical slice.

3. Verify the official documentation for current TanStack Start, Appwrite, Mastra, AI SDK and Qdrant integration where necessary.

4. Make small, understandable commits; run install, typecheck, tests and build; report actual results, not assumptions.

5. If Appwrite/Qdrant credentials or services are missing, supply reproducible local setup and mocks/test doubles where sensible; clearly mark untested integrations.

6. Do not push to GitHub without confirming the remote and that the user has authorized the target repository. The user has expressed intent to use mkldevops/ai-tutor.

7. At the end, summarize changed files, commands, test status, remaining work and next action.

Immediate objective: produce a functioning TanStack Start + Appwrite foundation and one testable Year 3/Year 5 Maths learning flow; defer production-grade voice and full-scale RAG until the core learning loop is demonstrated.