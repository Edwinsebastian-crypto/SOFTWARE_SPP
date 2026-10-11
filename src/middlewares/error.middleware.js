'use strict';
const HttpError = require('../utils/http-error');
const { PG_ERRORS } = require('../utils/db-errors');
const { UPLOAD } = require('../config/constants');

/** Unknown /api route. */
const apiNotFound = (_req, _res, next) => next(HttpError.notFound('Route not found'));

/** Translates any error into an HTTP status + message. Only HttpError messages are exposed as-is. */
function resolveError(err) {
  if (err instanceof HttpError) return { status: err.status, message: err.message };
  if (err.code === 'LIMIT_FILE_SIZE') return { status: 413, message: `The file exceeds the maximum size of ${UPLOAD.MAX_BYTES / (1024 * 1024)} MB` };
  if (err.name === 'MulterError') return { status: 400, message: 'Invalid file' };
  if (err.type === 'entity.parse.failed') return { status: 400, message: 'Invalid JSON' };
  if (err.type === 'entity.too.large') return { status: 413, message: 'Payload too large' };
  if (err.code === PG_ERRORS.UNIQUE_VIOLATION) return { status: 409, message: 'A record with that data already exists' };
  if (err.code === PG_ERRORS.FOREIGN_KEY_VIOLATION) return { status: 409, message: 'The record is related to other data' };
  if (err.code === PG_ERRORS.CHECK_VIOLATION || err.code === PG_ERRORS.INVALID_TEXT_REPRESENTATION) return { status: 400, message: 'Invalid data' };
  return { status: 500, message: 'Internal server error' };
}

function errorHandler(err, req, res, _next) {
  const { status, message } = resolveError(err);
  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (req.originalUrl.startsWith('/api')) return res.status(status).json({ error: message });
  res.status(status).send(message);
}

module.exports = { apiNotFound, errorHandler };
