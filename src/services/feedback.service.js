'use strict';
const HttpError = require('../utils/http-error');
const { AUDIT_ENTITIES, AUDIT_ACTIONS } = require('../config/constants');

/** In the legacy schema feedback hangs from an EVIDENCE; the views group it by activity. */
class FeedbackService {
  constructor({ feedbackRepository, evidenceRepository, practiceAccessService, auditService }) {
    this.feedbackRepository = feedbackRepository;
    this.evidenceRepository = evidenceRepository;
    this.access = practiceAccessService;
    this.auditService = auditService;
  }

  /** Every feedback entry attached to the evidence of that activity. */
  async listByActivity(user, activityId) {
    const { activity } = await this.access.loadAuthorizedActivity(user, activityId);
    return this.feedbackRepository.listByActivity(activity.id);
  }

  /** The assigned tutor or advisor comments on one piece of evidence of the activity. */
  async create(user, activityId, { evidenceId, text }) {
    const { activity, practice } = await this.access.loadAuthorizedActivity(user, activityId);
    const evidence = await this.evidenceRepository.findById(evidenceId);
    if (!evidence || evidence.activityId !== activity.id) throw HttpError.badRequest('The evidence does not belong to this activity');

    const feedback = await this.feedbackRepository.create({
      evidenceId, authorDocument: user.documentNumber, authorRole: user.role, text
    });
    this.auditService.record(user, { entity: AUDIT_ENTITIES.FEEDBACK, entityId: feedback.id, practiceId: practice.id, action: AUDIT_ACTIONS.INSERT });
    return feedback;
  }

  async update(user, activityId, feedbackId, text) {
    const { practice } = await this.access.loadAuthorizedActivity(user, activityId);
    const feedback = await this.feedbackRepository.findById(feedbackId);
    if (!feedback) throw HttpError.notFound('Feedback not found');
    if (feedback.authorDocument !== user.documentNumber) throw HttpError.forbidden('You can only modify your own feedback');

    const updated = await this.feedbackRepository.update({ id: feedbackId, text });
    this.auditService.record(user, { entity: AUDIT_ENTITIES.FEEDBACK, entityId: feedbackId, practiceId: practice.id, action: AUDIT_ACTIONS.UPDATE });
    return { id: feedbackId, text, date: updated.date, authorDocument: user.documentNumber, role: feedback.role, evidenceId: feedback.evidenceId };
  }

  async remove(user, activityId, feedbackId) {
    const { practice } = await this.access.loadAuthorizedActivity(user, activityId);
    const feedback = await this.feedbackRepository.findById(feedbackId);
    if (!feedback) throw HttpError.notFound('Feedback not found');
    if (feedback.authorDocument !== user.documentNumber) throw HttpError.forbidden('You can only delete your own feedback');

    await this.feedbackRepository.remove(feedbackId);
    this.auditService.record(user, { entity: AUDIT_ENTITIES.FEEDBACK, entityId: feedbackId, practiceId: practice.id, action: AUDIT_ACTIONS.DELETE });
  }
}

module.exports = FeedbackService;
