'use strict';
const BaseRepository = require('./base.repository');
const legacy = require('./legacy-values');

/** An evaluation per practice, plus its assigned questions, the answers and the feedback on each answer. */
class AnswerRepository extends BaseRepository {
  constructor() {
    super('evaluation');
  }

  deleteByPractice(practiceId) {
    return this.execute('DELETE FROM evaluacion WHERE idpractica = $1', [practiceId]);
  }

  async ensureEvaluation(practiceId) {
    const row = await this.queryOne(
      `INSERT INTO evaluacion (idpractica) VALUES ($1)
       ON CONFLICT (idpractica) DO UPDATE SET idpractica = EXCLUDED.idpractica RETURNING idevaluacion AS id`,
      [practiceId]
    );
    return row.id;
  }

  /** Assigns a question of the bank to the practice (idempotent). Resolves to `{ id }` of the answer slot. */
  async assignQuestion(practiceId, questionId) {
    const evaluationId = await this.ensureEvaluation(practiceId);
    return this.queryOne(
      `INSERT INTO respuesta (idevaluacion, idpregunta) VALUES ($1,$2)
       ON CONFLICT (idevaluacion, idpregunta) DO UPDATE SET idpregunta = EXCLUDED.idpregunta
       RETURNING idrespuesta AS id`,
      [evaluationId, questionId]
    );
  }

  async listByPractice(practiceId) {
    const rows = await this.query(
      `SELECT r.idrespuesta AS id, r.texto AS text, r.estado AS status, r.fecha AS "date",
              p.idpregunta AS "questionId", p.enunciado AS statement, p.tema AS topic, p.valor AS value,
              (SELECT rp.texto FROM retropregunta rp WHERE rp.idrespuesta = r.idrespuesta ORDER BY rp.fecha DESC LIMIT 1) AS observation
         FROM evaluacion ev
         JOIN respuesta r ON r.idevaluacion = ev.idevaluacion
         JOIN pregunta p  ON p.idpregunta = r.idpregunta
        WHERE ev.idpractica = $1
        ORDER BY r.idrespuesta`,
      [practiceId]
    );
    return rows.map((row) => ({ ...row, status: legacy.answerStatus.fromStored(row.status), topic: legacy.questionTopic.fromStored(row.topic) }));
  }

  /** Includes the owning practice (`practiceId`) so the service can verify permissions. */
  async findById(id) {
    const row = await this.queryOne(
      `SELECT r.idrespuesta AS id, r.texto AS text, r.estado AS status, ev.idpractica AS "practiceId"
         FROM respuesta r JOIN evaluacion ev ON ev.idevaluacion = r.idevaluacion
        WHERE r.idrespuesta = $1`,
      [id]
    );
    return row && { ...row, status: legacy.answerStatus.fromStored(row.status) };
  }

  save(id, text, status) {
    return this.execute('UPDATE respuesta SET texto=$2, estado=$3, fecha=now() WHERE idrespuesta=$1', [id, text, legacy.answerStatus.toStored(status)]);
  }

  listFeedback(answerId) {
    return this.query(
      'SELECT idretro AS id, docautor AS "authorDocument", texto AS text, fecha AS "date" FROM retropregunta WHERE idrespuesta=$1 ORDER BY fecha DESC',
      [answerId]
    );
  }

  createFeedback(answerId, authorDocument, text) {
    return this.queryOne(
      'INSERT INTO retropregunta (idrespuesta, docautor, texto) VALUES ($1,$2,$3) RETURNING idretro AS id, docautor AS "authorDocument", texto AS text, fecha AS "date"',
      [answerId, authorDocument, text]
    );
  }
}

module.exports = AnswerRepository;
