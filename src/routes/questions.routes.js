'use strict';
const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { ROLES } = require('../config/constants');

/** /api/questions (question bank) and /api/answers (student answers + tutor feedback). */
function createQuestionsRoutes({ controllers: { question, answer }, guard }) {
  const router = express.Router();
  const teacher = guard(ROLES.TUTOR, ROLES.DIRECTOR);

  router.get('/questions', teacher, asyncHandler(question.list));
  router.post('/questions', teacher, asyncHandler(question.create));
  router.put('/questions/:id', teacher, asyncHandler(question.update));
  router.delete('/questions/:id', teacher, asyncHandler(question.remove));

  router.put('/answers/:answerId', guard(ROLES.STUDENT), asyncHandler(answer.answer));
  router.post('/answers/:answerId/feedback', guard(ROLES.TUTOR), asyncHandler(answer.addFeedback));

  return router;
}

module.exports = createQuestionsRoutes;
