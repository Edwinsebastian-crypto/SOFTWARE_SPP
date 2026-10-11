'use strict';
const env = require('../config/env');
const { COOKIES } = require('../config/constants');

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;

function cookieOptions(maxAgeMs) {
  return { httpOnly: true, sameSite: 'lax', secure: env.isProduction, path: '/', maxAge: maxAgeMs };
}

/** Stores the Supabase session in httpOnly cookies (page JavaScript can never read the JWT). */
function writeSession(res, session) {
  res.cookie(COOKIES.ACCESS, session.access_token, cookieOptions((session.expires_in || 3600) * 1000));
  res.cookie(COOKIES.REFRESH, session.refresh_token, cookieOptions(REFRESH_TTL_MS));
}

function clearSession(res) {
  res.clearCookie(COOKIES.ACCESS, { path: '/' });
  res.clearCookie(COOKIES.REFRESH, { path: '/' });
}

module.exports = { writeSession, clearSession };
