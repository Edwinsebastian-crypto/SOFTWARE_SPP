'use strict';
const { parseQuestion, parseQuestionFilters } = require('../validators/question.validator');
const { integer } = require('../utils/validators');
const { toQuestionDto } = require('../presenters');

/** Question bank (tutors and Director). */
class QuestionController {
  constructor({ questionService }) {
    this.questionService = questionService;
  }

  /** GET /api/questions?search=&topic= */
  list = async (req, res) => {
    const questions = await this.questionService.list(parseQuestionFilters(req.query));
    res.json({ questions: questions.map(toQuestionDto) });
  };

  /** POST /api/questions */
  create = async (req, res) => {
    const question = await this.questionService.create(req.user, parseQuestion(req.body));
    res.status(201).json({ question: toQuestionDto(question) });
  };

  /** PUT /api/questions/:id */
  update = async (req, res) => {
    const question = await this.questionService.update(integer(req.params.id, { field: 'id' }), parseQuestion(req.body));
    res.json({ question: toQuestionDto(question) });
  };

  /** DELETE /api/questions/:id */
  remove = async (req, res) => {
    await this.questionService.remove(integer(req.params.id, { field: 'id' }));
    res.json({ ok: true });
  };
}

module.exports = QuestionController;
