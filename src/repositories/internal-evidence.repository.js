'use strict';
const BaseRepository = require('./base.repository');

const SQL_EVIDENCIAS = `
  SELECT ev."idEvidencia" AS id_evidencia, ev.descripcion, ev."horasRealizadas" AS horas,
         ev."idActividad" AS id_actividad, a.nombre AS nombre_actividad, a."idPractica" AS id_practica,
         f."idArchivo" AS id_archivo, f."nombreArchivo" AS nombre_archivo, f."tipoMine" AS tipo_mime
    FROM evidenciaactividad ev
    JOIN actividad a ON a."idActividad" = ev."idActividad"
    LEFT JOIN evidenciaarchivo f ON f."idEvidenciaAct" = ev."idEvidencia"
`;

function groupEvidences(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.id_evidencia)) {
      map.set(r.id_evidencia, {
        id_evidencia: String(r.id_evidencia),
        descripcion: r.descripcion || null,
        horas_realizadas: r.horas !== null && r.horas !== undefined ? parseFloat(r.horas) : null,
        id_actividad: r.id_actividad ? String(r.id_actividad) : null,
        nombre_actividad: r.nombre_actividad || null,
        id_practica: r.id_practica ? String(r.id_practica) : null,
        archivos: []
      });
    }
    if (r.id_archivo) {
      map.get(r.id_evidencia).archivos.push({
        id_archivo: String(r.id_archivo),
        nombre_archivo: r.nombre_archivo || `archivo-${r.id_archivo}`,
        tipo_mime: r.tipo_mime || null
      });
    }
  }
  return Array.from(map.values());
}

class InternalEvidenceRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  async listByPractice(practiceId) {
    const rows = await this.query(
      `${SQL_EVIDENCIAS} WHERE a."idPractica" = $1 ORDER BY ev."idEvidencia" DESC, f."idArchivo"`,
      [practiceId]
    );
    return groupEvidences(rows);
  }

  async getEvidenceById(evidenceId) {
    const rows = await this.query(
      `${SQL_EVIDENCIAS} WHERE ev."idEvidencia" = $1 ORDER BY f."idArchivo"`,
      [evidenceId]
    );
    const list = groupEvidences(rows);
    return list.length ? list[0] : null;
  }

  async getActivityById(activityId) {
    const rows = await this.query(
      `SELECT a."idActividad" AS id_actividad, a.nombre, a.descripcion, a."idPractica" AS id_practica,
              f."idArchivoAct" AS id_archivo, f."nombreArchivo" AS nombre_archivo, f."tipoMine" AS tipo_mime
         FROM actividad a
         LEFT JOIN archivosactividad f ON f."idActividad" = a."idActividad"
        WHERE a."idActividad" = $1
        ORDER BY f."idArchivoAct"`,
      [activityId]
    );
    if (!rows.length) return null;
    const a = rows[0];
    const archivos = rows
      .filter((r) => r.id_archivo)
      .map((r) => ({
        id_archivo: String(r.id_archivo),
        nombre_archivo: r.nombre_archivo || `archivo-${r.id_archivo}`,
        tipo_mime: r.tipo_mime || null
      }));
    return {
      id_actividad: String(a.id_actividad),
      nombre: a.nombre || '',
      descripcion: a.descripcion || null,
      id_practica: a.id_practica ? String(a.id_practica) : null,
      archivos
    };
  }

  async getEvidenceFileById(fileId) {
    const rows = await this.query(
      `SELECT f."idArchivo" AS id, f."rutaArchivo" AS url, f."nombreArchivo" AS name, f."tipoMine" AS mime
         FROM evidenciaarchivo f
        WHERE f."idArchivo" = $1`,
      [fileId]
    );
    return rows.length ? rows[0] : null;
  }

  async getActivityFileById(fileId) {
    const rows = await this.query(
      `SELECT f."idArchivoAct" AS id, f."rutaArchivo" AS url, f."nombreArchivo" AS name, f."tipoMine" AS mime
         FROM archivosactividad f
        WHERE f."idArchivoAct" = $1`,
      [fileId]
    );
    return rows.length ? rows[0] : null;
  }

  async belongsToPractice(type, refId, practiceId) {
    let sql;
    switch (type) {
      case 'EVIDENCIA':
        sql = `SELECT 1 FROM evidenciaactividad ev JOIN actividad a ON a."idActividad" = ev."idActividad" WHERE ev."idEvidencia" = $1 AND a."idPractica" = $2`;
        break;
      case 'ACTIVIDAD':
        sql = `SELECT 1 FROM actividad WHERE "idActividad" = $1 AND "idPractica" = $2`;
        break;
      case 'ARCHIVO_EVIDENCIA':
        sql = `SELECT 1 FROM evidenciaarchivo f JOIN evidenciaactividad ev ON ev."idEvidencia" = f."idEvidenciaAct" JOIN actividad a ON a."idActividad" = ev."idActividad" WHERE f."idArchivo" = $1 AND a."idPractica" = $2`;
        break;
      case 'ARCHIVO_ACTIVIDAD':
        sql = `SELECT 1 FROM archivosactividad f JOIN actividad a ON a."idActividad" = f."idActividad" WHERE f."idArchivoAct" = $1 AND a."idPractica" = $2`;
        break;
      default:
        return false;
    }
    const rows = await this.query(sql, [refId, practiceId]);
    return rows.length > 0;
  }
}

module.exports = InternalEvidenceRepository;

