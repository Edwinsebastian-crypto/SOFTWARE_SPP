'use strict';
const HttpError = require('../utils/http-error');

/** Question bank managed by tutors and the director. */
class QuestionService {
  constructor({ questionRepository }) {
    this.questionRepository = questionRepository;
  }

  list(filters) {
    return this.questionRepository.list(filters);
  }

  create(user, data) {
    return this.questionRepository.create({ ...data, authorDocument: user.documentNumber });
  }

  async update(id, data) {
    if (!(await this.questionRepository.update(id, data))) throw HttpError.notFound('Question not found');
    return this.questionRepository.findById(id);
  }

  async remove(id) {
    if (!(await this.questionRepository.delete(id))) throw HttpError.notFound('Question not found');
  }
}

module.exports = QuestionService;
