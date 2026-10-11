'use strict';
const auditLog = require('../models/audit-log.model');
const legacy = require('./legacy-values');
const { NO_PRACTICE } = require('../config/constants');

/** Audit trail in MongoDB. It must never break the main operation: failures are only logged. */
class AuditRepository {
  /**
   * @param {{user:{documentNumber,role,fullName}, entity, entityId, practiceId, action}} entry
   *   entity ∈ practice|logbook|evidence|feedback|answer|user ; action ∈ insert|update|delete
   */
  async record(entry) {
    try {
      const Model = auditLog();
      if (!Model) return;
      await Model.create({
        usuario: { numDocumento: entry.user.documentNumber, rol: entry.user.role, nombreCompleto: entry.user.fullName },
        entidad: legacy.auditEntity.toStored(entry.entity),
        idEntidad: String(entry.entityId),
        idPractica: String(entry.practiceId ?? NO_PRACTICE),
        accion: legacy.auditAction.toStored(entry.action)
      });
    } catch (err) {
      console.warn('[audit] could not record entry:', err.message);
    }
  }

  async list({ practiceId, limit = 100 } = {}) {
    const Model = auditLog();
    if (!Model) return [];
    const filter = practiceId ? { idPractica: String(practiceId) } : {};
    const documents = await Model.find(filter).sort({ fecha: -1 }).limit(limit).lean();
    return documents.map((d) => ({
      id: String(d._id),
      user: { documentNumber: d.usuario?.numDocumento, role: d.usuario?.rol, fullName: d.usuario?.nombreCompleto },
      entity: legacy.auditEntity.fromStored(d.entidad),
      entityId: d.idEntidad,
      practiceId: d.idPractica,
      action: legacy.auditAction.fromStored(d.accion),
      date: d.fecha,
      year: d.anio,
      month: d.mes
    }));
  }
}

module.exports = AuditRepository;
