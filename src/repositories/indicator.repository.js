'use strict';
const BaseRepository = require('./base.repository');
const schema = require('../infrastructure/schema-resolver');
const legacy = require('./legacy-values');
const accreditationIndicator = require('../models/accreditation-indicator.model');
const { buildIndicators, lastMonths, fillMonths, percent } = require('../utils/accreditation');

/**
 * Accreditation indicators are COMPUTED from PostgreSQL (pure aggregation in utils/accreditation.js) and STORED in
 * MongoDB (collection `indicadoresacreditacion`). A `notaFinal` of 0 means "not graded" (the column is NOT NULL),
 * hence the `notaFinal > 0` filters.
 *
 * Indicator shape exposed to the rest of the app (see utils/accreditation.js):
 *   { year, programId, programName, faculty, version, generatedAt, totalStudents, activeStudentsTotal, activeTutors,
 *     summary, practicesByType, gradeDistribution, teacherSupport, partnerInstitutions, tutors, advisors,
 *     practices (detail roster), dropoutRate, averagePracticeDurationDays, notes }
 */

/** English field -> stored (legacy) field, per nested entity. */
const MAP = Object.freeze({
  summary: {
    practices: 'total', active: 'activas', completed: 'finalizadas', cancelled: 'canceladas', graded: 'calificadas',
    ungraded: 'sinCalificar', averageGrade: 'notaPromedio', minGrade: 'notaMinima', maxGrade: 'notaMaxima',
    approved: 'aprobadas', failed: 'reprobadas', approvalRate: 'tasaAprobacion', requiredHours: 'horasRequeridas',
    loggedHours: 'horasRegistradas', hoursCompletion: 'porcentajeHoras', activities: 'totalActividades', evidences: 'totalEvidencias'
  },
  type: {
    typeId: 'idTipo', type: 'tipo', requiredHours: 'horasRequeridas', count: 'cantidad', students: 'estudiantes',
    averageGrade: 'promedioNota', approvalRate: 'porcentajeAprobacion'
  },
  grade: { range: 'rango', studentCount: 'cantidadEstudiantes' },
  support: {
    tutorFeedbackCount: 'retroalimentacionesTutor', advisorFeedbackCount: 'retroalimentacionesAsesor',
    practicesWithoutTutorFeedback: 'practicasSinRetroTutor', practicesWithoutAdvisorFeedback: 'practicasSinRetroAsesor',
    feedbackPerPractice: 'promedioRetroPorPractica'
  },
  institution: {
    taxId: 'nit', institutionName: 'nombreEntidad', address: 'direccion', manager: 'encargado', email: 'correo',
    practiceCount: 'cantidadPracticas', studentCount: 'cantidadEstudiantes', activeCount: 'practicasActivas',
    completedCount: 'practicasFinalizadas', averageGrade: 'promedioNota'
  },
  teacher: {
    document: 'documento', name: 'nombre', email: 'correo', practices: 'practicas', students: 'estudiantes',
    activePractices: 'practicasActivas', feedbackCount: 'retroalimentaciones', averageGrade: 'promedioNota'
  },
  practice: {
    practiceId: 'idPractica', studentDocument: 'documentoEstudiante', studentDocumentType: 'tipoDocumentoEstudiante',
    studentName: 'estudiante', studentEmail: 'correoEstudiante', typeId: 'idTipoPractica', type: 'tipoPractica',
    taxId: 'nit', institution: 'entidad', tutorDocument: 'documentoTutor', tutor: 'tutor', advisorDocument: 'documentoAsesor',
    advisor: 'asesor', startDate: 'fechaInicio', endDate: 'fechaFinal', finalGrade: 'notaFinal',
    finalObservation: 'observacionFinal', requiredHours: 'horasRequeridas', loggedHours: 'horasRegistradas',
    activities: 'actividades', evidences: 'evidencias', tutorFeedback: 'retroTutor', advisorFeedback: 'retroAsesor',
    durationDays: 'duracionDias'
  }
});

const toStored = (object, map) => Object.fromEntries(
  Object.entries(map).map(([en, es]) => [es, object && object[en] !== undefined ? object[en] : null])
);
const fromStored = (object, map) => Object.fromEntries(
  Object.entries(map).map(([en, es]) => [en, object && object[es] !== undefined ? object[es] : null])
);
const listOf = (value) => (Array.isArray(value) ? value : []);

class IndicatorRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  /** Computes the indicators of every program for `year` (one row per practice, aggregated in JavaScript). */
  async calculate(year) {
    const programColumn = schema.column('estudiante', 'idprograma');
    const tutorProgramColumn = schema.column('tutor_academico', 'idprograma');
    const statusColumn = schema.column('practica', 'estado');
    const advisorEvidence = schema.column('retroalimentacion_a', 'idevidencia');
    const studentEmail = schema.column('estudiante', 'correoinst', 'correinst');
    const tutorEmail = schema.column('tutor_academico', 'correoinst', 'correinst');
    const advisorEmail = schema.column('asesor_pedagogico', 'correoinst', 'correinst');
    const active = legacy.userStatus.toStored('active');

    const programs = await this.query(
      `SELECT pr.idprograma AS id, pr.nombre AS name, pr.facultad AS faculty,
              (SELECT COUNT(*)::int FROM estudiante e WHERE e.${programColumn} = pr.idprograma) AS "totalStudents",
              (SELECT COUNT(*)::int FROM estudiante e WHERE e.${programColumn} = pr.idprograma AND lower(trim(e.estado)) = '${active}') AS "activeStudents",
              (SELECT COUNT(*)::int FROM tutor_academico t WHERE t.${tutorProgramColumn} = pr.idprograma AND lower(trim(t.estado)) = '${active}') AS "activeTutors"
         FROM programa pr ORDER BY pr.nombre`
    );

    const evidenceOfPractice = `FROM evidenciaactividad ev JOIN actividad ac ON ac."idActividad" = ev."idActividad" WHERE ac."idPractica" = p."idPractica"`;
    const rows = await this.query(
      `SELECT p."idPractica" AS id, e.${programColumn} AS "programId", p."fechaInicio" AS "startDate", p."fechaFinal" AS "endDate",
              p."notaFinal" AS "finalGrade", p."observacionFinal" AS "finalObservation", lower(trim(p.${statusColumn})) AS status,
              tp."idTipoPractica" AS "typeId", tp.nombre AS "typeName", COALESCE(tp."horasRequeridas", 0) AS "requiredHours",
              i."nitEntidad" AS "taxId", i.nombre AS "institutionName", i.direccion AS "institutionAddress",
              i.encargado AS "institutionManager", i."correoInstitucion" AS "institutionEmail",
              e."numDocumento" AS "studentDocument", e."tipoDocumento" AS "studentDocumentType",
              e.nombre || ' ' || e.apellido AS "studentName", e.${studentEmail} AS "studentEmail", lower(trim(e.estado)) AS "studentStatus",
              t."numDocumento" AS "tutorDocument", t.nombre || ' ' || t.apellido AS "tutorName", t.${tutorEmail} AS "tutorEmail",
              a."numDocumento" AS "advisorDocument", a.nombre || ' ' || a.apellido AS "advisorName", a.${advisorEmail} AS "advisorEmail",
              (SELECT COUNT(*)::int FROM actividad ac WHERE ac."idPractica" = p."idPractica") AS activities,
              (SELECT COUNT(*)::int ${evidenceOfPractice}) AS evidences,
              (SELECT COALESCE(SUM(ev."horasRealizadas"), 0)::int ${evidenceOfPractice}) AS hours,
              (SELECT COUNT(*)::int FROM retroalimentacion_t rt JOIN evidenciaactividad ev ON ev."idEvidencia" = rt."idEvidencia"
                JOIN actividad ac ON ac."idActividad" = ev."idActividad" WHERE ac."idPractica" = p."idPractica") AS "tutorFeedback",
              (SELECT COUNT(*)::int FROM retroalimentacion_a ra JOIN evidenciaactividad ev ON ev."idEvidencia" = ra.${advisorEvidence}
                JOIN actividad ac ON ac."idActividad" = ev."idActividad" WHERE ac."idPractica" = p."idPractica") AS "advisorFeedback"
         FROM practica p
         JOIN estudiante e ON e."numDocumento" = p."numDocEstudiante"
         LEFT JOIN tipopractica tp ON tp."idTipoPractica" = p."idTipoPractica"
         LEFT JOIN institucion i ON i."nitEntidad" = p."nitInstitucion"
         LEFT JOIN tutor_academico t ON t."numDocumento" = p."numDocTutor"
         LEFT JOIN asesor_pedagogico a ON a."numDocumento" = p."numDocAsesor"
        WHERE EXTRACT(YEAR FROM p."fechaInicio") = $1
        ORDER BY p."fechaInicio", p."idPractica"`,
      [year]
    );

    const practices = rows.map((row) => ({
      ...row,
      status: legacy.practiceStatus.fromStored(row.status),
      studentStatus: legacy.userStatus.fromStored(row.studentStatus)
    }));
    return buildIndicators({ year, programs, practices });
  }

  /**
   * Replaces the stored indicators of `year`. The new documents are inserted FIRST and the old ones removed afterwards,
   * so a failure in the middle never leaves the year empty.
   */
  async save(year, indicators) {
    const Model = this.#model();
    if (!indicators.length) return [];
    const inserted = await Model.insertMany(indicators.map(IndicatorRepository.#toDocument));
    await Model.deleteMany({ anio: year, _id: { $nin: inserted.map((d) => d._id) } });
    return inserted;
  }

  /** Stored indicators; an empty list when Mongo is not configured (the dashboard still works). */
  async list(year) {
    const Model = accreditationIndicator();
    if (!Model) return [];
    const documents = await Model.find(year ? { anio: year } : {}).sort({ anio: -1, nombrePrograma: 1 }).lean();
    return documents.map(IndicatorRepository.#fromDocument);
  }

  /**
   * Real data of the five "Reports and Statistics" tabs (General, Types, Practice, Feedback, Institutions).
   * Everything below is computed from PostgreSQL on demand: no value is hardcoded. Legacy keys of the first version
   * are kept; the new keys feed the charts and the exports.
   */
  async dashboard() {
    const status = schema.column('practica', 'estado');
    const advisorEvidence = schema.column('retroalimentacion_a', 'idevidencia');
    const advisorDocument = schema.column('retroalimentacion_a', 'numdocasesor');
    const programColumn = schema.column('estudiante', 'idprograma');
    const S = `lower(trim(p.${status}))`;
    const ACTIVE = `'${legacy.practiceStatus.toStored('active')}'`;
    const COMPLETED = `'${legacy.practiceStatus.toStored('completed')}'`;
    const CANCELLED = `'${legacy.practiceStatus.toStored('cancelled')}'`;
    const months = lastMonths(new Date(), 12);
    const since = `(date_trunc('month', CURRENT_DATE) - interval '11 months')`;
    const one = (sql) => this.queryOne(sql);
    const many = (sql) => this.query(sql);
    const studentJoin = 'JOIN estudiante e ON e."numDocumento" = p."numDocEstudiante"';
    const institutionJoin = 'LEFT JOIN institucion i ON i."nitEntidad" = p."nitInstitucion"';
    const avgGrade = `COALESCE(ROUND(AVG(p."notaFinal") FILTER (WHERE p."notaFinal" > 0), 2), 0)::float`;
    const approval = `COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE p."notaFinal" >= 3) / NULLIF(COUNT(*) FILTER (WHERE p."notaFinal" > 0), 0), 1), 0)::float`;
    const noTutorFeedback = `NOT EXISTS (SELECT 1 FROM retroalimentacion_t rt JOIN evidenciaactividad ev ON ev."idEvidencia" = rt."idEvidencia"
            JOIN actividad a ON a."idActividad" = ev."idActividad" WHERE a."idPractica" = p."idPractica")`;
    const noAdvisorFeedback = `NOT EXISTS (SELECT 1 FROM retroalimentacion_a ra JOIN evidenciaactividad ev ON ev."idEvidencia" = ra.${advisorEvidence}
            JOIN actividad a ON a."idActividad" = ev."idActividad" WHERE a."idPractica" = p."idPractica")`;
    const practiceListSql = (condition) => `SELECT p."idPractica" AS code, COALESCE(i.nombre, 'No institution') AS institution,
              e.nombre || ' ' || e.apellido AS student
         FROM practica p ${studentJoin} ${institutionJoin}
        WHERE ${condition} ORDER BY p."fechaInicio" DESC, p."idPractica" LIMIT 100`;

    const [
      general, loggedHours, byMonthRows, byProgram, gradeBands, topInstitutions, topTutors,
      types, evidence, activityStates, endingSoon, overdue, progressRows,
      feedbackCounts, evidenceCoverage, tutorMonths, advisorMonths, activeTutors, activeAdvisors,
      noTutorCount, noAdvisorCount, withoutEvidenceList, withoutTutorList, withoutAdvisorList,
      institutionTotal, institutionRows, totalStudents
    ] = await Promise.all([
      one(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE ${S} = ${ACTIVE})::int AS active,
                  COUNT(*) FILTER (WHERE ${S} = ${COMPLETED})::int AS completed,
                  COUNT(*) FILTER (WHERE ${S} = ${CANCELLED})::int AS cancelled,
                  COUNT(*) FILTER (WHERE p."notaFinal" > 0)::int AS graded,
                  COUNT(*) FILTER (WHERE p."notaFinal" >= 3)::int AS approved,
                  ${avgGrade} AS "averageGrade",
                  COALESCE(SUM(tp."horasRequeridas") FILTER (WHERE ${S} <> ${CANCELLED}), 0)::int AS "requiredHours",
                  COUNT(DISTINCT p."numDocEstudiante")::int AS students, COUNT(DISTINCT p."numDocTutor")::int AS tutors,
                  COUNT(DISTINCT p."numDocAsesor")::int AS advisors, COUNT(DISTINCT p."nitInstitucion")::int AS institutions
             FROM practica p LEFT JOIN tipopractica tp ON tp."idTipoPractica" = p."idTipoPractica"`),
      one(`SELECT COALESCE(SUM(ev."horasRealizadas"), 0)::int AS hours FROM evidenciaactividad ev
             JOIN actividad ac ON ac."idActividad" = ev."idActividad" JOIN practica p ON p."idPractica" = ac."idPractica"
            WHERE ${S} <> ${CANCELLED}`),
      many(`SELECT to_char(p."fechaInicio", 'YYYY-MM') AS month, COUNT(*)::int AS count FROM practica p
             WHERE p."fechaInicio" >= ${since} GROUP BY 1`),
      many(`SELECT COALESCE(pr.nombre, 'No program') AS name, COUNT(*)::int AS count
              FROM practica p ${studentJoin} LEFT JOIN programa pr ON pr.idprograma = e.${programColumn}
             GROUP BY pr.nombre ORDER BY COUNT(*) DESC, pr.nombre`),
      one(`SELECT COUNT(*) FILTER (WHERE "notaFinal" >= 4)::int AS high,
                  COUNT(*) FILTER (WHERE "notaFinal" >= 3 AND "notaFinal" < 4)::int AS mid,
                  COUNT(*) FILTER (WHERE "notaFinal" > 0 AND "notaFinal" < 3)::int AS low,
                  COUNT(*) FILTER (WHERE "notaFinal" <= 0)::int AS ungraded FROM practica`),
      many(`SELECT COALESCE(i.nombre, 'No institution') AS name, COUNT(*)::int AS count
              FROM practica p ${institutionJoin} GROUP BY i.nombre ORDER BY COUNT(*) DESC, i.nombre LIMIT 5`),
      many(`SELECT t.nombre || ' ' || t.apellido AS name, COUNT(*)::int AS count
              FROM practica p LEFT JOIN tutor_academico t ON t."numDocumento" = p."numDocTutor"
             GROUP BY t.nombre, t.apellido ORDER BY COUNT(*) DESC, t.nombre, t.apellido LIMIT 5`),
      many(`SELECT COALESCE(tp.nombre, 'No type') AS name, tp."numSemestre" AS semester, COALESCE(tp."horasRequeridas", 0)::int AS "requiredHours",
                   COUNT(*)::int AS practices, COUNT(DISTINCT p."numDocEstudiante")::int AS students,
                   COALESCE(ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1), 0)::float AS percent,
                   COUNT(*) FILTER (WHERE ${S} = ${ACTIVE})::int AS active,
                   COUNT(*) FILTER (WHERE ${S} = ${COMPLETED})::int AS completed,
                   COUNT(*) FILTER (WHERE ${S} = ${CANCELLED})::int AS cancelled,
                   ${avgGrade} AS "averageGrade", ${approval} AS "approvalRate"
              FROM practica p LEFT JOIN tipopractica tp ON tp."idTipoPractica" = p."idTipoPractica"
             GROUP BY tp.nombre, tp."numSemestre", tp."horasRequeridas" ORDER BY COUNT(*) DESC, tp.nombre`),
      one(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM actividad a JOIN evidenciaactividad ev ON ev."idActividad" = a."idActividad"
                    WHERE a."idPractica" = p."idPractica"))::int AS "withoutEvidence",
                  COUNT(*) FILTER (WHERE ${S} = ${ACTIVE})::int AS active,
                  COUNT(*) FILTER (WHERE ${S} <> ${ACTIVE})::int AS closed
             FROM practica p`),
      one(`WITH act AS (
             SELECT COALESCE(ac."notaObtenida", 0) AS grade,
                    (SELECT COUNT(*) FROM evidenciaactividad ev WHERE ev."idActividad" = ac."idActividad") AS evidence,
                    (SELECT COUNT(*) FROM retroalimentacion_t rt JOIN evidenciaactividad ev ON ev."idEvidencia" = rt."idEvidencia"
                      WHERE ev."idActividad" = ac."idActividad") AS feedback
               FROM actividad ac)
           SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE grade > 0)::int AS graded,
                  COUNT(*) FILTER (WHERE grade <= 0 AND feedback > 0)::int AS completed,
                  COUNT(*) FILTER (WHERE grade <= 0 AND feedback = 0 AND evidence > 0)::int AS "pendingReview",
                  COUNT(*) FILTER (WHERE grade <= 0 AND feedback = 0 AND evidence = 0)::int AS pending,
                  COALESCE(ROUND(AVG(grade) FILTER (WHERE grade > 0), 2), 0)::float AS "averageGrade"
             FROM act`),
      many(`SELECT p."idPractica" AS code, e.nombre || ' ' || e.apellido AS student, COALESCE(i.nombre, 'No institution') AS institution,
                   p."fechaFinal" AS "endDate", (p."fechaFinal" - CURRENT_DATE)::int AS "daysLeft"
              FROM practica p ${studentJoin} ${institutionJoin}
             WHERE ${S} = ${ACTIVE} AND p."fechaFinal" >= CURRENT_DATE AND p."fechaFinal" <= CURRENT_DATE + 30
             ORDER BY p."fechaFinal", p."idPractica" LIMIT 100`),
      many(`SELECT p."idPractica" AS code, e.nombre || ' ' || e.apellido AS student, COALESCE(i.nombre, 'No institution') AS institution,
                   p."fechaFinal" AS "endDate", (CURRENT_DATE - p."fechaFinal")::int AS "daysOverdue"
              FROM practica p ${studentJoin} ${institutionJoin}
             WHERE ${S} = ${ACTIVE} AND p."fechaFinal" < CURRENT_DATE
             ORDER BY p."fechaFinal", p."idPractica" LIMIT 100`),
      many(`SELECT p."idPractica" AS code, e.nombre || ' ' || e.apellido AS student,
                   COALESCE(SUM(ev."horasRealizadas"), 0)::int AS logged, COALESCE(tp."horasRequeridas", 0)::int AS required
              FROM practica p ${studentJoin} LEFT JOIN tipopractica tp ON tp."idTipoPractica" = p."idTipoPractica"
              LEFT JOIN actividad ac ON ac."idPractica" = p."idPractica"
              LEFT JOIN evidenciaactividad ev ON ev."idActividad" = ac."idActividad"
             WHERE ${S} = ${ACTIVE}
             GROUP BY p."idPractica", e.nombre, e.apellido, tp."horasRequeridas"`),
      one(`SELECT (SELECT COUNT(*)::int FROM retroalimentacion_t rt JOIN evidenciaactividad ev ON ev."idEvidencia" = rt."idEvidencia"
                    JOIN actividad a ON a."idActividad" = ev."idActividad" JOIN practica p ON p."idPractica" = a."idPractica") AS tutor,
                  (SELECT COUNT(*)::int FROM retroalimentacion_a ra JOIN evidenciaactividad ev ON ev."idEvidencia" = ra.${advisorEvidence}
                    JOIN actividad a ON a."idActividad" = ev."idActividad" JOIN practica p ON p."idPractica" = a."idPractica") AS advisor`),
      one(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM retroalimentacion_t rt WHERE rt."idEvidencia" = ev."idEvidencia"))::int AS "withTutor",
                  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM retroalimentacion_a ra WHERE ra.${advisorEvidence} = ev."idEvidencia"))::int AS "withAdvisor",
                  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM retroalimentacion_t rt WHERE rt."idEvidencia" = ev."idEvidencia")
                    AND EXISTS (SELECT 1 FROM retroalimentacion_a ra WHERE ra.${advisorEvidence} = ev."idEvidencia"))::int AS "withBoth"
             FROM evidenciaactividad ev`),
      many(`SELECT to_char(fecha::timestamp, 'YYYY-MM') AS month, COUNT(*)::int AS tutor FROM retroalimentacion_t
             WHERE fecha::timestamp >= ${since} GROUP BY 1`),
      many(`SELECT to_char(fecha::timestamp, 'YYYY-MM') AS month, COUNT(*)::int AS advisor FROM retroalimentacion_a
             WHERE fecha::timestamp >= ${since} GROUP BY 1`),
      many(`SELECT t.nombre || ' ' || t.apellido AS name, COUNT(*)::int AS count
              FROM retroalimentacion_t rt JOIN tutor_academico t ON t."numDocumento" = rt."numDocTutor"
             GROUP BY t.nombre, t.apellido ORDER BY COUNT(*) DESC, t.nombre, t.apellido LIMIT 5`),
      many(`SELECT a.nombre || ' ' || a.apellido AS name, COUNT(*)::int AS count
              FROM retroalimentacion_a ra JOIN asesor_pedagogico a ON a."numDocumento" = ra.${advisorDocument}
             GROUP BY a.nombre, a.apellido ORDER BY COUNT(*) DESC, a.nombre, a.apellido LIMIT 5`),
      one(`SELECT COUNT(*)::int AS total FROM practica p WHERE ${noTutorFeedback}`),
      one(`SELECT COUNT(*)::int AS total FROM practica p WHERE ${noAdvisorFeedback}`),
      many(practiceListSql(`NOT EXISTS (SELECT 1 FROM actividad a JOIN evidenciaactividad ev ON ev."idActividad" = a."idActividad"
                           WHERE a."idPractica" = p."idPractica")`)),
      many(practiceListSql(noTutorFeedback)),
      many(practiceListSql(noAdvisorFeedback)),
      one('SELECT COUNT(*)::int AS total FROM institucion'),
      many(`SELECT COALESCE(i.nombre, 'No institution') AS name, i."nitEntidad" AS "taxId", i.direccion AS address,
                   i.encargado AS manager, i."correoInstitucion" AS email,
                   COUNT(*)::int AS practices,
                   COUNT(DISTINCT p."numDocEstudiante")::int AS students,
                   COUNT(DISTINCT p."numDocEstudiante") FILTER (WHERE ${S} = ${ACTIVE})::int AS "activeStudents",
                   COUNT(DISTINCT p."numDocEstudiante") FILTER (WHERE ${S} = ${COMPLETED})::int AS "completedStudents",
                   COUNT(*) FILTER (WHERE ${S} = ${ACTIVE})::int AS "activePractices",
                   COUNT(*) FILTER (WHERE ${S} = ${COMPLETED})::int AS "completedPractices",
                   ${avgGrade} AS "averageGrade"
              FROM practica p ${institutionJoin}
             GROUP BY i.nombre, i."nitEntidad", i.direccion, i.encargado, i."correoInstitucion"
             ORDER BY COUNT(DISTINCT p."numDocEstudiante") DESC, i.nombre`),
      one('SELECT COUNT(DISTINCT p."numDocEstudiante")::int AS total FROM practica p')
    ]);

    // ----- derived figures -----
    const progress = progressRows
      .map((r) => ({ ...r, percent: r.required ? Math.round((100 * r.logged) / r.required) : 0 }))
      .sort((a, b) => a.percent - b.percent || a.code.localeCompare(b.code));
    const feedbackMonths = fillMonths([
      ...tutorMonths, ...advisorMonths
    ].reduce((acc, r) => {
      const row = acc.find((x) => x.month === r.month) || (acc.push({ month: r.month }), acc[acc.length - 1]);
      Object.assign(row, r);
      return acc;
    }, []), months, ['tutor', 'advisor']);
    const withAny = evidenceCoverage.withTutor + evidenceCoverage.withAdvisor - evidenceCoverage.withBoth;
    const typeRows = types;
    const share = (n) => (general.total ? percent(n, general.total) : 0);

    return {
      generatedAt: new Date().toISOString(),
      general: {
        totalPractices: general.total,
        activePractices: general.active,
        completedPractices: general.completed,
        cancelledPractices: general.cancelled,
        gradedPractices: general.graded,
        averageGrade: general.averageGrade,
        approvalRate: percent(general.approved, general.graded),
        students: general.students,
        tutors: general.tutors,
        advisors: general.advisors,
        institutions: general.institutions,
        requiredHours: general.requiredHours,
        loggedHours: loggedHours.hours,
        hoursCompletion: percent(loggedHours.hours, general.requiredHours),
        statusBreakdown: [
          { label: 'Active', count: general.active, percent: share(general.active) },
          { label: 'Completed', count: general.completed, percent: share(general.completed) },
          { label: 'Cancelled', count: general.cancelled, percent: share(general.cancelled) }
        ],
        gradeBands: [
          { label: '4.0 - 5.0', count: gradeBands.high },
          { label: '3.0 - 3.9', count: gradeBands.mid },
          { label: 'Below 3.0', count: gradeBands.low },
          { label: 'Not graded', count: gradeBands.ungraded }
        ],
        byMonth: fillMonths(byMonthRows, months, ['count']),
        byProgram,
        topInstitutions,
        topTutors
      },
      types: typeRows,
      practice: {
        total: evidence.total,
        withoutEvidence: evidence.withoutEvidence,
        status: [
          { label: 'Active', count: evidence.active, percent: evidence.total ? Math.round((1000 * evidence.active) / evidence.total) / 10 : 0 },
          { label: 'Closed', count: evidence.closed, percent: evidence.total ? Math.round((1000 * evidence.closed) / evidence.total) / 10 : 0 }
        ],
        totalStudents: totalStudents.total,
        withoutEvidenceList,
        activities: activityStates,
        hours: { required: general.requiredHours, logged: loggedHours.hours, percent: percent(loggedHours.hours, general.requiredHours) },
        endingSoon,
        overdue,
        lowestProgress: progress.slice(0, 10)
      },
      feedback: {
        tutorFeedback: feedbackCounts.tutor,
        advisorFeedback: feedbackCounts.advisor,
        practicesWithoutTutorFeedback: noTutorCount.total,
        practicesWithoutAdvisorFeedback: noAdvisorCount.total,
        topTutors: activeTutors,
        topAdvisors: activeAdvisors,
        withoutTutorFeedbackList: withoutTutorList,
        withoutAdvisorFeedbackList: withoutAdvisorList,
        evidence: {
          total: evidenceCoverage.total,
          both: evidenceCoverage.withBoth,
          tutorOnly: evidenceCoverage.withTutor - evidenceCoverage.withBoth,
          advisorOnly: evidenceCoverage.withAdvisor - evidenceCoverage.withBoth,
          none: evidenceCoverage.total - withAny,
          reviewedPercent: percent(withAny, evidenceCoverage.total)
        },
        byMonth: feedbackMonths
      },
      institutions: {
        total: institutionTotal.total,
        withActiveStudents: institutionRows.filter((row) => row.activePractices > 0).length,
        completedOnly: institutionRows.filter((row) => row.activePractices === 0 && row.completedPractices > 0).length,
        withPractices: institutionRows.length,
        totalStudents: totalStudents.total,
        distribution: institutionRows.map((row) => ({ name: row.name, count: row.students })),
        details: institutionRows.map((row) => ({
          institution: row.name,
          taxId: row.taxId,
          address: row.address,
          manager: row.manager,
          email: row.email,
          students: row.students,
          practices: row.practices,
          activeStudents: row.activeStudents,
          completedStudents: row.completedStudents,
          activePractices: row.activePractices,
          completedPractices: row.completedPractices,
          averageGrade: row.averageGrade
        }))
      }
    };
  }

  /** Headline numbers of the director dashboard. */
  summary() {
    const status = schema.column('practica', 'estado');
    const active = legacy.userStatus.toStored('active');
    return this.queryOne(
      `SELECT (SELECT COUNT(*)::int FROM practica) AS practices,
              (SELECT COUNT(*)::int FROM practica WHERE lower(trim(${status})) = '${legacy.practiceStatus.toStored('active')}') AS "activePractices",
              (SELECT COUNT(*)::int FROM estudiante WHERE lower(trim(estado)) = '${active}') AS students,
              (SELECT COUNT(*)::int FROM tutor_academico WHERE lower(trim(estado)) = '${active}') AS tutors,
              (SELECT COUNT(*)::int FROM asesor_pedagogico WHERE lower(trim(estado)) = '${active}') AS advisors,
              (SELECT COUNT(*)::int FROM institucion) AS institutions,
              (SELECT ROUND(AVG("notaFinal"),2)::float FROM practica WHERE "notaFinal" > 0) AS "averageGrade"`
    );
  }

  #model() {
    const Model = accreditationIndicator();
    if (!Model) throw new Error('Mongo (primary) is not configured');
    return Model;
  }

  // ----- translation to / from the persisted (legacy) document shape -----

  static #practiceToStored(d) {
    return {
      ...toStored(d, MAP.practice),
      estadoEstudiante: legacy.userStatus.toStored(d.studentStatus),
      estado: legacy.practiceStatus.toStored(d.status)
    };
  }

  static #practiceFromStored(d) {
    return {
      ...fromStored(d, MAP.practice),
      studentStatus: d && d.estadoEstudiante != null ? legacy.userStatus.fromStored(d.estadoEstudiante) : null,
      status: d && d.estado != null ? legacy.practiceStatus.fromStored(d.estado) : null
    };
  }

  static #toDocument(i) {
    return {
      anio: i.year,
      idPrograma: i.programId,
      nombrePrograma: i.programName,
      facultadPrograma: i.faculty,
      totalEstudiantes: i.totalStudents,
      totalEstudiantesActivos: i.activeStudentsTotal,
      totalTutoresActivos: i.activeTutors,
      resumenPracticas: toStored(i.summary, MAP.summary),
      practicasPorTipo: i.practicesByType.map((t) => ({ ...toStored(t, MAP.type), semestre: t.semester ?? null })),
      distribucionNotas: i.gradeDistribution.map((g) => toStored(g, MAP.grade)),
      acompanamientoDocente: toStored(i.teacherSupport, MAP.support),
      entidadesVinculadas: i.partnerInstitutions.map((p) => toStored(p, MAP.institution)),
      tutores: i.tutors.map((t) => toStored(t, MAP.teacher)),
      asesores: i.advisors.map((a) => toStored(a, MAP.teacher)),
      detallePracticas: i.practices.map(IndicatorRepository.#practiceToStored),
      tasaDesercion: i.dropoutRate,
      duracionPromedioPracticasDias: i.averagePracticeDurationDays,
      fechaGeneracion: new Date(i.generatedAt),
      versionIndicador: i.version
    };
  }

  static #fromDocument(d) {
    return {
      id: String(d._id),
      year: d.anio,
      programId: d.idPrograma,
      programName: d.nombrePrograma,
      faculty: d.facultadPrograma ?? null,
      version: d.versionIndicador ?? null,
      generatedAt: d.fechaGeneracion ? new Date(d.fechaGeneracion).toISOString() : null,
      totalStudents: d.totalEstudiantes ?? null,
      activeStudentsTotal: d.totalEstudiantesActivos,
      activeTutors: d.totalTutoresActivos ?? null,
      summary: fromStored(d.resumenPracticas, MAP.summary),
      practicesByType: listOf(d.practicasPorTipo).map((t) => ({ ...fromStored(t, MAP.type), semester: t.semestre ?? null })),
      gradeDistribution: listOf(d.distribucionNotas).map((g) => fromStored(g, MAP.grade)),
      teacherSupport: {
        ...fromStored(d.acompanamientoDocente, MAP.support),
        tutorFeedbackCount: d.acompanamientoDocente?.retroalimentacionesTutor ?? 0,
        advisorFeedbackCount: d.acompanamientoDocente?.retroalimentacionesAsesor ?? 0
      },
      partnerInstitutions: listOf(d.entidadesVinculadas).map((p) => fromStored(p, MAP.institution)),
      tutors: listOf(d.tutores).map((t) => fromStored(t, MAP.teacher)),
      advisors: listOf(d.asesores).map((a) => fromStored(a, MAP.teacher)),
      practices: listOf(d.detallePracticas).map(IndicatorRepository.#practiceFromStored),
      dropoutRate: d.tasaDesercion,
      averagePracticeDurationDays: d.duracionPromedioPracticasDias,
      notes: d.observaciones
    };
  }
}

module.exports = IndicatorRepository;
