'use strict';
const BaseRepository = require('./base.repository');

const COLUMNS = `"nitEntidad" AS id, "nitEntidad" AS "taxId", nombre AS name, encargado AS manager, direccion AS address, "correoInstitucion" AS email`;

/** The primary key of `institucion` is the tax id (NIT, varchar(10)). */
class InstitutionRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  list() {
    return this.query(`SELECT ${COLUMNS} FROM institucion ORDER BY nombre`);
  }

  findById(taxId) {
    return this.queryOne(`SELECT ${COLUMNS} FROM institucion WHERE "nitEntidad" = $1`, [taxId]);
  }

  create(data) {
    return this.queryOne(
      `INSERT INTO institucion ("nitEntidad", nombre, direccion, encargado, "correoInstitucion") VALUES ($1,$2,$3,$4,$5) RETURNING ${COLUMNS}`,
      [data.taxId, data.name, data.address, data.manager, data.email]
    );
  }

  /** The tax id is the primary key (practices reference it), so it is never modified. */
  update(taxId, data) {
    return this.execute(
      'UPDATE institucion SET nombre=$2, direccion=$3, encargado=$4, "correoInstitucion"=$5 WHERE "nitEntidad"=$1',
      [taxId, data.name, data.address, data.manager, data.email]
    );
  }

  delete(taxId) {
    return this.execute('DELETE FROM institucion WHERE "nitEntidad" = $1', [taxId]);
  }
}

module.exports = InstitutionRepository;
