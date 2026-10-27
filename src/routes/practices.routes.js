'use strict';
const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { uploadMultipleFiles } = require('../middlewares/upload.middleware');
const { ROLES } = require('../config/constants');

/** /api/practices — practices, their activities and logbook. */
function createPracticesRoutes({ controllers: { practice }, guard }) {
  const router = express.Router();
  const authenticated = guard();
  const director = guard(ROLES.DIRECTOR);
  const teacher = guard(ROLES.TUTOR, ROLES.DIRECTOR);

  router.get('/', authenticated, asyncHandler(practice.list));
  router.post('/', director, asyncHandler(practice.create));
  router.get('/:id', authenticated, asyncHandler(practice.get));
  router.put('/:id', director, asyncHandler(practice.update));
  router.delete('/:id', director, asyncHandler(practice.remove));

  // the final grade is recorded by the assigned tutor (or the director)
  router.patch('/:id/logbook', teacher, asyncHandler(practice.updateLogbook));
  router.get('/:id/activities', authenticated, asyncHandler(practice.listActivities));
  router.post('/:id/activities', guard(ROLES.STUDENT, ROLES.TUTOR, ROLES.ADVISOR, ROLES.DIRECTOR), uploadMultipleFiles, asyncHandler(practice.createActivity));
  router.patch('/:id/activities/:activityId', guard(ROLES.TUTOR, ROLES.ADVISOR, ROLES.DIRECTOR), uploadMultipleFiles, asyncHandler(practice.updateActivity));
  router.delete('/:id/activities/:activityId', guard(ROLES.TUTOR, ROLES.DIRECTOR), asyncHandler(practice.removeActivity));

  return router;
}

module.exports = createPracticesRoutes;
