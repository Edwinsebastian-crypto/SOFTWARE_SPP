'use strict';
const { NO_PRACTICE } = require('../config/constants');
const { fullName } = require('../utils/format');

/** Records and lists audit entries. Recording is fire-and-forget: it never fails the main operation. */
class AuditService {
  constructor({ auditRepository }) {
    this.auditRepository = auditRepository;
  }

  /** @param {object} actor authenticated user @param {{entity, entityId, practiceId?, action}} entry */
  record(actor, { entity, entityId, practiceId = NO_PRACTICE, action }) {
    return this.auditRepository.record({
      user: { documentNumber: actor.documentNumber, role: actor.role, fullName: fullName(actor) },
      entity, entityId, practiceId, action
    });
  }

  list({ practiceId } = {}) {
    return this.auditRepository.list({ practiceId });
  }
}

module.exports = AuditService;
