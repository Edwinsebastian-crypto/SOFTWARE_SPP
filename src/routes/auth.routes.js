'use strict';
const express = require('express');
const env = require('../config/env');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/async-handler');

const skipInTests = () => process.env.NODE_ENV === 'test';
const limiterMessage = { error: 'Too many attempts. Try again later.' };
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: Number(env.get('LOGIN_MAX_ATTEMPTS', 10)),
  standardHeaders: true, legacyHeaders: false, skip: skipInTests, message: limiterMessage
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, skip: skipInTests, message: limiterMessage
});

/** /api/auth — Supabase-backed authentication. */
function createAuthRoutes({ controllers: { auth }, guard }) {
  const router = express.Router();

  router.get('/programs', asyncHandler(auth.programs));
  router.post('/register', registerLimiter, asyncHandler(auth.register));
  router.post('/login', loginLimiter, asyncHandler(auth.login));
  router.post('/logout', asyncHandler(auth.logout));
  router.get('/session', guard(), asyncHandler(auth.session));

  return router;
}

module.exports = createAuthRoutes;
