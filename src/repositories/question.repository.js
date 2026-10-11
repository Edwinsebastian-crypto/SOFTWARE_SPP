'use strict';
const BaseRepository = require('./base.repository');
const legacy = require('./legacy-values');

const COLUMNS = `idpregunta AS id, 'PRG-' || lpad(idpregunta::text, 3, '0') AS code, enunciado AS statement, tema AS topic,
  tipopractica AS "practiceType", tipopregunta AS "questionType", valor AS value, docautor AS "authorDocument", fecha AS "createdAt"`;

/** Question bank (evaluation database, table `pregunta`). */
class QuestionRepository extends BaseRepository {
  constructor() {
    super('evaluation');
  }

  static #toQuestion(row) {
    if (!row) return null;
    return { ...row, topic: legacy.questionTopic.fromStored(row.topic), questionType: legacy.questionType.fromStored(row.questionType) };
  }

  async list({ search, topic } = {}) {
    const conditions = [];
    const params = [];
    if (topic) { params.push(legacy.questionTopic.toStored(topic)); conditions.push(`tema = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`enunciado ILIKE $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.query(`SELECT ${COLUMNS} FROM pregunta ${where} ORDER BY idpregunta DESC`, params);
    return rows.map(QuestionRepository.#toQuestion);
  }

  async findById(id) {
    return QuestionRepository.#toQuestion(await this.queryOne(`SELECT ${COLUMNS} FROM pregunta WHERE idpregunta = $1`, [id]));
  }

  async create(data) {
    const row = await this.queryOne(
      `INSERT INTO pregunta (enunciado, tema, tipopractica, tipopregunta, valor, docautor)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLUMNS}`,
      [data.statement, legacy.questionTopic.toStored(data.topic), data.practiceType, legacy.questionType.toStored(data.questionType), data.value, data.authorDocument]
    );
    return QuestionRepository.#toQuestion(row);
  }

  update(id, data) {
    return this.execute(
      'UPDATE pregunta SET enunciado=$2, tema=$3, tipopractica=$4, tipopregunta=$5, valor=$6 WHERE idpregunta=$1',
      [id, data.statement, legacy.questionTopic.toStored(data.topic), data.practiceType, legacy.questionType.toStored(data.questionType), data.value]
    );
  }

  delete(id) {
    return this.execute('DELETE FROM pregunta WHERE idpregunta=$1', [id]);
  }
}

module.exports = QuestionRepository;
