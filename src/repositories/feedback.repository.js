'use strict';
const BaseRepository = require('./base.repository');
const schema = require('../infrastructure/schema-resolver');
const { generateId } = require('../utils/id-generator');
const { ROLES } = require('../config/constants');

function formatLocalTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * The legacy schema splits feedback by author (`retroalimentacion_t` = tutor, `retroalimentacion_a` = advisor)
 * and hangs it from the EVIDENCE (not from the activity).
 */
class FeedbackRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  /** All feedback attached to the evidence of one activity, newest first. */
  listByActivity(activityId) {
    const advisorEvidence = schema.column('retroalimentacion_a', 'idevidencia');
    return this.query(
      `SELECT 'tutor'::text AS role, rt."idRetroalimentacionT" AS id, rt.comentario AS text, rt.fecha AS "date", rt."idEvidencia" AS "evidenceId", rt."numDocTutor" AS "authorDocument"
         FROM retroalimentacion_t rt JOIN evidenciaactividad ev ON ev."idEvidencia" = rt."idEvidencia"
        WHERE ev."idActividad" = $1
       UNION ALL
       SELECT 'advisor', ra."idRetroalimentacionA", ra.comentario, ra.fecha, ra.${advisorEvidence}, ra.${schema.column('retroalimentacion_a', 'numdocasesor')}
         FROM retroalimentacion_a ra JOIN evidenciaactividad ev ON ev."idEvidencia" = ra.${advisorEvidence}
        WHERE ev."idActividad" = $1
       ORDER BY "date" DESC, id DESC`,
      [activityId]
    );
  }

  /** @param {{evidenceId, authorDocument, authorRole, text}} data */
  async create({ evidenceId, authorDocument, authorRole, text }) {
    const now = formatLocalTimestamp();
    if (authorRole === ROLES.TUTOR) {
      const id = generateId('RT');
      await this.execute(
        `INSERT INTO retroalimentacion_t ("idRetroalimentacionT", comentario, fecha, "idEvidencia", "numDocTutor")
         VALUES ($1,$2,$3,$4,$5)`,
        [id, text, now, evidenceId, authorDocument]
      );
      return { id, role: ROLES.TUTOR, text, evidenceId, date: now, authorDocument };
    }
    const id = generateId('RA');
    await this.execute(
      `INSERT INTO retroalimentacion_a ("idRetroalimentacionA", comentario, fecha, ${schema.column('retroalimentacion_a', 'idevidencia')}, ${schema.column('retroalimentacion_a', 'numdocasesor')})
       VALUES ($1,$2,$3,$4,$5)`,
      [id, text, now, evidenceId, authorDocument]
    );
    return { id, role: ROLES.ADVISOR, text, evidenceId, date: now, authorDocument };
  }

  async update({ id, text }) {
    const now = formatLocalTimestamp();
    if (id.startsWith('RT')) {
      await this.execute(
        `UPDATE retroalimentacion_t SET comentario = $1, fecha = $2 WHERE "idRetroalimentacionT" = $3`,
        [text, now, id]
      );
    } else {
      await this.execute(
        `UPDATE retroalimentacion_a SET comentario = $1, fecha = $2 WHERE "idRetroalimentacionA" = $3`,
        [text, now, id]
      );
    }
    return { id, text, date: now };
  }

  async remove(id) {
    if (id.startsWith('RT')) {
      await this.execute(`DELETE FROM retroalimentacion_t WHERE "idRetroalimentacionT" = $1`, [id]);
    } else {
      await this.execute(`DELETE FROM retroalimentacion_a WHERE "idRetroalimentacionA" = $1`, [id]);
    }
  }

  async findById(id) {
    if (id.startsWith('RT')) {
      const rows = await this.query(
        `SELECT 'tutor'::text AS role, "idRetroalimentacionT" AS id, comentario AS text, fecha AS "date", "idEvidencia" AS "evidenceId", "numDocTutor" AS "authorDocument"
         FROM retroalimentacion_t WHERE "idRetroalimentacionT" = $1`, [id]);
      return rows[0] || null;
    } else {
      const rows = await this.query(
        `SELECT 'advisor'::text AS role, "idRetroalimentacionA" AS id, comentario AS text, fecha AS "date", ${schema.column('retroalimentacion_a', 'idevidencia')} AS "evidenceId", ${schema.column('retroalimentacion_a', 'numdocasesor')} AS "authorDocument"
         FROM retroalimentacion_a WHERE "idRetroalimentacionA" = $1`, [id]);
      return rows[0] || null;
    }
  }
}

module.exports = FeedbackRepository;
