'use strict';
const notificationModel = require('../models/notification.model');

const PRACTICE_ASSIGNED = 'PracticaAsignada'; // persisted notification type (consumed by the mail microservice)

/** Notification queue (MongoDB "notifications" connection). `sentAt` stays empty until the mail service sends it. */
class NotificationRepository {
  /** @param {{recipient:{documentNumber,email,fullName}, practiceId, subject, content}} data */
  async createPracticeAssigned({ recipient, practiceId, subject, content }) {
    try {
      const Model = notificationModel();
      if (!Model) return null;
      return await Model.create({
        tipo: PRACTICE_ASSIGNED,
        destinatario: { numDocumento: recipient.documentNumber, correo: recipient.email, nombreCompleto: recipient.fullName },
        idPractica: practiceId,
        asunto: subject,
        contenido: content
      });
    } catch (err) {
      console.warn('[notification] could not record notification:', err.message);
      return null;
    }
  }

  async listByDocument(documentNumber, limit = 30) {
    try {
      const Model = notificationModel();
      if (!Model) return [];
      return await Model.find({ 'destinatario.numDocumento': documentNumber }).sort({ fechaCreacion: -1 }).limit(limit).lean();
    } catch (err) {
      console.warn('[notification] could not list notifications:', err.message);
      return [];
    }
  }
}

module.exports = NotificationRepository;
