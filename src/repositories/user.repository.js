'use strict';
const BaseRepository = require('./base.repository');
const schema = require('../infrastructure/schema-resolver');
const legacy = require('./legacy-values');
const { ROLES } = require('../config/constants');

/** One table per role (legacy schema). */
const ROLE_TABLES = Object.freeze({
  [ROLES.STUDENT]: 'estudiante',
  [ROLES.TUTOR]: 'tutor_academico',
  [ROLES.ADVISOR]: 'asesor_pedagogico',
  [ROLES.DIRECTOR]: 'director'
});

/** Roles whose table links to a `programa`. */
const ROLES_WITH_PROGRAM = new Set([ROLES.STUDENT, ROLES.TUTOR]);

/**
 * The real password lives in Supabase. These legacy columns are NOT NULL, so new rows carry a marker
 * instead; old plain-text passwords are never read.
 */
const PASSWORD_PLACEHOLDER = 'GESTIONADA_POR_SUPABASE';

/** Unified view over the four role tables. */
class UserRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  #table(role) {
    const table = ROLE_TABLES[role];
    if (!table) throw new Error(`Invalid role: ${role}`);
    return table;
  }

  #emailColumn(role) {
    return schema.column(this.#table(role), 'correoinst', 'correinst');
  }

  /** CTE exposing the 4 role tables with normalised column names. */
  #unifiedUsers() {
    const col = (table, ...names) => schema.column(table, ...names);
    return `WITH u AS (
      SELECT 'student'::text AS role, e."numDocumento" AS "documentNumber", e."tipoDocumento" AS "documentType",
             e.nombre AS "firstName", e.apellido AS "lastName", e.${col('estudiante', 'correoinst', 'correinst')} AS email,
             p.nombre AS program, p.facultad AS faculty, lower(trim(e.estado)) AS status
        FROM estudiante e LEFT JOIN programa p ON p.idprograma = e.${col('estudiante', 'idprograma')}
      UNION ALL
      SELECT 'tutor', t."numDocumento", t."tipoDocumento", t.nombre, t.apellido, t.${col('tutor_academico', 'correoinst', 'correinst')},
             p.nombre, p.facultad, lower(trim(t.estado))
        FROM tutor_academico t LEFT JOIN programa p ON p.idprograma = t.${col('tutor_academico', 'idprograma')}
      UNION ALL
      SELECT 'advisor', a."numDocumento", a."tipoDocumento", a.nombre, a.apellido, a.${col('asesor_pedagogico', 'correoinst', 'correinst')},
             NULL::text, NULL::text, lower(trim(a.estado))
        FROM asesor_pedagogico a
      UNION ALL
      SELECT 'director', d."numDocumento", d."tipoDocumento", d.nombre, d.apellido, d.${col('director', 'correoinst', 'correinst')},
             NULL::text, NULL::text, lower(trim(d.estado))
        FROM director d
    )`;
  }

  static #toUser(row) {
    if (!row) return null;
    return { ...row, status: legacy.userStatus.fromStored(row.status) };
  }

  /** @returns {Promise<{role,documentNumber,documentType,firstName,lastName,email,program,faculty,status}|null>} */
  async findByEmail(email) {
    const row = await this.queryOne(`${this.#unifiedUsers()} SELECT * FROM u WHERE lower(trim(email)) = lower(trim($1))`, [email]);
    return UserRepository.#toUser(row);
  }

  async findByDocument(documentNumber) {
    const row = await this.queryOne(`${this.#unifiedUsers()} SELECT * FROM u WHERE "documentNumber" = $1`, [documentNumber]);
    return UserRepository.#toUser(row);
  }

  async list({ role, status, search } = {}) {
    const conditions = [];
    const params = [];
    if (role) { params.push(role); conditions.push(`role = $${params.length}`); }
    if (status) { params.push(legacy.userStatus.toStored(status)); conditions.push(`status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      conditions.push(`("firstName" ILIKE $${i} OR "lastName" ILIKE $${i} OR "documentNumber" ILIKE $${i} OR email ILIKE $${i})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.query(`${this.#unifiedUsers()} SELECT * FROM u ${where} ORDER BY "lastName", "firstName"`, params);
    return rows.map(UserRepository.#toUser);
  }

  /** @param {{documentNumber, documentType, firstName, lastName, email, status, programId}} data */
  async create(role, data) {
    const table = this.#table(role);
    const columns = ['"numDocumento"', '"tipoDocumento"', 'nombre', 'apellido', this.#emailColumn(role), 'contrasena', '"googleId"', 'estado'];
    const values = [
      data.documentNumber, data.documentType, data.firstName, data.lastName, data.email,
      PASSWORD_PLACEHOLDER, '', legacy.capitalize(legacy.userStatus.toStored(data.status))
    ];
    if (ROLES_WITH_PROGRAM.has(role)) {
      columns.push(schema.column(table, 'idprograma'));
      values.push(data.programId);
    }
    await this.execute(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(',')})`,
      values
    );
    return data.documentNumber;
  }

  update(role, documentNumber, data) {
    const table = this.#table(role);
    const sets = ['"tipoDocumento"=$2', 'nombre=$3', 'apellido=$4', 'estado=$5'];
    const values = [documentNumber, data.documentType, data.firstName, data.lastName, legacy.capitalize(legacy.userStatus.toStored(data.status))];
    if (ROLES_WITH_PROGRAM.has(role)) {
      sets.push(`${schema.column(table, 'idprograma')}=$6`);
      values.push(data.programId);
    }
    return this.execute(`UPDATE ${table} SET ${sets.join(', ')} WHERE "numDocumento"=$1`, values);
  }

  updateStatus(role, documentNumber, status) {
    return this.execute(
      `UPDATE ${this.#table(role)} SET estado=$2 WHERE "numDocumento"=$1`,
      [documentNumber, legacy.capitalize(legacy.userStatus.toStored(status))]
    );
  }

  delete(role, documentNumber) {
    return this.execute(`DELETE FROM ${this.#table(role)} WHERE "numDocumento"=$1`, [documentNumber]);
  }

  listPrograms() {
    return this.query('SELECT idprograma AS id, nombre AS name, facultad AS faculty FROM programa ORDER BY nombre');
  }

  findProgramByName(name) {
    return this.queryOne(
      'SELECT idprograma AS id, nombre AS name, facultad AS faculty FROM programa WHERE lower(trim(nombre)) = lower(trim($1)) LIMIT 1',
      [name]
    );
  }
}

UserRepository.PASSWORD_PLACEHOLDER = PASSWORD_PLACEHOLDER;
UserRepository.ROLES_WITH_PROGRAM = ROLES_WITH_PROGRAM;
module.exports = UserRepository;
