'use strict';
const express = require('express');
const { csrfProtection } = require('../middlewares/csrf.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const asyncHandler = require('../utils/async-handler');

const createAuthRoutes = require('./auth.routes');
const createUsersRoutes = require('./users.routes');
const createCatalogRoutes = require('./catalog.routes');
const createPracticesRoutes = require('./practices.routes');
const createActivitiesRoutes = require('./activities.routes');
const createReportsRoutes = require('./reports.routes');
const createEvaluationsRoutes = require('./evaluations.routes');

/**
 * JSON API mounted at /api.
 * `guard(...roles)` = authenticated user, optionally restricted to the given roles.
 */
function createApiRouter({ controllers, authenticate }) {
  const guard = (...roles) => (roles.length ? [authenticate.api, requireRole(...roles)] : [authenticate.api]);
  const deps = { controllers, guard };

  const router = express.Router();
  router.use(csrfProtection);
  router.use('/auth', createAuthRoutes(deps));
  router.use('/users', createUsersRoutes(deps));
  router.use('/practices', createPracticesRoutes(deps));
  router.use(createCatalogRoutes(deps));
  router.use(createActivitiesRoutes(deps));
  router.use(createReportsRoutes(deps));
  router.use('/evaluations', createEvaluationsRoutes(deps));
  return router;
}

/** HTML pages. They are registered BEFORE the static files so /pages/*.html is never served without a session. */
function createPagesRouter({ controllers: { page }, authenticate }) {
  const router = express.Router();
  router.get(['/', '/index.html'], asyncHandler(page.home));
  router.get('/pages/:page.html', authenticate.page, page.panel);
  return router;
}

module.exports = { createApiRouter, createPagesRouter };
