'use strict';
const { Pool, types } = require('pg');
const env = require('../config/env');

// DATE (oid 1082) is delivered as a 'YYYY-MM-DD' string to avoid time-zone shifts.
types.setTypeParser(1082, (value) => value);
// TIMESTAMP (oid 1114) and TIMESTAMPTZ (oid 1184) delivered as strings to avoid automatic time-zone shifts.
types.setTypeParser(1114, (value) => value);
types.setTypeParser(1184, (value) => value);

/** Environment variable holding the connection string of each logical database. */
const DATABASE_VARIABLES = Object.freeze({
  practice: 'DATABASE_URL_PRACTICE' // students, practices, activities, evidence, feedback...
});

/** Owns one lazily created connection pool per logical PostgreSQL database. */
class PostgresPools {
  #pools = new Map();

  /** @param {'practice'} database */
  pool(database) {
    const variable = DATABASE_VARIABLES[database];
    if (!variable) throw new Error(`Unknown database: ${database}`);
    if (!this.#pools.has(database)) {
      const pool = new Pool({
        connectionString: env.require(variable),
        // Neon requires SSL; DB_SSL=false is only meant for a local development database.
        ssl: env.get('DB_SSL', 'true') === 'false' ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000
      });
      pool.on('error', (err) => console.error(`[pg:${database}]`, err.message));
      this.#pools.set(database, pool);
    }
    return this.#pools.get(database);
  }

  async close() {
    await Promise.all([...this.#pools.values()].map((pool) => pool.end()));
    this.#pools.clear();
  }
}

module.exports = new PostgresPools();
