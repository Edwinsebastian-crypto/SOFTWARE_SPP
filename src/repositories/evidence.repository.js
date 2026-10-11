'use strict';
const BaseRepository = require('./base.repository');
const schema = require('../infrastructure/schema-resolver');

const SELECT = `
  SELECT ev."idEvidencia" AS id, ev.descripcion AS description, ev."horasRealizadas" AS hours, ev."idActividad" AS "activityId",
         f."idArchivo" AS "fileId", f."rutaArchivo" AS "fileUrl", f."nombreArchivo" AS "fileName", f."tipoMine" AS "fileMimeType"
    FROM evidenciaactividad ev
    LEFT JOIN evidenciaarchivo f ON f."idEvidenciaAct" = ev."idEvidencia"`;

/** One piece of evidence (`evidenciaactividad`: description + hours) with its file (`evidenciaarchivo`: Cloudinary URL). */
class EvidenceRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  async listByActivity(activityId) {
    const rows = await this.query(`${SELECT} WHERE ev."idActividad" = $1 ORDER BY ev."idEvidencia" DESC`, [activityId]);
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.id)) {
        map.set(r.id, { id: r.id, description: r.description, hours: r.hours, activityId: r.activityId, files: [] });
      }
      if (r.fileId) {
        map.get(r.id).files.push({ id: r.fileId, url: r.fileUrl, name: r.fileName, mimeType: r.fileMimeType });
      }
    }
    return Array.from(map.values());
  }

  /** Includes the owning practice (`practiceId`) so the service can verify permissions. */
  async findById(id) {
    const rows = await this.query(
      `SELECT a."idPractica" AS "practiceId", a."fechaLimite" AS "dueDate", a."notaObtenida" AS grade,
              ev."idEvidencia" AS id, ev.descripcion AS description, ev."horasRealizadas" AS hours,
              ev."idActividad" AS "activityId", f."idArchivo" AS "fileId", f."rutaArchivo" AS "fileUrl",
              f."nombreArchivo" AS "fileName", f."tipoMine" AS "fileMimeType"
         FROM evidenciaactividad ev
         JOIN actividad a ON a."idActividad" = ev."idActividad"
         LEFT JOIN evidenciaarchivo f ON f."idEvidenciaAct" = ev."idEvidencia"
        WHERE ev."idEvidencia" = $1`,
      [id]
    );
    if (!rows.length) return null;
    const { practiceId, dueDate, grade, id: evId, description, hours, activityId } = rows[0];
    const files = rows.map(r => r.fileId ? { id: r.fileId, url: r.fileUrl, name: r.fileName, mimeType: r.fileMimeType } : null).filter(Boolean);
    return { practiceId, dueDate, grade, id: evId, description, hours, activityId, files };
  }

  /** @param {{id, description, hours, activityId, files: Array<{id, url, name, mimeType}>}} data */
  create({ id, description, hours, activityId, files }) {
    return this.transaction(async (client) => {
      await client.query(
        'INSERT INTO evidenciaactividad ("idEvidencia", descripcion, "horasRealizadas", "idActividad") VALUES ($1,$2,$3,$4)',
        [id, description, hours, activityId]
      );
      for (const file of (files || [])) {
        await client.query(
          'INSERT INTO evidenciaarchivo ("idArchivo", "rutaArchivo", "nombreArchivo", "tipoMine", "idEvidenciaAct") VALUES ($1,$2,$3,$4,$5)',
          [file.id, file.url, file.name, file.mimeType, id]
        );
      }
    });
  }

  update(id, description, hours) {
    return this.execute(
      'UPDATE evidenciaactividad SET descripcion = $2, "horasRealizadas" = COALESCE($3, "horasRealizadas") WHERE "idEvidencia" = $1',
      [id, description, hours]
    );
  }

  deleteFile(fileId) {
    return this.execute('DELETE FROM evidenciaarchivo WHERE "idArchivo" = $1', [fileId]);
  }

  addFiles(evidenceId, files) {
    return this.transaction(async (client) => {
      for (const file of (files || [])) {
        await client.query(
          'INSERT INTO evidenciaarchivo ("idArchivo", "rutaArchivo", "nombreArchivo", "tipoMine", "idEvidenciaAct") VALUES ($1,$2,$3,$4,$5)',
          [file.id, file.url, file.name, file.mimeType, evidenceId]
        );
      }
    });
  }

  /** Deletes the evidence, its file and the feedback that hangs from it. */
  delete(id) {
    const advisorEvidenceColumn = schema.column('retroalimentacion_a', 'idevidencia');
    return this.transaction(async (client) => {
      await client.query('DELETE FROM retroalimentacion_t WHERE "idEvidencia" = $1', [id]);
      await client.query(`DELETE FROM retroalimentacion_a WHERE ${advisorEvidenceColumn} = $1`, [id]);
      await client.query('DELETE FROM evidenciaarchivo WHERE "idEvidenciaAct" = $1', [id]);
      return (await client.query('DELETE FROM evidenciaactividad WHERE "idEvidencia" = $1', [id])).rowCount;
    });
  }
}

module.exports = EvidenceRepository;
