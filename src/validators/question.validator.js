'use strict';
const HttpError = require('../utils/http-error');
const v = require('../utils/validators');
const { QUESTION_TOPICS, QUESTION_TYPES } = require('../config/constants');

/** POST/PUT /api/questions */
function parseQuestion(body = {}) {
  const input = body || {};
  if (!QUESTION_TOPICS.includes(input.topic)) throw HttpError.badRequest('Select a valid topic');
  if (!QUESTION_TYPES.includes(input.questionType)) throw HttpError.badRequest('Select a valid question type');
  return {
    statement: v.text(input.statement, { field: 'statement', max: 2000 }),
    topic: input.topic,
    questionType: input.questionType,
    practiceType: v.text(input.practiceType, { field: 'practice type', max: 30, required: false }) || null,
    value: v.integer(input.value, { field: 'value', min: 1, max: 5 })
  };
}

/** GET /api/questions?search=&topic= */
function parseQuestionFilters(query = {}) {
  const { search, topic } = query;
  return {
    search: typeof search === 'string' ? search.slice(0, 100) : undefined,
    topic: QUESTION_TOPICS.includes(topic) ? topic : undefined
  };
}

/** POST /api/practices/:id/questions  { questionId } */
function parseAssignQuestion(body = {}) {
  return v.integer((body || {}).questionId, { field: 'question' });
}

/** PUT /api/answers/:answerId  { text, submit } */
function parseAnswer(body = {}) {
  const input = body || {};
  const submit = input.submit === true;
  return { submit, text: v.text(input.text, { field: 'answer', max: 5000, required: submit }) };
}

/** POST /api/answers/:answerId/feedback  { text } */
function parseAnswerFeedback(body = {}) {
  return v.text((body || {}).text, { field: 'comment', max: 2000 });
}

module.exports = { parseQuestion, parseQuestionFilters, parseAssignQuestion, parseAnswer, parseAnswerFeedback };
