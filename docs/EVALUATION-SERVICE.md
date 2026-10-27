# Evaluation service (Python microservice)

Evaluations with manual or AI-generated questions live in a separate FastAPI service (`servicio-evaluacion/`, in the
`SOFTWARE` repository). The monolith is only the **gateway**:

```
browser ──session cookie──▶ /api/evaluations/*  (this app)  ──2-min signed token──▶  FastAPI service ──▶ DB spp_evaluacion
                              │ role guard + PracticeAccessService                          └─ read-only ──▶ practice DB
```

| Piece | File |
|---|---|
| HTTP client + token signing (HS256, `sub` = document number) | `src/infrastructure/evaluation-service.js` |
| Allow-list of routes, practice authorization, error translation | `src/services/evaluation-gateway.service.js` |
| Express handlers / routes | `src/controllers/evaluation.controller.js`, `src/routes/evaluations.routes.js` |
| Screens | `public/pages/{student,tutor}.html` (sección de preguntas), `public/pages/director-evaluations.html`, `public/js/core/*`, `public/css/evaluacion.css` |
| Tests | `tests/evaluation-gateway.test.js` (`npm run test:evaluations`, no database needed) |

No npm dependency was added (Node 18+ `fetch` and `crypto`).

## Configuration

```
EVALUATION_SERVICE_URL=http://localhost:8000
EVALUATION_SERVICE_SECRET=<random, same value as JWT_SECRET in the service>
```
Empty values disable the feature (`503`); the rest of the app is unaffected. Setup of the service itself (database,
`AUTH_MODE=jwt`, `EVIDENCIAS_MODE=practice_db`, Anthropic key) is in `servicio-evaluacion/README.md`, section
"Acoplar al monolito".

## Security rules enforced here

* Only `tutor`, `student` and `director` get a token; the advisor receives 403. The director's token only opens `GET /director/*`.
* Only the routes in `ROUTES` exist (anything else is 404): no path can reach other service endpoints.
* Creating an evaluation requires a practice the tutor is assigned to; the student is **always** the practice's student.
* Evidence listing is limited to the tutor's own practices; the service additionally refuses AI sources that do not
  belong to the evaluation's practice.
* The service must be reachable only from this server. Whoever holds `EVALUATION_SERVICE_SECRET` can impersonate any user.

## Not done (follow-ups)

* Deleting a practice does not delete its evaluations in the service (they stay as orphans, unreachable from the UI).
* Evaluation actions are not written to the Mongo audit log (`AUDIT_ENTITIES` has no evaluation entity).
* The screens' text is Spanish while the rest of the panels are English.

## Director view (read only)

`/pages/director-evaluations.html` (menu entry "Evaluations" in the director panel) shows figures, alerts, charts, a
per-tutor table and the list of all evaluations with a per-question detail. It is read only by construction:

* The router only has `router.get('/director/*')` and the allow-list has no other verb, so POST/PATCH/DELETE are 404.
* The service exposes `GET /api/v1/director/{resumen,evaluaciones,evaluaciones/:id}` and rejects any role but DIRECTOR.
* It never returns what students wrote, the AI prompt or the tutor's comments: only counts, grades and per-question hit rates.
* The service only knows document numbers; the gateway adds `directorio` (names of practices, tutors and students that
  appear in the response) from `PracticeRepository.list()`, cached for 30 seconds. Ids that no longer exist in the
  practice database (a deleted practice) are shown as "not found".
* Filters accepted by the list (`estado`, `id_tutor`, `id_practica`, `q`, `solo_alertas`, `limite`, `desplazamiento`) are
  validated here; anything else is dropped.

Alerts are computed by the service (`services/estadisticas.py`): attempt waiting for grading 3+ days, published after its
deadline, draft for 14+ days, published for 7+ days with no attempts. Charts are plain HTML/CSS (the CSP does not allow
external libraries). The screen uses the live evaluation gateway and core session.
