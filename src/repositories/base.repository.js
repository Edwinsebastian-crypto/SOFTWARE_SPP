'use strict';
const postgres = require('../infrastructure/postgres');

/**
 * Base class of every relational repository.
 * Only parameterised queries ($1, $2...) are used, so there is no SQL-injection surface.
 */
class BaseRepository {
  /** @param {'practice'|'evaluation'} database */
  constructor(database) {
    this.database = database;
  }

  get pool() {
    return postgres.pool(this.database);
  }

  async query(sql, params = []) {
    const { rows } = await this.pool.query(sql, params);
    return rows;
  }

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

  /** Runs a statement and returns the number of affected rows. */
  async execute(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result.rowCount;
  }

  /** Runs `fn(client)` inside a transaction (automatic COMMIT / ROLLBACK). */
  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = BaseRepository;
