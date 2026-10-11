'use strict';
const { parseAssignQuestion, parseAnswer, parseAnswerFeedback } = require('../validators/question.validator');
const { integer, textId } = require('../utils/validators');
const { toAnswerDto } = require('../presenters');

/** Questions assigned to a practice and their answers. */
class AnswerController {
  constructor({ answerService }) {
    this.answerService = answerService;
  }

  /** POST /api/practices/:id/questions  { questionId } — assigned tutor or Director */
  assign = async (req, res) => {
    const answerId = await this.answerService.assign(req.user, textId(req.params.id), parseAssignQuestion(req.body));
    res.status(201).json({ answerId });
  };

  /** GET /api/practices/:id/questions */
  listByPractice = async (req, res) => {
    const answers = await this.answerService.listByPractice(req.user, textId(req.params.id));
    res.json({ questions: answers.map(toAnswerDto) });
  };

  /** PUT /api/answers/:answerId  { text, submit } — owning student */
  answer = async (req, res) => {
    const status = await this.answerService.answer(req.user, integer(req.params.answerId, { field: 'answerId' }), parseAnswer(req.body));
    res.json({ ok: true, status });
  };

  /** POST /api/answers/:answerId/feedback  { text } — assigned tutor */
  addFeedback = async (req, res) => {
    const feedback = await this.answerService.addFeedback(req.user, integer(req.params.answerId, { field: 'answerId' }), parseAnswerFeedback(req.body));
    res.status(201).json({ feedback });
  };
}

module.exports = AnswerController;
