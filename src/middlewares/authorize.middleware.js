'use strict';
const HttpError = require('../utils/http-error');

/** Role-based access control: lets the request through only when the user holds one of `roles`. */
const requireRole = (...roles) => (req, _res, next) =>
  (roles.includes(req.user?.role) ? next() : next(HttpError.forbidden()));

module.exports = { requireRole };
