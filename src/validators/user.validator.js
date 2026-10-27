'use strict';
const HttpError = require('../utils/http-error');
const v = require('../utils/validators');
const { toInstitutionalEmail } = require('../utils/format');
const { ROLE_LIST, USER_STATUS, USER_STATUS_LIST, DOCUMENT_TYPES } = require('../config/constants');

function parsePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 72 ||
      !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    throw HttpError.badRequest('The password must be 8 to 72 characters long and include an uppercase letter, a lowercase letter and a number');
  }
  return value;
}

function parseEmail(value) {
  const email = toInstitutionalEmail(v.text(value, { field: 'email', max: 100 }));
  if (!v.isEmail(email) || email.length > 100) throw HttpError.badRequest('Invalid e-mail');
  return email;
}

function parseDocumentNumber(value) {
  const documentNumber = v.text(value, { field: 'document', max: 30 });
  if (!/^[0-9A-Za-z-]+$/.test(documentNumber)) throw HttpError.badRequest('Invalid document');
  return documentNumber;
}

/** Fields shared by creation and update. */
function parseProfile(body) {
  return {
    status: v.oneOf(body.status, USER_STATUS_LIST, USER_STATUS.ACTIVE),
    documentType: v.oneOf(body.documentType, DOCUMENT_TYPES, 'CC'),
    firstName: v.text(body.firstName, { field: 'first name', max: 80 }),
    lastName: v.text(body.lastName, { field: 'last name', max: 80 }),
    // required for students and tutors only: the service enforces it once the role is known
    programName: v.text(body.program, { field: 'program', max: 100, required: false })
  };
}

/** POST /api/users */
function parseCreateUser(body = {}) {
  const input = body || {};
  if (!ROLE_LIST.includes(input.role)) throw HttpError.badRequest('Invalid role');
  return {
    role: input.role,
    documentNumber: parseDocumentNumber(input.documentNumber),
    ...parseProfile(input),
    email: parseEmail(input.email),
    password: parsePassword(input.password)
  };
}

/** PUT /api/users/:document (the role, document and e-mail never change here). The password is optional. */
function parseUpdateUser(body = {}) {
  const input = body || {};
  return { ...parseProfile(input), password: input.password ? parsePassword(input.password) : null };
}

/** `:document` path parameter. */
function parseDocumentParam(value) {
  return v.text(value, { field: 'document', max: 30 });
}

function parseStatus(value) {
  if (!USER_STATUS_LIST.includes(value)) throw HttpError.badRequest('Invalid status');
  return value;
}

/** GET /api/users?role=&status=&search= */
function parseUserFilters(query = {}) {
  const { role, status, search } = query;
  if (role && !ROLE_LIST.includes(role)) throw HttpError.badRequest('Invalid role');
  if (status && !USER_STATUS_LIST.includes(status)) throw HttpError.badRequest('Invalid status');
  return { role, status, search: typeof search === 'string' ? search.slice(0, 80) : undefined };
}

module.exports = { parsePassword, parseCreateUser, parseUpdateUser, parseDocumentParam, parseStatus, parseUserFilters };
