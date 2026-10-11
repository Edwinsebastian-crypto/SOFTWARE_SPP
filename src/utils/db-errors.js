'use strict';
const HttpError = require('./http-error');

/** PostgreSQL error codes the application reacts to. */
const PG_ERRORS = Object.freeze({
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02'
});

/**
 * Runs `operation` and converts unique / foreign-key violations into 409 conflicts with a friendly message.
 * Any other error is re-thrown untouched.
 */
async function withConflictMapping(operation, { duplicateMessage, inUseMessage = 'It is in use by other records and cannot be deleted' } = {}) {
  try {
    return await operation();
  } catch (err) {
    if (err.code === PG_ERRORS.UNIQUE_VIOLATION && duplicateMessage) throw HttpError.conflict(duplicateMessage);
    if (err.code === PG_ERRORS.FOREIGN_KEY_VIOLATION) throw HttpError.conflict(inUseMessage);
    throw err;
  }
}

module.exports = { PG_ERRORS, withConflictMapping };
