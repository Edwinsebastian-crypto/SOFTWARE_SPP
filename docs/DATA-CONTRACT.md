# Data contract (persisted names)

The code base is entirely in English, but the **databases already contain data** whose table names, column
names and stored values are Spanish. Renaming those would break the live data, so they are treated as an
external *contract*: they are never renamed in code, and they are confined to the persistence layer.

> **Rule:** services, controllers, validators, presenters, the API and the frontend only see English names and
> values. Translation happens in `src/repositories/*` (SQL aliases + `legacy-values.js`) and `src/models/*`.

## Where the legacy vocabulary is allowed

| Location | Why |
|---|---|
| `src/repositories/*.repository.js` | SQL against the real tables/columns; Mongo field mapping |
| `src/repositories/legacy-values.js` | single translation table for stored enum values |
| `src/models/*.model.js` | Mongoose schemas with the stored field / collection names |
| `src/infrastructure/schema-resolver.js` | resolves irregular column spellings at startup |
| `database/**`, `src/scripts/verify-schema.js` | schema files and the schema checker |

## PostgreSQL — practice database (`DATABASE_URL_PRACTICE`)

| Table | Domain concept |
|---|---|
| `estudiante`, `tutor_academico`, `asesor_pedagogico`, `director` | users per role (`student`, `tutor`, `advisor`, `director`) |
| `programa` | academic programs |
| `practica` | practices (also stores the final grade `notaFinal` and observation `observacionFinal`; the "logbook" has no table) |
| `actividad` | activities (6 per practice) |
| `evidenciaactividad` / `evidenciaarchivo` | evidence (description + hours) / its file (Cloudinary URL) |
| `retroalimentacion_t` / `retroalimentacion_a` | tutor / advisor feedback, attached to an evidence |
| `institucion`, `tipopractica` | institutions (key = tax id `nitEntidad`, varchar(10)) / practice types |
| `archivosactividad` | legacy file table (only cleaned up when a practice is deleted) |

Irregular column names resolved at runtime by `SchemaResolver`: `correInst` / `correinst` / `correoinst` /
`correoInst` (e-mail), `"estado "` and `"numDocAsesor "` (trailing space), `Idprograma` (capital I).
`notaFinal = 0` and `observacionFinal = ''` mean *not graded* (the columns are NOT NULL).
Users carry the marker `GESTIONADA_POR_SUPABASE` in the legacy `contrasena` column: real passwords live in Supabase.

## Stored values ⇄ API values

| Concept | Stored in the database | API / code |
|---|---|---|
| user status | `activo` / `pendiente` / `inactivo` (capitalised on write: `Activo`…) | `active` / `pending` / `inactive` |
| practice status | `activa` / `finalizada` / `cancelada` | `active` / `completed` / `cancelled` |
| audit entity | `Practica` `Bitacora` `Evidencia` `Retroalimentacion` `Usuario` | `practice` `logbook` `evidence` `feedback` `user` |
| audit action | `Insertar` / `Modificar` / `Eliminar` | `insert` / `update` / `delete` |
| notification type | `PracticaAsignada` | (internal) |

Free-text columns written by the application are now in English (for example the generated activity names
`Activity #1` and the `tipopractica` value of new questions). Rows that already exist keep their old text.

## MongoDB

| Connection | Collection | Stored fields (legacy) |
|---|---|---|
| `MONGO_URI_PRIMARY` | `auditoria` | `usuario`, `entidad`, `idEntidad`, `idPractica`, `accion`, `fecha`, `anio`, `mes` |
| `MONGO_URI_PRIMARY` | `indicadoresacreditacion` | `anio`, `idPrograma`, `nombrePrograma`, `totalEstudiantesActivos`, `practicasPorTipo`, `distribucionNotas`, `acompanamientoDocente`, `entidadesVinculadas`, `tasaDesercion`, `duracionPromedioPracticasDias` |
| `MONGO_URI_NOTIFICATIONS` | `notificaciones` | `tipo`, `destinatario`, `idPractica`, `asunto`, `contenido`, `fechaCreacion`, `fechaEnvio` |

Repositories map these documents to English objects (`AuditRepository`, `IndicatorRepository`,
`NotificationRepository`). The notification collection is consumed by an external mail microservice that still
reads the stored field names, which is another reason not to rename them.

## Supabase

Accounts created by SPP carry `app_metadata = { spp: true, role }`. Accounts created before the English rename
have `{ spp: true, rol }`; only `spp` is checked, so both work.

## Environment variables

Canonical names are English; the old Spanish names remain valid aliases (see `.env.example`):

| Canonical | Legacy alias |
|---|---|
| `DATABASE_URL_PRACTICE` | `DATABASE_URL_ESTUDIANTE` |
| `MONGO_URI_PRIMARY` | `MONGO_URI_BASE1` |
| `MONGO_URI_NOTIFICATIONS` | `MONGO_URI_BASE2` |
| `INSTITUTIONAL_DOMAIN` | `DOMINIO_INSTITUCIONAL` |
| `LOGIN_MAX_ATTEMPTS` | `LOGIN_MAX_INTENTOS` |
| `DIRECTOR_FIRST_NAMES` / `DIRECTOR_LAST_NAMES` / `DIRECTOR_DOCUMENT` / `DIRECTOR_USERNAME` | `DIRECTOR_NOMBRES` / `DIRECTOR_APELLIDOS` / `DIRECTOR_DOCUMENTO` / `DIRECTOR_USUARIO` |

## Optional follow-up: fully English database

If you later want the databases themselves in English, the clean path is: (1) add a migration that renames
tables/columns and rewrites the stored values; (2) replace the aliases in the repositories and empty
`legacy-values.js`; (3) migrate the Mongo documents (and update the mail microservice); (4) drop
`SchemaResolver`. Because every Spanish name lives in the files listed above, the code change is small and
mechanical — the migration itself is the real work and must be rehearsed on a copy of the data.
