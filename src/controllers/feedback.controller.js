'use strict';
const { parseFeedback, parseFeedbackUpdate } = require('../validators/evidence.validator');
const { textId } = require('../utils/validators');
const { toFeedbackDto } = require('../presenters');

class FeedbackController {
  constructor({ feedbackService }) {
    this.feedbackService = feedbackService;
  }

  /** GET /api/activities/:activityId/feedback  (feedback on every evidence of the activity) */
  listByActivity = async (req, res) => {
    const feedback = await this.feedbackService.listByActivity(req.user, textId(req.params.activityId, 'activityId'));
    res.json({ feedback: feedback.map(toFeedbackDto) });
  };

  create = async (req, res) => {
    const feedback = await this.feedbackService.create(req.user, textId(req.params.activityId, 'activityId'), parseFeedback(req.body));
    res.status(201).json({ feedback: toFeedbackDto(feedback) });
  };

  /** PUT/PATCH /api/activities/:activityId/feedback/:feedbackId */
  update = async (req, res) => {
    const { text, date } = parseFeedbackUpdate(req.body);
    const feedback = await this.feedbackService.update(req.user, textId(req.params.activityId, 'activityId'), textId(req.params.feedbackId, 'feedbackId'), { text, date });
    res.json({ feedback: toFeedbackDto(feedback) });
  };

  /** DELETE /api/activities/:activityId/feedback/:feedbackId */
  remove = async (req, res) => {
    await this.feedbackService.remove(req.user, textId(req.params.activityId, 'activityId'), textId(req.params.feedbackId, 'feedbackId'));
    res.status(204).end();
  };
}

module.exports = FeedbackController;
