'use strict';
const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { ROLES } = require('../config/constants');

/** /api/users — user management (Director only). */
function createUsersRoutes({ controllers: { user }, guard }) {
  const router = express.Router();
  const director = guard(ROLES.DIRECTOR);

  router.get('/programs', director, asyncHandler(user.programs));
  router.get('/', director, asyncHandler(user.list));
  router.post('/', director, asyncHandler(user.create));
  router.put('/:document', director, asyncHandler(user.update));
  router.patch('/:document/status', director, asyncHandler(user.changeStatus));
  router.delete('/:document', director, asyncHandler(user.remove));

  return router;
}

module.exports = createUsersRoutes;
