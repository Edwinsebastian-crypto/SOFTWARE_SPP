'use strict';
const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { ROLES } = require('../config/constants');

/** /api/institutions and /api/practice-types — catalogs administered by the Director. */
function createCatalogRoutes({ controllers: { institution, practiceType }, guard }) {
  const router = express.Router();
  const director = guard(ROLES.DIRECTOR);

  router.get('/institutions', director, asyncHandler(institution.list));
  router.post('/institutions', director, asyncHandler(institution.create));
  router.put('/institutions/:id', director, asyncHandler(institution.update));
  router.delete('/institutions/:id', director, asyncHandler(institution.remove));

  router.get('/practice-types', director, asyncHandler(practiceType.list));
  router.post('/practice-types', director, asyncHandler(practiceType.create));
  router.put('/practice-types/:id', director, asyncHandler(practiceType.update));
  router.delete('/practice-types/:id', director, asyncHandler(practiceType.remove));

  return router;
}

module.exports = createCatalogRoutes;
