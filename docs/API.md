# HTTP API

Base path `/api`. All bodies are JSON (except evidence upload: `multipart/form-data`). Every request that
changes data must send the header `X-SPP: 1`. Errors are `{ "error": "message" }` with the matching status.

Roles: `student`, `tutor`, `advisor`, `director`. "Participant" = the director, the student of the practice, or the
tutor / advisor assigned to it; non-participants get **404**.

## Authentication

| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/auth/login` | public (rate-limited) | `{ username, password, role }` → `{ role, redirectTo }` |
| POST | `/auth/logout` | anyone | clears the session cookies |
| GET | `/auth/session` | authenticated | `{ role, firstName, lastName, documentType, documentNumber, email, program, status }` |

## Users — director

| Method | Path | Body / notes |
|---|---|---|
| GET | `/users?role=&status=&search=` | → `{ users: [{ id, role, firstName, lastName, documentType, documentNumber, email, program, faculty, status }] }` |
| GET | `/users/programs` | → `{ programs: [{ id, name, faculty }] }` |
| POST | `/users` | `{ role, documentNumber, documentType, firstName, lastName, email, password, program?, status? }` |
| PUT | `/users/:document` | `{ documentType, firstName, lastName, program?, status, password? }` (role / e-mail never change) |
| PATCH | `/users/:document/status` | `{ status }` — `active` \| `pending` \| `inactive` |
| DELETE | `/users/:document` | 409 when the user has practices |

`program` is required for `student` and `tutor` only. Passwords need 8–72 chars with upper, lower and a digit.

## Catalogs — director

| Method | Path | Body |
|---|---|---|
| GET / POST | `/institutions` | `{ taxId (≤10), name, manager, address, email }` |
| PUT / DELETE | `/institutions/:taxId` | the tax id (primary key) is never modified |
| GET / POST | `/practice-types` | `{ name, semester (1–12), hours (1–5000) }` → ids `TIP-001`… |
| PUT / DELETE | `/practice-types/:id` | |

## Practices

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/practices` | authenticated | scoped by role |
| GET | `/practices/:id` | participant | |
| POST / PUT | `/practices[/:id]` | director | `{ typeId, institutionId, studentDocument, tutorDocument, advisorDocument, startDate, endDate, status? }` |
| DELETE | `/practices/:id` | director | cascades evidence, feedback, files, activities, evaluation |
| PATCH | `/practices/:id/logbook` | tutor, director | `{ finalGrade? (0–5), generalObservation? }` |
| GET | `/practices/:id/activities` | participant | six numbered activities |
| GET | `/practices/:id/questions` | participant | `{ questions: [{ id, number, questionId, statement, topic, value, answer, status, observation }] }` |
| POST | `/practices/:id/questions` | tutor, director | `{ questionId }` assigns a question of the bank |

Practice `status`: `active` \| `completed` \| `cancelled`. `logbook.finalGrade` is `null` while not graded.

## Evidence and feedback

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/activities/:activityId/evidences` | participant | |
| POST | `/activities/:activityId/evidences` | student | multipart: `file` (≤10 MB, pdf/image/office/text), `description?`, `hours` |
| PUT / DELETE | `/evidences/:evidenceId` | student, director | `{ description, hours? }` |
| GET | `/activities/:activityId/feedback` | participant | `{ feedback: [{ id, role, text, date, evidenceId }] }` |
| POST | `/activities/:activityId/feedback` | tutor, advisor | `{ evidenceId, text }` |

## Question bank and answers

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/questions?search=&topic=` | tutor, director | |
| POST / PUT / DELETE | `/questions[/:id]` | tutor, director | `{ statement, topic, questionType, practiceType?, value (1–5) }` |
| PUT | `/answers/:answerId` | student | `{ text, submit }` → `{ ok, status }` (`draft` \| `answered`) |
| POST | `/answers/:answerId/feedback` | tutor | `{ text }` |

`topic`: `pedagogy` \| `didactics` \| `assessment`. `questionType`: `open` \| `multiple-choice` \| `true-false`.
Answer `status`: `pending` \| `draft` \| `answered`.

