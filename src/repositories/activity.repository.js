'use strict';
const BaseRepository = require('./base.repository');

function formatLocalTimestamp(d = new Date()) {
  try {
    const timeZone = process.env.TIMEZONE || process.env.TZ || 'America/Bogota';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const hour = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
  } catch {
    const pad = (n) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

class ActivityRepository extends BaseRepository {
  constructor() {
    super('practice');
  }

  /** `number` (1..n) is the position of the activity inside its practice; the student view has 6 fixed buttons. */
  listByPractice(practiceId) {
    return this.query(
      `SELECT a."idActividad" AS id, a."idPractica" AS "practiceId",
              ROW_NUMBER() OVER (
                PARTITION BY a."idPractica"
                ORDER BY COALESCE(substring(a."idActividad" from '-A([0-9]+)$')::int, 0), a."fechaAsignacion", a."idActividad"
              )::int AS number,
              a.nombre AS title, a.descripcion AS description, a."fechaAsignacion" AS "assignedDate", a."fechaLimite" AS "dueDate",
              a."notaObtenida" AS grade,
              (SELECT COUNT(*)::int FROM evidenciaactividad ev WHERE ev."idActividad" = a."idActividad") AS "evidenceCount",
              (SELECT COUNT(*)::int FROM retroalimentacion_t rt JOIN evidenciaactividad ev ON ev."idEvidencia" = rt."idEvidencia" WHERE ev."idActividad" = a."idActividad") AS "feedbackCount",
              (SELECT COALESCE(SUM(ev."horasRealizadas"), 0)::int FROM evidenciaactividad ev WHERE ev."idActividad" = a."idActividad") AS hours,
              COALESCE(
                (SELECT json_agg(json_build_object('id', f."idArchivoAct", 'url', f."rutaArchivo", 'name', f."nombreArchivo", 'mimeType', f."tipoMine"))
                 FROM archivosactividad f WHERE f."idActividad" = a."idActividad"),
                '[]'::json
              ) AS files
         FROM actividad a WHERE a."idPractica" = $1 ORDER BY number DESC`,
      [practiceId]
    );
  }

  findById(id) {
    return this.queryOne(
      `SELECT a."idActividad" AS id, a."idPractica" AS "practiceId", a.nombre AS title, a."fechaLimite" AS "dueDate", a."notaObtenida" AS grade,
              (SELECT COALESCE(SUM(ev."horasRealizadas"), 0)::int FROM evidenciaactividad ev WHERE ev."idActividad" = a."idActividad") AS hours
         FROM actividad a WHERE a."idActividad" = $1`,
      [id]
    );
  }

  async create(practiceId, data = {}) {
    // Query all activities and find the maximum sequential suffix to avoid UNIQUE_VIOLATION if any were manually deleted
    const rows = await this.query(`SELECT "idActividad" FROM actividad WHERE "idPractica" = $1`, [practiceId]);
    let maxNumber = 0;
    for (const row of rows) {
      const idx = row.idActividad.lastIndexOf('-A');
      if (idx !== -1) {
        const numStr = row.idActividad.substring(idx + 2);
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
    const nextNumber = maxNumber + 1;
    const idActividad = `${practiceId}-A${nextNumber}`;

    // Date of assignment is today (local time) unless provided
    const assignedDate = (data.assignedDate && String(data.assignedDate).trim()) ? data.assignedDate : formatLocalTimestamp();
    const dueDate = (data.dueDate && String(data.dueDate).trim()) ? data.dueDate : null;

    // Title will just be "Activity" unless provided
    const title = data.title || 'Activity';
    const description = data.description || null;

    await this.query(
      `INSERT INTO actividad ("idActividad", nombre, descripcion, "fechaAsignacion", "fechaLimite", "idPractica", "notaObtenida")
       VALUES ($1, $2, $3, $4, $5, $6, 0)`,
      [idActividad, title, description, assignedDate, dueDate, practiceId]
    );

    return { id: idActividad };
  }

  update(id, data) {
    const fields = [];
    const params = [id];
    let query = 'UPDATE actividad SET ';

    if (data.title !== undefined) { params.push(data.title); fields.push(`nombre = $${params.length}`); }
    if (data.description !== undefined) { params.push(data.description); fields.push(`descripcion = $${params.length}`); }
    if (data.assignedDate !== undefined) {
      const val = (data.assignedDate && String(data.assignedDate).trim()) ? data.assignedDate : formatLocalTimestamp();
      params.push(val);
      fields.push(`"fechaAsignacion" = $${params.length}`);
    }
    if (data.dueDate !== undefined) {
      const val = (data.dueDate && String(data.dueDate).trim()) ? data.dueDate : null;
      params.push(val);
      fields.push(`"fechaLimite" = $${params.length}`);
    }
    if (data.grade !== undefined) { params.push(data.grade); fields.push(`"notaObtenida" = $${params.length}`); }

    if (fields.length === 0) return Promise.resolve();
    query += fields.join(', ') + ' WHERE "idActividad" = $1';
    return this.execute(query, params);
  }

  addFiles(activityId, files) {
    return this.transaction(async (client) => {
      for (const file of (files || [])) {
        await client.query(
          'INSERT INTO archivosactividad ("idArchivoAct", "rutaArchivo", "nombreArchivo", "tipoMine", "idActividad") VALUES ($1,$2,$3,$4,$5)',
          [file.id, file.url, file.name, file.mimeType, activityId]
        );
      }
    });
  }

  deleteFile(fileId) {
    return this.execute('DELETE FROM archivosactividad WHERE "idArchivoAct" = $1', [fileId]);
  }

  deleteActivity(id) {
    return this.execute('DELETE FROM actividad WHERE "idActividad" = $1', [id]);
  }
}

module.exports = ActivityRepository;
