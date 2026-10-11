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

## Reports — director

| Method | Path | Notes |
|---|---|---|
| GET | `/reports/summary` | `{ summary: { practices, activePractices, students, tutors, advisors, institutions, averageGrade } }` |
| GET | `/reports?year=` | stored accreditation indicators (empty when MongoDB is not configured) |
| POST | `/reports/generate` | `{ year? }` computes from PostgreSQL and stores in MongoDB (502 if MongoDB fails) |
| GET | `/audit-log?practiceId=` | audit entries |

## Pages

| Path | Notes |
|---|---|
| `/` and `/index.html` | login; users with a session are redirected to their panel |
| `/pages/<role>.html` | role panel; wrong role → redirect to own panel; no session → `/index.html` |
| `/js/config.js` | public config for the views (`window.SPP_DOMAIN`) |
