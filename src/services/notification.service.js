'use strict';
const { fullName } = require('../utils/format');

/** Queues e-mail notifications (MongoDB). Delivery itself is done by an external mail microservice. */
class NotificationService {
  constructor({ notificationRepository }) {
    this.notificationRepository = notificationRepository;
  }

  /**
   * Tells the three participants that a practice was assigned to them.
   * @param {{practiceId, practiceName, startDate, endDate, participants: Array<{person, roleLabel}>}} practice
   */
  notifyPracticeAssigned({ practiceId, practiceName, startDate, endDate, participants }) {
    const subject = `Practice assigned: ${practiceName}`;
    for (const { person, roleLabel } of participants) {
      this.notificationRepository.createPracticeAssigned({
        recipient: { documentNumber: person.documentNumber, email: person.email, fullName: fullName(person) },
        practiceId,
        subject,
        content: `You have been assigned the practice "${practiceName}" as ${roleLabel}. Valid from ${startDate} to ${endDate}.`
      });
    }
  }
}

module.exports = NotificationService;
