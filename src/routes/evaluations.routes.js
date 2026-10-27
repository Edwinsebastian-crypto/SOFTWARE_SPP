'use strict';
const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { ROLES } = require('../config/constants');

/**
 * /api/evaluations  (evaluations with manual / AI-generated questions: Python microservice behind this gateway).
 *   /tutor/*    -> tutors     (create, edit, generate with AI, publish, grade)
 *   /student/*  -> students   (list, take, submit)
 *   /estudiante/* -> students (legacy Spanish segment used by the existing student view)
 *   /director/* -> director   (READ ONLY overview: figures, alerts and per-evaluation detail)
 */
function createEvaluationsRoutes({ controllers: { evaluation }, guard }) {
  const router = express.Router();

  router.get('/health', guard(ROLES.TUTOR), asyncHandler(evaluation.health));
  router.all('/tutor/*', guard(ROLES.TUTOR), asyncHandler(evaluation.proxy('tutor')));
  router.all('/student/*', guard(ROLES.STUDENT), asyncHandler(evaluation.proxy('student')));
  router.all('/estudiante/*', guard(ROLES.STUDENT), asyncHandler(evaluation.proxy('student')));
  router.get('/director/*', guard(ROLES.DIRECTOR), asyncHandler(evaluation.proxy('director')));

  return router;
}

module.exports = createEvaluationsRoutes;
