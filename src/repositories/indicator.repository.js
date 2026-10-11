'use strict';
const BaseRepository = require('./base.repository');
const schema = require('../infrastructure/schema-resolver');
const legacy = require('./legacy-values');
const accreditationIndicator = require('../models/accreditation-indicator.model');

/**
 * Accreditation indicators are COMPUTED from PostgreSQL and STORED in MongoDB (collection
 * `indicadoresacreditacion`). A `notaFinal` of 0 means "not graded" (the column is NOT NULL),
 * hence the `notaFinal > 0` filters.
 *
 * Indicator shape exposed to the rest of the app:
 *   { year, programId, programName, activeStudentsTotal,
 *     practicesByType: [{ type, count, averageGrade, approvalRate }],
 *     gradeDistribution: [{ range, studentCount }],
 *     teacherSupport: { tutorFeedbackCount, advisorFeedbackCount },
 *     partnerInstitutions: [{ institutionName, practiceCount }],
 *     dropoutRate, averagePracticeDurationDays }
 */
class IndicatorRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  /** Computes the indicators of every program for `year`. */
  async calculate(year) {
    const programColumn = schema.column('estudiante', 'idprograma');
    const statusColumn = schema.column('practica', 'estado');
    const advisorEvidence = schema.column('retroalimentacion_a', 'idevidencia');
    const cancelled = legacy.practiceStatus.toStored('cancelled');
    const active = legacy.userStatus.toStored('active');
    // Practices of the program in the year
    const scope = `FROM practica p JOIN estudiante e ON e."numDocumento" = p."numDocEstudiante"
                   WHERE e.${programColumn} = $1 AND EXTRACT(YEAR FROM p."fechaInicio") = $2`;
    const programs = await this.query(
      `SELECT pr.idprograma AS id, pr.nombre AS name,
              COUNT(e."numDocumento") FILTER (WHERE lower(trim(e.estado)) = '${active}')::int AS "activeStudents"
         FROM programa pr LEFT JOIN estudiante e ON e.${programColumn} = pr.idprograma
        GROUP BY pr.idprograma, pr.nombre ORDER BY pr.nombre`
    );

    const indicators = [];
    for (const program of programs) {
      const params = [program.id, year];
      const practicesByType = await this.query(
        `SELECT COALESCE(tp.nombre,'No type') AS type, COUNT(*)::int AS count,
                COALESCE(ROUND(AVG(p."notaFinal") FILTER (WHERE p."notaFinal" > 0), 2), 0)::float AS "averageGrade",
                COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE p."notaFinal" >= 3) / NULLIF(COUNT(*) FILTER (WHERE p."notaFinal" > 0), 0), 1), 0)::float AS "approvalRate"
           FROM practica p JOIN estudiante e ON e."numDocumento" = p."numDocEstudiante"
           LEFT JOIN tipopractica tp ON tp."idTipoPractica" = p."idTipoPractica"
          WHERE e.${programColumn} = $1 AND EXTRACT(YEAR FROM p."fechaInicio") = $2 GROUP BY tp.nombre`, params);
      const gradeDistribution = await this.query(
        `SELECT "range", COUNT(*)::int AS "studentCount" FROM (
           SELECT CASE WHEN p."notaFinal" >= 4 THEN '4.0-5.0' WHEN p."notaFinal" >= 3 THEN '3.0-3.9' ELSE '0.1-2.9' END AS "range"
             ${scope} AND p."notaFinal" > 0) x GROUP BY "range"`, params);
      const feedback = await this.queryOne(
        `SELECT (SELECT COUNT(*)::int FROM retroalimentacion_t rt JOIN evidenciaactividad ev ON ev."idEvidencia" = rt."idEvidencia"
                  JOIN actividad ac ON ac."idActividad" = ev."idActividad" JOIN practica p ON p."idPractica" = ac."idPractica"
                  JOIN estudiante e ON e."numDocumento" = p."numDocEstudiante"
                 WHERE e.${programColumn} = $1 AND EXTRACT(YEAR FROM p."fechaInicio") = $2) AS tutor,
                (SELECT COUNT(*)::int FROM retroalimentacion_a ra JOIN evidenciaactividad ev ON ev."idEvidencia" = ra.${advisorEvidence}
                  JOIN actividad ac ON ac."idActividad" = ev."idActividad" JOIN practica p ON p."idPractica" = ac."idPractica"
                  JOIN estudiante e ON e."numDocumento" = p."numDocEstudiante"
                 WHERE e.${programColumn} = $1 AND EXTRACT(YEAR FROM p."fechaInicio") = $2) AS advisor`, params);
      const partnerInstitutions = await this.query(
        `SELECT COALESCE(i.nombre,'No institution') AS "institutionName", COUNT(*)::int AS "practiceCount"
           FROM practica p JOIN estudiante e ON e."numDocumento" = p."numDocEstudiante"
           LEFT JOIN institucion i ON i."nitEntidad" = p."nitInstitucion"
          WHERE e.${programColumn} = $1 AND EXTRACT(YEAR FROM p."fechaInicio") = $2 GROUP BY i.nombre`, params);
      const totals = await this.queryOne(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE lower(trim(p.${statusColumn})) = '${cancelled}')::int AS cancelled,
                COALESCE(ROUND(AVG(p."fechaFinal" - p."fechaInicio"))::int, 0) AS days ${scope}`, params);

      indicators.push({
        year,
        programId: program.id,
        programName: program.name,
        activeStudentsTotal: program.activeStudents,
        practicesByType,
        gradeDistribution,
        teacherSupport: { tutorFeedbackCount: feedback.tutor, advisorFeedbackCount: feedback.advisor },
        partnerInstitutions,
        dropoutRate: totals.total ? Math.round((1000 * totals.cancelled) / totals.total) / 10 : 0,
        averagePracticeDurationDays: totals.days
      });
    }
    return indicators;
  }

  /** Replaces the stored indicators of `year`. */
  async save(year, indicators) {
    const Model = this.#model();
    await Model.deleteMany({ anio: year });
    return indicators.length ? Model.insertMany(indicators.map(IndicatorRepository.#toDocument)) : [];
  }

  /** Stored indicators; an empty list when Mongo is not configured (the dashboard still works). */
  async list(year) {
    const Model = accreditationIndicator();
    if (!Model) return [];
    const documents = await Model.find(year ? { anio: year } : {}).sort({ anio: -1, nombrePrograma: 1 }).lean();
    return documents.map(IndicatorRepository.#fromDocument);
  }

  /**
   * Real data of the five "Reports and Statistics" tabs (General, Types, Practice, Feedback,
   * Institutions). Everything below is computed from PostgreSQL on demand: no value is hardcoded.
   */
  async dashboard() {
    const status = schema.column('practica', 'estado');
    const advisorEvidence = schema.column('retroalimentacion_a', 'idevidencia');
    const advisorDocument = schema.column('retroalimentacion_a', 'numdocasesor');
    const active = legacy.practiceStatus.toStored('active');
    const completed = legacy.practiceStatus.toStored('completed');
    const params = [active, completed];

    const general = await this.queryOne(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE lower(trim(p.${status})) = $1)::int AS active,
              COUNT(*) FILTER (WHERE lower(trim(p.${status})) = $2)::int AS completed
         FROM practica p`, params);
    const topInstitutions = await this.query(
      `SELECT COALESCE(i.nombre, 'No institution') AS name, COUNT(*)::int AS count
         FROM practica p LEFT JOIN institucion i ON i."nitEntidad" = p."nitInstitucion"
        GROUP BY i.nombre ORDER BY COUNT(*) DESC, i.nombre LIMIT 5`);
    const topTutors = await this.query(
      `SELECT t.nombre || ' ' || t.apellido AS name, COUNT(*)::int AS count
         FROM practica p LEFT JOIN tutor_academico t ON t."numDocumento" = p."numDocTutor"
        GROUP BY t.nombre, t.apellido ORDER BY COUNT(*) DESC, t.nombre, t.apellido LIMIT 5`);

    // Types: one row per practice type with its students and its share of the practices
    const types = await this.query(
      `SELECT COALESCE(tp.nombre, 'No type') AS name,
              COUNT(DISTINCT p."numDocEstudiante")::int AS students,
              COALESCE(ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1), 0)::float AS percent
         FROM practica p LEFT JOIN tipopractica tp ON tp."idTipoPractica" = p."idTipoPractica"
        GROUP BY tp.nombre ORDER BY COUNT(*) DESC, tp.nombre`);

    // Practices (the former "Logbooks" tab): evidence coverage and status of the logbook
    const evidence = await this.queryOne(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE NOT EXISTS (
                SELECT 1 FROM actividad a JOIN evidenciaactividad ev ON ev."idActividad" = a."idActividad"
                 WHERE a."idPractica" = p."idPractica"))::int AS "withoutEvidence"
         FROM practica p`);
    const logbookStatus = await this.queryOne(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE lower(trim(p.${status})) = $1)::int AS active,
              COUNT(*) FILTER (WHERE lower(trim(p.${status})) <> $1)::int AS closed
         FROM practica p`, [active]);
    const withoutEvidenceList = await this.query(
      `SELECT p."idPractica" AS code, COALESCE(i.nombre, 'No institution') AS institution,
              e.nombre || ' ' || e.apellido AS student
         FROM practica p
         JOIN estudiante e   ON e."numDocumento" = p."numDocEstudiante"
         LEFT JOIN institucion i ON i."nitEntidad" = p."nitInstitucion"
        WHERE NOT EXISTS (
          SELECT 1 FROM actividad a JOIN evidenciaactividad ev ON ev."idActividad" = a."idActividad"
           WHERE a."idPractica" = p."idPractica")
        ORDER BY p."fechaInicio" DESC, p."idPractica" LIMIT 100`);

    // Feedback: how much tutoring the practices actually get
    const feedbackCounts = await this.queryOne(
      `SELECT (SELECT COUNT(*)::int FROM retroalimentacion_t rt
                JOIN evidenciaactividad ev ON ev."idEvidencia" = rt."idEvidencia"
                JOIN actividad a ON a."idActividad" = ev."idActividad"
                JOIN practica p ON p."idPractica" = a."idPractica") AS tutor,
              (SELECT COUNT(*)::int FROM retroalimentacion_a ra
                JOIN evidenciaactividad ev ON ev."idEvidencia" = ra.${advisorEvidence}
                JOIN actividad a ON a."idActividad" = ev."idActividad"
                JOIN practica p ON p."idPractica" = a."idPractica") AS advisor`);
    const activeTutors = await this.query(
      `SELECT t.nombre || ' ' || t.apellido AS name, COUNT(*)::int AS count
         FROM retroalimentacion_t rt JOIN tutor_academico t ON t."numDocumento" = rt."numDocTutor"
        GROUP BY t.nombre, t.apellido ORDER BY COUNT(*) DESC, t.nombre, t.apellido LIMIT 5`);
    const activeAdvisors = await this.query(
      `SELECT a.nombre || ' ' || a.apellido AS name, COUNT(*)::int AS count
         FROM retroalimentacion_a ra JOIN asesor_pedagogico a ON a."numDocumento" = ra.${advisorDocument}
        GROUP BY a.nombre, a.apellido ORDER BY COUNT(*) DESC, a.nombre, a.apellido LIMIT 5`);
    const noTutorFeedbackWhere = `WHERE NOT EXISTS (
          SELECT 1 FROM retroalimentacion_t rt
            JOIN evidenciaactividad ev ON ev."idEvidencia" = rt."idEvidencia"
            JOIN actividad a ON a."idActividad" = ev."idActividad"
           WHERE a."idPractica" = p."idPractica")`;
    const withoutTutorFeedbackCount = await this.queryOne(
      `SELECT COUNT(*)::int AS total FROM practica p ${noTutorFeedbackWhere}`);
    const withoutTutorFeedback = await this.query(
      `SELECT p."idPractica" AS code, COALESCE(i.nombre, 'No institution') AS institution,
              e.nombre || ' ' || e.apellido AS student
         FROM practica p
         JOIN estudiante e   ON e."numDocumento" = p."numDocEstudiante"
         LEFT JOIN institucion i ON i."nitEntidad" = p."nitInstitucion"
        ${noTutorFeedbackWhere}
        ORDER BY p."fechaInicio" DESC, p."idPractica" LIMIT 100`);

    // Institutions: student teachers hosted, split by practice status
    const institutionTotal = await this.queryOne(`SELECT COUNT(*)::int AS total FROM institucion`);
    const institutionRows = await this.query(
      `SELECT COALESCE(i.nombre, 'No institution') AS name,
              COUNT(DISTINCT p."numDocEstudiante")::int AS students,
              COUNT(DISTINCT p."numDocEstudiante") FILTER (WHERE lower(trim(p.${status})) = $1)::int AS "activeStudents",
              COUNT(DISTINCT p."numDocEstudiante") FILTER (WHERE lower(trim(p.${status})) = $2)::int AS "completedStudents",
              COUNT(*) FILTER (WHERE lower(trim(p.${status})) = $1)::int AS "activePractices",
              COUNT(*) FILTER (WHERE lower(trim(p.${status})) = $2)::int AS "completedPractices"
         FROM practica p LEFT JOIN institucion i ON i."nitEntidad" = p."nitInstitucion"
        GROUP BY i.nombre ORDER BY COUNT(DISTINCT p."numDocEstudiante") DESC, i.nombre`, params);
    const totalStudents = await this.queryOne(
      `SELECT COUNT(DISTINCT p."numDocEstudiante")::int AS total FROM practica p`);

    const withPractices = institutionRows.length;
    return {
      general: {
        totalPractices: general.total,
        activePractices: general.active,
        completedPractices: general.completed,
        topInstitutions,
        topTutors
      },
      types,
      practice: {
        total: evidence.total,
        withoutEvidence: evidence.withoutEvidence,
        status: [
          { label: 'Active', count: logbookStatus.active, percent: logbookStatus.total ? Math.round((1000 * logbookStatus.active) / logbookStatus.total) / 10 : 0 },
          { label: 'Closed', count: logbookStatus.closed, percent: logbookStatus.total ? Math.round((1000 * logbookStatus.closed) / logbookStatus.total) / 10 : 0 }
        ],
        totalStudents: totalStudents.total,
        withoutEvidenceList
      },
      feedback: {
        tutorFeedback: feedbackCounts.tutor,
        advisorFeedback: feedbackCounts.advisor,
        practicesWithoutTutorFeedback: withoutTutorFeedbackCount.total,
        topTutors: activeTutors,
        topAdvisors: activeAdvisors,
        withoutTutorFeedbackList: withoutTutorFeedback
      },
      institutions: {
        total: institutionTotal.total,
        withActiveStudents: institutionRows.filter((row) => row.activePractices > 0).length,
        completedOnly: institutionRows.filter((row) => row.activePractices === 0 && row.completedPractices > 0).length,
        withPractices,
        totalStudents: totalStudents.total,
        distribution: institutionRows.map((row) => ({ name: row.name, count: row.students })),
        details: institutionRows.map((row) => ({
          institution: row.name,
          activeStudents: row.activeStudents,
          completedStudents: row.completedStudents
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

  static #toDocument(i) {
    return {
      anio: i.year,
      idPrograma: i.programId,
      nombrePrograma: i.programName,
      totalEstudiantesActivos: i.activeStudentsTotal,
      practicasPorTipo: i.practicesByType.map((t) => ({ tipo: t.type, cantidad: t.count, promedioNota: t.averageGrade, porcentajeAprobacion: t.approvalRate })),
      distribucionNotas: i.gradeDistribution.map((g) => ({ rango: g.range, cantidadEstudiantes: g.studentCount })),
      acompanamientoDocente: {
        retroalimentacionesTutor: i.teacherSupport.tutorFeedbackCount,
        retroalimentacionesAsesor: i.teacherSupport.advisorFeedbackCount
      },
      entidadesVinculadas: i.partnerInstitutions.map((p) => ({ nombreEntidad: p.institutionName, cantidadPracticas: p.practiceCount })),
      tasaDesercion: i.dropoutRate,
      duracionPromedioPracticasDias: i.averagePracticeDurationDays
    };
  }

  static #fromDocument(d) {
    return {
      year: d.anio,
      programId: d.idPrograma,
      programName: d.nombrePrograma,
      activeStudentsTotal: d.totalEstudiantesActivos,
      practicesByType: (d.practicasPorTipo || []).map((t) => ({ type: t.tipo, count: t.cantidad, averageGrade: t.promedioNota, approvalRate: t.porcentajeAprobacion })),
      gradeDistribution: (d.distribucionNotas || []).map((g) => ({ range: g.rango, studentCount: g.cantidadEstudiantes })),
      teacherSupport: {
        tutorFeedbackCount: d.acompanamientoDocente?.retroalimentacionesTutor ?? 0,
        advisorFeedbackCount: d.acompanamientoDocente?.retroalimentacionesAsesor ?? 0
      },
      partnerInstitutions: (d.entidadesVinculadas || []).map((p) => ({ institutionName: p.nombreEntidad, practiceCount: p.cantidadPracticas })),
      dropoutRate: d.tasaDesercion,
      averagePracticeDurationDays: d.duracionPromedioPracticasDias,
      notes: d.observaciones
    };
  }
}

module.exports = IndicatorRepository;
