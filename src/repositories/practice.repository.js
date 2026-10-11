'use strict';
const BaseRepository = require('./base.repository');
const schema = require('../infrastructure/schema-resolver');
const legacy = require('./legacy-values');
const { generateId } = require('../utils/id-generator');
const { PRACTICE_STATUS, ACTIVITIES_PER_PRACTICE } = require('../config/constants');

class PracticeRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  /** The `"estado "` column of `practica` may carry a trailing space, so it is resolved by name. */
  get #status() {
    return schema.column('practica', 'estado');
  }

  #detailQuery() {
    return `
    SELECT p."idPractica" AS id, p."fechaInicio" AS "startDate", p."fechaFinal" AS "endDate",
           p."notaFinal" AS "finalGrade", p."observacionFinal" AS "finalObservation",
           lower(trim(p.${this.#status})) AS status,
           p."idTipoPractica" AS "typeId", p."nitInstitucion" AS "institutionId",
           p."numDocEstudiante" AS "studentDocument", p."numDocTutor" AS "tutorDocument", p."numDocAsesor" AS "advisorDocument",
           tp.nombre AS "typeName", tp."horasRequeridas" AS "requiredHours", tp."numSemestre" AS semester,
           i.nombre AS "institutionName",
           e.nombre || ' ' || e.apellido AS "studentName", e."tipoDocumento" AS "studentDocumentType",
           e.${schema.column('estudiante', 'correoinst', 'correinst')} AS "studentEmail",
           pr.nombre AS "studentProgram", lower(trim(e.estado)) AS "studentStatus",
           t.nombre || ' ' || t.apellido AS "tutorName",
           a.nombre || ' ' || a.apellido AS "advisorName"
      FROM practica p
      JOIN estudiante e              ON e."numDocumento" = p."numDocEstudiante"
      LEFT JOIN programa pr          ON pr.idprograma = e.${schema.column('estudiante', 'idprograma')}
      LEFT JOIN tipopractica tp      ON tp."idTipoPractica" = p."idTipoPractica"
      LEFT JOIN institucion i        ON i."nitEntidad" = p."nitInstitucion"
      LEFT JOIN tutor_academico t    ON t."numDocumento" = p."numDocTutor"
      LEFT JOIN asesor_pedagogico a  ON a."numDocumento" = p."numDocAsesor"`;
  }

  static #toPractice(row) {
    if (!row) return null;
    return {
      ...row,
      status: legacy.practiceStatus.fromStored(row.status),
      studentStatus: legacy.userStatus.fromStored(row.studentStatus)
    };
  }

  async findById(id) {
    return PracticeRepository.#toPractice(await this.queryOne(`${this.#detailQuery()} WHERE p."idPractica" = $1`, [id]));
  }

  async list({ studentDocument, tutorDocument, advisorDocument } = {}) {
    const conditions = [];
    const params = [];
    if (studentDocument) { params.push(studentDocument); conditions.push(`p."numDocEstudiante" = $${params.length}`); }
    if (tutorDocument) { params.push(tutorDocument); conditions.push(`p."numDocTutor" = $${params.length}`); }
    if (advisorDocument) { params.push(advisorDocument); conditions.push(`p."numDocAsesor" = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.query(`${this.#detailQuery()} ${where} ORDER BY p."fechaInicio" DESC, p."idPractica" DESC`, params);
    return rows.map(PracticeRepository.#toPractice);
  }

  /** Creates the practice and its initial activities (the student view shows six) in one transaction. */
  async create(data, activityCount = ACTIVITIES_PER_PRACTICE) {
    const id = generateId('PRA');
    const initialStatus = legacy.capitalize(legacy.practiceStatus.toStored(PRACTICE_STATUS.ACTIVE));
    await this.transaction(async (client) => {
      // notaFinal and observacionFinal are NOT NULL in the legacy schema: 0 and '' mean "not graded yet"
      await client.query(
        `INSERT INTO practica ("idPractica","fechaInicio","fechaFinal","notaFinal","observacionFinal",${this.#status},
                               "idTipoPractica","numDocEstudiante","numDocTutor","numDocAsesor","nitInstitucion")
         VALUES ($1,$2,$3,0,'',$4,$5,$6,$7,$8,$9)`,
        [id, data.startDate, data.endDate, initialStatus, data.typeId, data.studentDocument, data.tutorDocument, data.advisorDocument, data.institutionId]
      );
      // Activities are no longer auto-created.
    });
    return id;
  }

  update(id, data) {
    return this.execute(
      `UPDATE practica SET "fechaInicio"=$2, "fechaFinal"=$3, "idTipoPractica"=$4, "nitInstitucion"=$5,
              "numDocEstudiante"=$6, "numDocTutor"=$7, "numDocAsesor"=$8, ${this.#status}=$9
        WHERE "idPractica"=$1`,
      [
        id, data.startDate, data.endDate, data.typeId, data.institutionId,
        data.studentDocument, data.tutorDocument, data.advisorDocument,
        legacy.capitalize(legacy.practiceStatus.toStored(data.status || PRACTICE_STATUS.ACTIVE))
      ]
    );
  }

  /** The "logbook" has no table of its own: the final grade and observation live in `practica`. */
  updateLogbook(id, { finalGrade, generalObservation }) {
    return this.execute(
      `UPDATE practica SET "notaFinal" = COALESCE($2, "notaFinal"), "observacionFinal" = COALESCE($3, "observacionFinal")
        WHERE "idPractica" = $1`,
      [id, finalGrade, generalObservation]
    );
  }

  /** Deletes the practice and everything hanging from it (the legacy foreign keys have no ON DELETE CASCADE). */
  delete(id) {
    const advisorEvidenceColumn = schema.column('retroalimentacion_a', 'idevidencia');
    return this.transaction(async (client) => {
      const evidenceIds = `SELECT ev."idEvidencia" FROM evidenciaactividad ev JOIN actividad a ON a."idActividad" = ev."idActividad" WHERE a."idPractica" = $1`;
      await client.query(`DELETE FROM retroalimentacion_t WHERE "idEvidencia" IN (${evidenceIds})`, [id]);
      await client.query(`DELETE FROM retroalimentacion_a WHERE ${advisorEvidenceColumn} IN (${evidenceIds})`, [id]);
      await client.query(`DELETE FROM evidenciaarchivo WHERE "idEvidenciaAct" IN (${evidenceIds})`, [id]);
      await client.query(`DELETE FROM evidenciaactividad WHERE "idActividad" IN (SELECT "idActividad" FROM actividad WHERE "idPractica" = $1)`, [id]);
      await client.query(`DELETE FROM archivosactividad WHERE "idActividad" IN (SELECT "idActividad" FROM actividad WHERE "idPractica" = $1)`, [id]);
      await client.query('DELETE FROM actividad WHERE "idPractica" = $1', [id]);
      return (await client.query('DELETE FROM practica WHERE "idPractica" = $1', [id])).rowCount;
    });
  }
}

module.exports = PracticeRepository;
