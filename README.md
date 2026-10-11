# SPP · Pedagogical Practice Software

Web application to manage pedagogical practicums: students, tutors, advisors and the practicum director work on
the same practice (logbook, activities, evidence, feedback, question bank, grades and accreditation reports).

**Stack:** Node.js 18+ · Express · Supabase Auth · PostgreSQL (Neon) · MongoDB Atlas · Cloudinary · plain HTML/CSS/JS front end.

## Project structure

```
src/
  server.js           entry point: loads the real column names, opens the port, graceful shutdown
  app.js              builds the Express app (middlewares, routes, static files, error handler)
  container.js        composition root: wires repositories → services → controllers
  config/             env.js (validated env access) · constants.js (roles, statuses, limits)
  routes/             URL + verb + role guard → controller (no logic)
  controllers/        HTTP only: validate → call a service → present
  services/           business rules, authorization, auditing, notifications
  repositories/       all SQL / Mongo queries; legacy names ⇄ English domain model
  validators/         request input → clean DTOs
  presenters/         the JSON contract consumed by the views
  middlewares/        authentication, roles, CSRF, security headers, uploads, errors
  models/             Mongoose schemas
  infrastructure/     PostgreSQL pools, Mongo, Supabase, Cloudinary, schema resolver
  utils/              HttpError, asyncHandler, validators, id generator…
  scripts/            operational CLIs
public/               front end (pages are served only to the matching role)
database/             SQL schema + local test fixture
tests/                unit · repository integration · HTTP end-to-end
docs/                 architecture, API reference, data contract
```

Request flow: **view (JS) → `/api` route → controller → service → repository → database.**
The views never touch a database. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the layering rules and a
checklist for adding features.

## Getting started

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in. **Never commit `.env` and never paste keys into code or `.env.example`.**
3. `npm run schema:verify` — compares your tables with what the code expects and reports anything missing.
4. `npm run schema:apply` — creates only the missing tables of the **evaluation** database (the practice database is never touched).
5. `npm run users:migrate` — creates the Supabase access account of the users that already exist in your database
   (for testing: `npm run users:migrate -- --password=Test1234` gives everyone the same temporary password).
   To create only the director: `npm run director:create`.
6. `npm start` (or `npm run dev` with auto-reload) and open <http://localhost:3000>.

On the login screen type the part before the `@` (completed with `INSTITUTIONAL_DOMAIN`) or the full e-mail.

## Scripts

| Command | Purpose |
|---|---|
| `npm start` / `npm run dev` | run the server |
| `npm run schema:verify` / `schema:apply` | check / create database tables |
| `npm run users:migrate` / `director:create` | create Supabase access accounts |
| `npm test` | unit + repository + HTTP end-to-end tests |
| `npm run lint` | ESLint (server and browser code) |

## Testing

`npm test` runs three suites. The last two need a **local** PostgreSQL with two empty databases `spp_est` and
`spp_eva` (user/password `spp`) and **drop their contents** — they refuse to run against a non-local host.
Use `DATABASE_URL_PRACTICE_TEST` / `DATABASE_URL_EVALUATION_TEST` to point at another local instance.

## How it connects to your database

* **Users:** one table per role (`estudiante`, `tutor_academico`, `asesor_pedagogico`, `director`). Supabase checks
  the password; the system links the account by **institutional e-mail**.
* **Logbook:** it has no table; the grade and observation live in `practica` (`notaFinal = 0` / `observacionFinal = ''`
  mean "not graded").
* **Evidence:** `evidenciaactividad` (description + hours) and `evidenciaarchivo` (Cloudinary URL).
* **Feedback:** `retroalimentacion_t` (tutor) and `retroalimentacion_a` (advisor), attached to an **evidence**.
* **Activities:** six are generated per practice (`<practiceId>-A1` … `A6`) — the six buttons of the student view.
* **Text keys (varchar(30))** are generated in `utils/id-generator.js` (`PRA-…`, `EV-…`, `TIP-001`…).
* Irregular column names (`correInst`, `"estado "`…) are resolved at startup by `infrastructure/schema-resolver.js`.

> The tables, columns and stored values keep their original Spanish names because the databases hold live data.
> They are translated to English at the repository boundary — see [docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md).

## Security

* `httpOnly` + `SameSite=Lax` cookie (+ `Secure` in production). Role and status are always read from the database.
* **Only Supabase accounts created by this system are accepted** (`app_metadata.spp = true`, confirmed e-mail), so
  nobody can sign in by registering in Supabase with someone else's e-mail. Also disable *Allow new users to sign up*
  in Supabase (Authentication → Sign In / Providers).
* Every panel is served only to its role; every endpoint checks role and ownership. CSRF header `X-SPP`, login rate
  limit, parameterised queries, strict CSP (no inline scripts / handlers), uploads limited to 10 MB and allowed types.
* New users no longer get a pre-filled default password: the director must type or generate one.

## Notes

* **Evaluation database** (`pregunta`, `evaluacion`, `respuesta`, `retropregunta`) uses the schema proposed in
  `database/schema/evaluation.sql`. If your tables have different columns, `npm run schema:verify` will say so.
* In Mongo, `idPractica` and `idPrograma` are strings because they are varchar in PostgreSQL.
* There is no "last access" column, so the user list does not show it.
* Your schema does not validate `fechaFinal >= fechaInicio`; the application does.
* Reports need MongoDB (`MONGO_URI_PRIMARY`); without it the dashboard still works but stored indicators are empty
  and "Generate and save" answers 502.

## Upgrading from the Spanish layout

| Before | Now |
|---|---|
| `main/` (`index.js`, `Servidor.js`, `scripts/`) | `src/server.js`, `src/app.js`, `src/scripts/` |
| `controlador/` (controllers, `Rutas.js`, middleware) | `src/controllers/`, `src/routes/`, `src/middlewares/` |
| `modelado/dao`, `modelado/mongo`, `modelado/config` | `src/repositories`, `src/models`, `src/infrastructure`, `src/config` |
| `modelado/sql`, `modelado/pruebas` | `database/`, `tests/` |
| `vistas/` (`HTML`, `CSS`, `JavaScript`, `img`) | `public/` (`pages`, `css`, `js`, `img`) |
| `npm run esquema` / `verificar` / `crear-director` / `migrar-usuarios` / `prueba` | `schema:apply` / `schema:verify` / `director:create` / `users:migrate` / `test` |
| `/api/practicas`, `/api/usuarios`, `/HTML/estudiante.html` … | `/api/practices`, `/api/users`, `/pages/student.html` … (see [docs/API.md](docs/API.md)) |
| Spanish `.env` names | English names (the old ones still work as aliases) |

A backup of the original project was saved next to this folder as `proyecto-original-backup.tar.gz`.
