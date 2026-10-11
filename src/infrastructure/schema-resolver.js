'use strict';
const postgres = require('./postgres');

/**
 * Resolves the REAL column names of the practicum database.
 *
 * The legacy schema has irregular names that change from table to table:
 *   correInst (advisor, no "o") / correinst (director) / correoinst (student) / correoInst (tutor)
 *   "estado " and "numDocAsesor " with a trailing space (practica, retroalimentacion_a)
 * PostgreSQL is case- and space-sensitive for quoted identifiers, so the names are read once from
 * information_schema at startup and the repositories ask for a column by its "logical" name.
 */
class SchemaResolver {
  /** table -> Map(normalizedName -> realName) */
  #tables = null;

  static #normalize(name) {
    return String(name).trim().toLowerCase();
  }

  async load() {
    const { rows } = await postgres.pool('practice').query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
    );
    const tables = new Map();
    for (const row of rows) {
      if (!tables.has(row.table_name)) tables.set(row.table_name, new Map());
      tables.get(row.table_name).set(SchemaResolver.#normalize(row.column_name), row.column_name);
    }
    this.#tables = tables;
    return tables;
  }

  get isLoaded() {
    return this.#tables !== null;
  }

  /** Returns the column already quoted. Accepts several possible spellings (first one that exists wins). */
  column(table, ...candidates) {
    if (!this.#tables) throw new Error('Schema not loaded: call schemaResolver.load() at startup');
    const columns = this.#tables.get(table);
    if (!columns) throw new Error(`Table "${table}" does not exist in the practicum database`);
    for (const candidate of candidates) {
      const real = columns.get(SchemaResolver.#normalize(candidate));
      if (real) return `"${real.replace(/"/g, '""')}"`;
    }
    throw new Error(`Column ${candidates.join(' / ')} not found in table "${table}"`);
  }
}

module.exports = new SchemaResolver();
