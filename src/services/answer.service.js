'use strict';
const HttpError = require('../utils/http-error');
const { ANSWER_STATUS, AUDIT_ENTITIES, AUDIT_ACTIONS } = require('../config/constants');

/** Questions assigned to a practice, the student's answers and the tutor's feedback on them. */
class AnswerService {
  constructor({ answerRepository, questionRepository, practiceAccessService, auditService }) {
    this.answerRepository = answerRepository;
    this.questionRepository = questionRepository;
    this.access = practiceAccessService;
    this.auditService = auditService;
  }

  /** Assigns a question of the bank to the practice (assigned tutor or director). Resolves to the answer id. */
  async assign(user, practiceId, questionId) {
    const practice = await this.access.loadAuthorized(user, practiceId);
    if (!(await this.questionRepository.findById(questionId))) throw HttpError.notFound('Question not found');
    const answer = await this.answerRepository.assignQuestion(practice.id, questionId);
    return answer.id;
  }

  async listByPractice(user, practiceId) {
    const practice = await this.access.loadAuthorized(user, practiceId);
    return this.answerRepository.listByPractice(practice.id);
  }

  async #loadAuthorized(user, answerId) {
    const answer = await this.answerRepository.findById(answerId);
    if (!answer) throw HttpError.notFound('Question not found');
    const practice = await this.access.loadAuthorized(user, answer.practiceId);
    return { answer, practice };
  }

  /** The owning student saves a draft or submits the final answer. */
  async answer(user, answerId, { text, submit }) {
    const { answer, practice } = await this.#loadAuthorized(user, answerId);
    const status = submit ? ANSWER_STATUS.ANSWERED : (text ? ANSWER_STATUS.DRAFT : ANSWER_STATUS.PENDING);
    await this.answerRepository.save(answer.id, text, status);
    this.auditService.record(user, { entity: AUDIT_ENTITIES.ANSWER, entityId: answer.id, practiceId: practice.id, action: AUDIT_ACTIONS.UPDATE });
    return submit ? ANSWER_STATUS.ANSWERED : ANSWER_STATUS.DRAFT;
  }

  /** The assigned tutor comments on an answer. */
  async addFeedback(user, answerId, text) {
    const { answer, practice } = await this.#loadAuthorized(user, answerId);
    const feedback = await this.answerRepository.createFeedback(answer.id, user.documentNumber, text);
    this.auditService.record(user, { entity: AUDIT_ENTITIES.FEEDBACK, entityId: feedback.id, practiceId: practice.id, action: AUDIT_ACTIONS.INSERT });
    return feedback;
  }
}

module.exports = AnswerService;
