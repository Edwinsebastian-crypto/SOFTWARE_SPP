'use strict';
const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { uploadMultipleFiles } = require('../middlewares/upload.middleware');
const { ROLES } = require('../config/constants');

/** /api/activities/:id/(evidences|feedback) and /api/evidences/:id. */
function createActivitiesRoutes({ controllers: { evidence, feedback }, guard }) {
  const router = express.Router();
  const authenticated = guard();

  // Evidence (Cloudinary + PostgreSQL)
  router.get('/activities/:activityId/evidences', authenticated, asyncHandler(evidence.listByActivity));
  router.post('/activities/:activityId/evidences', guard(ROLES.STUDENT), uploadMultipleFiles, asyncHandler(evidence.upload));
  router.put('/evidences/:evidenceId', guard(ROLES.STUDENT, ROLES.DIRECTOR), uploadMultipleFiles, asyncHandler(evidence.update));
  router.delete('/evidences/:evidenceId', guard(ROLES.STUDENT, ROLES.DIRECTOR), asyncHandler(evidence.remove));

  // Feedback on the evidence of an activity
  router.get('/activities/:activityId/feedback', authenticated, asyncHandler(feedback.listByActivity));
  router.post('/activities/:activityId/feedback', guard(ROLES.TUTOR, ROLES.ADVISOR), asyncHandler(feedback.create));
  router.patch('/activities/:activityId/feedback/:feedbackId', guard(ROLES.TUTOR, ROLES.ADVISOR), asyncHandler(feedback.update));
  router.delete('/activities/:activityId/feedback/:feedbackId', guard(ROLES.TUTOR, ROLES.ADVISOR), asyncHandler(feedback.remove));

  return router;
}

module.exports = createActivitiesRoutes;
