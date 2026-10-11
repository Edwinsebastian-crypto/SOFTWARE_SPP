# Architecture

SPP is a layered Node.js / Express application. Every layer has one job and may only depend on the layer
below it. All code, comments and UI text are in English; the only Spanish left is the *persisted* vocabulary
of the existing databases, which is deliberately confined to the persistence layer (see
[DATA-CONTRACT.md](DATA-CONTRACT.md)).

## Layers

```
HTTP request
   │
   ▼
routes/        URL + HTTP verb + role guard → controller method          (no logic)
   │
   ▼
controllers/   parse & validate the request, call ONE service,           (HTTP only)
               shape the response with a presenter
   │
   ▼
services/      business rules, authorization, orchestration,             (no HTTP, no SQL)
               auditing, notifications
   │
   ▼
repositories/  ALL SQL and ALL Mongo queries; translate persisted        (no business rules)
               (legacy) names/values to the English domain model
   │
   ▼
infrastructure/ connections & SDKs: PostgreSQL pools, Mongo, Supabase,   (no domain knowledge)
               Cloudinary, schema resolver
```

Cross-cutting pieces:

| Folder | Responsibility |
|---|---|
| `config/` | `env.js` (validated environment access) and `constants.js` (roles, statuses, limits) |
| `middlewares/` | authentication, role authorization, CSRF, security headers, uploads, error handling |
| `validators/` | pure functions turning untrusted input into clean DTOs (throw `HttpError` 400) |
| `presenters/` | the single place where the JSON contract of the views is defined |
| `models/` | Mongoose schemas (persisted field names are legacy; see the data contract) |
| `utils/` | `HttpError`, `asyncHandler`, validation helpers, id generator, DB error mapping |
| `scripts/` | operational CLIs (`schema:apply`, `schema:verify`, `users:migrate`, `director:create`) |

## Dependency rules

1. `routes → controllers → services → repositories → infrastructure`. Never import upwards.
2. Only repositories write SQL / Mongo queries. A service never sees a table or column name.
3. Only controllers touch `req` / `res`. A service receives plain data and returns plain data.
4. Services throw `HttpError` (404 / 403 / 409 …) for business failures; the error middleware turns them into
   JSON. Unknown errors become a generic 500 and are never leaked to the client.
5. Persisted (Spanish) names and values appear in `repositories/`, `models/`, `infrastructure/schema-resolver.js`,
   `database/` and `scripts/verify-schema.js` — nowhere else.

## Composition root

`src/container.js` is the only place where concrete classes are instantiated and wired together
(repositories → services → controllers). Services receive their collaborators through the constructor, so a
service can be unit-tested with fakes and a repository can be swapped without touching the layers above.

`src/app.js` builds the Express app from a container (no port is opened), and `src/server.js` loads the real
column names (`SchemaResolver`), opens the port and handles graceful shutdown.

## Authorization model

* **Authentication** — Supabase validates credentials; the session JWT lives in an `httpOnly` cookie.
  The link between a Supabase account and our tables is the *institutional e-mail*. Only accounts created by
  this system (`app_metadata.spp = true`, confirmed e-mail) are accepted.
* **Role-based access** — `requireRole(...)` in the route table (director / tutor / advisor / student).
* **Resource-level access** — `PracticeAccessService` is the single rule of "who may touch which practice"
  (director: all; student: own; tutor/advisor: assigned). It answers 404 instead of 403 so existence is not revealed.
* **CSRF** — every state-changing request must carry the `X-SPP: 1` header.
* **CSP** — no inline scripts or inline event handlers are used, so the policy is `script-src 'self'`.

## Frontend (`public/`)

Server-rendered static HTML pages (served only after a role check) plus plain browser scripts — no build step.

```
public/
  index.html               login
  pages/<role>.html        student | tutor | advisor | director  (never served statically)
  css/                     variables → shell → <role>.css (+ users.css for the director)
  js/core/                 shared by every page
      api.js               HTTP client (window.SPP) — the only code that calls fetch()
      session.js           who is logged in, log out
      shell.js             sidebar / topbar / theme
      panels.js            panel navigation, "..." card menus, tabs
      credential.js        student credential modal
      custom-select.js     styled <select> widget (director)
  js/pages/                one file per page; `<page>.js` = UI behaviour, `<page>.api.js` = data
```

Rule: the views never talk to a database; they only call `/api/*` through `SPP.request`.

## Adding a feature (checklist)

1. **Repository** — add the query (parameterised), return English camelCase fields.
2. **Service** — add the business rule; use `PracticeAccessService` if a practice is involved; call
   `auditService.record(...)` for changes.
3. **Validator** — parse the input into a DTO.
4. **Presenter** — if the response shape is new.
5. **Controller + route** — thin; add the role guard in the route.
6. **Container** — wire the new class.
7. **Tests** — repository integration test + an HTTP case in `tests/e2e-http.test.js`.
8. **Docs** — add the endpoint to [API.md](API.md).

## Testing

| Command | What it covers |
|---|---|
| `npm run test:unit` | pure logic: env aliases, value mappings, validators, presenters, id generation |
| `npm run test:repositories` | every repository against a copy of the real legacy schema |
| `npm run test:e2e` | the full HTTP API with Supabase and Cloudinary faked |
| `npm run lint` | ESLint for the server and the browser code |

The DB-backed tests **drop the `public` schema** of two local databases (`spp_est`, `spp_eva`). They refuse to run
against a non-local host. Override the URLs with `DATABASE_URL_PRACTICE_TEST` / `DATABASE_URL_EVALUATION_TEST`.

## Scaling notes

* The app is stateless except for a small per-process cache of validated tokens (60 s). Behind several instances
  it still works; move the cache to Redis if you need tighter revocation.
* Lists are not paginated server-side yet (`GET /api/users`, `/api/practices`, …). Add `limit` / `offset` in the
  repository + validator when the data grows.
* Business logic is isolated in services, so a different transport (queue worker, GraphQL, CLI) can reuse it.
* Audit entries and notifications are fire-and-forget by design: a Mongo outage never breaks a request.
