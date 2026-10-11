'use strict';
const express = require('express');
const env = require('../config/env');
const asyncHandler = require('../utils/async-handler');

/** /api/auth — Supabase-backed authentication. */
function createAuthRoutes({ controllers: { auth }, guard }) {
  const router = express.Router();

  router.post('/login', asyncHandler(auth.login));
  router.post('/logout', asyncHandler(auth.logout));
  router.get('/session', guard(), asyncHandler(auth.session));

  return router;
}

module.exports = createAuthRoutes;
