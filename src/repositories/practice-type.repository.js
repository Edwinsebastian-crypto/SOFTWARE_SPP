'use strict';
const BaseRepository = require('./base.repository');

const COLUMNS = `"idTipoPractica" AS id, "idTipoPractica" AS code, nombre AS name, "numSemestre" AS semester, "horasRequeridas" AS hours`;

class PracticeTypeRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  list() {
    return this.query(`SELECT ${COLUMNS} FROM tipopractica ORDER BY "idTipoPractica"`);
  }

  findById(id) {
    return this.queryOne(`SELECT ${COLUMNS} FROM tipopractica WHERE "idTipoPractica" = $1`, [id]);
  }

  /** Sequential codes TIP-001, TIP-002... (the views already displayed them that way). */
  create(data) {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(7301)');
      const { rows: [{ n }] } = await client.query(
        `SELECT COALESCE(MAX(substring("idTipoPractica" from '^TIP-([0-9]+)$')::int), 0) + 1 AS n FROM tipopractica`
      );
      const id = `TIP-${String(n).padStart(3, '0')}`;
      const inserted = await client.query(
        `INSERT INTO tipopractica ("idTipoPractica", nombre, "numSemestre", "horasRequeridas") VALUES ($1,$2,$3,$4) RETURNING ${COLUMNS}`,
        [id, data.name, data.semester, data.hours]
      );
      return inserted.rows[0];
    });
  }

  update(id, data) {
    return this.execute(
      'UPDATE tipopractica SET nombre=$2, "numSemestre"=$3, "horasRequeridas"=$4 WHERE "idTipoPractica"=$1',
      [id, data.name, data.semester, data.hours]
    );
  }

  delete(id) {
    return this.execute('DELETE FROM tipopractica WHERE "idTipoPractica"=$1', [id]);
  }
}

module.exports = PracticeTypeRepository;
