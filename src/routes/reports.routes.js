'use strict';
const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { ROLES } = require('../config/constants');

/** /api/reports and /api/audit-log (Director only). */
function createReportsRoutes({ controllers: { report }, guard }) {
  const router = express.Router();
  const director = guard(ROLES.DIRECTOR);

  router.get('/reports/summary', director, asyncHandler(report.summary));
  router.get('/reports/dashboard', director, asyncHandler(report.dashboard));
  router.get('/reports', director, asyncHandler(report.list));
  router.post('/reports/generate', director, asyncHandler(report.generate));
  router.get('/audit-log', director, asyncHandler(report.auditLog));

  return router;
}

module.exports = createReportsRoutes;
