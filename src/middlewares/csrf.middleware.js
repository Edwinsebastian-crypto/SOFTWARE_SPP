'use strict';
const HttpError = require('../utils/http-error');
const { CSRF_HEADER } = require('../config/constants');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF mitigation: every request that modifies data must carry the `X-SPP: 1` header. */
function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get(CSRF_HEADER) !== '1') return next(HttpError.forbidden('Request not allowed'));
  next();
}

module.exports = { csrfProtection };