## Evaluations — tutor, student and director (microservice)

`/api/evaluations/*` is a gateway to the Python evaluation service (`servicio-evaluacion/`). The monolith checks the
session and the role, authorizes the practice with `PracticeAccessService`, and forwards the call with a 2-minute
token signed with `EVALUATION_SERVICE_SECRET` (`sub` = document number, `rol`). Only the routes below exist
(anything else is **404**). Field names of bodies and responses are the service's own (Spanish: `id_evaluacion`, `titulo`…);
see the service's OpenAPI at `<EVALUATION_SERVICE_URL>/docs`. Errors are `{ "error": "message" }` like everywhere else.
`503` = service not configured, `502` = unreachable or failed, `504` = timed out.

| Method | Path (after `/api/evaluations`) | Who | Notes |
|---|---|---|---|
| GET | `/health` | tutor | service status and AI provider |
| GET / POST | `/tutor/evaluaciones` | tutor | `?id_practica=`; POST needs `id_practica` of **your** practice — the student is always the practice's student |
| GET / PATCH / DELETE | `/tutor/evaluaciones/:id` | tutor | |
| POST | `/tutor/evaluaciones/:id/{publicar,despublicar,cerrar}` | tutor | |
| POST | `/tutor/evaluaciones/:id/generar` | tutor | generate questions with AI from a topic and/or evidence of the practice |
| POST / PUT | `/tutor/evaluaciones/:id/preguntas[/aprobar-todas \| /orden]` | tutor | |
| PATCH / DELETE / POST | `/tutor/preguntas/:id[/aprobar \| /rechazar]` | tutor | AI questions are drafts until approved |
| GET | `/tutor/evaluaciones/:id/intentos`, `/tutor/intentos/:id` | tutor | results |
| POST | `/tutor/respuestas/:id/{calificar,retro}` | tutor | grade an open answer / comment |
| GET | `/tutor/evidencias?id_practica=` | tutor | evidence of **your** practice, to use as AI context |
| GET | `/student/evaluaciones` | student | assigned, published evaluations |
| POST | `/student/evaluaciones/:id/intentos` | student | start or continue an attempt |
| GET | `/student/intentos/:id` | student | |
| PUT | `/student/intentos/:id/respuestas/:idPregunta` | student | save an answer |
| POST | `/student/intentos/:id/enviar` | student | submit |
| GET | `/director/resumen` | director | **read only.** Figures, notes distribution, AI usage, monthly activity, per-tutor table and alerts, plus `directorio` (names) |
| GET | `/director/evaluaciones` | director | `?estado=&id_tutor=&id_practica=&q=&solo_alertas=true&limite=&desplazamiento=` → `{ total, limite, desplazamiento, items, directorio }` |
| GET | `/director/evaluaciones/:id` | director | per-question hit rates, attempts and AI generations. Never the students' answers |

## Reports — director

| Method | Path | Notes |
|---|---|---|
| GET | `/reports/summary` | `{ summary: { practices, activePractices, students, tutors, advisors, institutions, averageGrade } }` |
| GET | `/reports?year=` | stored accreditation indicators, one document per program (v2 includes summary, practice types, grade distribution, teacher support, partner institutions, tutors, advisors and the practices roster; v1 documents stay readable) |
| GET | `/reports/dashboard` | data for the Reports tabs (general, types, practice, feedback, institutions) |
| POST | `/reports/generate` | `{ year? }` computes from PostgreSQL and stores in MongoDB (502 if MongoDB fails) |
| GET | `/audit-log?practiceId=` | audit entries |

## Pages

| Path | Notes |
|---|---|
| `/` and `/index.html` | login; users with a session are redirected to their panel |
| `/pages/<role>.html` | role panel; wrong role → redirect to own panel; no session → `/index.html` |
| `/pages/tutor-evaluations.html`, `/pages/student-evaluations.html`, `/pages/director-evaluations.html` | legacy evaluation paths (redirect to their integrated role panels) |
| `/js/config.js` | public config for the views (`window.SPP_DOMAIN`) |
