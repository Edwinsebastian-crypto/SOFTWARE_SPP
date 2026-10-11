'use strict';
const HttpError = require('./http-error');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEXT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,30}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Trimmed string. Empty -> error when `required`, otherwise ''. */
function text(value, { field, max = 255, required = true } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) {
    if (required) throw HttpError.badRequest(`The field "${field}" is required`);
    return '';
  }
  if (v.length > max) throw HttpError.badRequest(`The field "${field}" cannot exceed ${max} characters`);
  return v;
}

function integer(value, { field, min = 1, max = 2147483647 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw HttpError.badRequest(`The field "${field}" is not valid`);
  return n;
}

/** YYYY-MM-DD calendar date. */
function isoDate(value, field) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw HttpError.badRequest(`The field "${field}" must use the YYYY-MM-DD format`);
  }
  return value;
}

/** Keys of the practicum database are varchar(30): letters, digits, dot, underscore and hyphen. */
function textId(value, field = 'id') {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!TEXT_ID_PATTERN.test(v)) throw HttpError.badRequest(`The field "${field}" is not valid`);
  return v;
}

function isEmail(value) {
  return EMAIL_PATTERN.test(value);
}

/** Returns `value` when it is one of `allowed`, otherwise `fallback`. */
function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

module.exports = { text, integer, isoDate, textId, isEmail, oneOf };
