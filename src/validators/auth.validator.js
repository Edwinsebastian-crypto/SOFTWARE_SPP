'use strict';
const HttpError = require('../utils/http-error');
const v = require('../utils/validators');
const env = require('../config/env');
const { toInstitutionalEmail } = require('../utils/format');
const { REGISTRABLE_ROLES, DOCUMENT_TYPES } = require('../config/constants');
const { parsePassword } = require('./user.validator');

/** The role is NOT sent by the client: it is detected from the database after the credentials are checked. */
function parseLogin(body = {}) {
  const { username, password } = body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    throw HttpError.badRequest('Enter your username and password');
  }
  if (username.length > 150 || password.length > 200) throw HttpError.badRequest('Invalid credentials');
  return { username, password };
}

/** POST /api/auth/register — self-registration (student, tutor or advisor only; never director). */
function parseRegister(body = {}) {
  const input = body || {};
  if (!REGISTRABLE_ROLES.includes(input.role)) throw HttpError.badRequest('Select a valid role (student, academic tutor or pedagogical advisor)');
  const email = toInstitutionalEmail(v.text(input.email, { field: 'email', max: 100 }));
  if (!v.isEmail(email) || email.length > 100) throw HttpError.badRequest('Invalid e-mail');
  if (!email.endsWith(`@${env.institutionalDomain.toLowerCase()}`)) {
    throw HttpError.badRequest(`Use your institutional e-mail (@${env.institutionalDomain})`);
  }
  const documentNumber = v.text(input.documentNumber, { field: 'document', max: 30 });
  if (!/^[0-9A-Za-z-]+$/.test(documentNumber)) throw HttpError.badRequest('Invalid document');
  return {
    role: input.role,
    documentType: v.oneOf(input.documentType, DOCUMENT_TYPES, 'CC'),
    documentNumber,
    firstName: v.text(input.firstName, { field: 'first name', max: 80 }),
    lastName: v.text(input.lastName, { field: 'last name', max: 80 }),
    programName: v.text(input.program, { field: 'program', max: 100, required: false }),
    email,
    password: parsePassword(input.password),
    status: 'pending' // always: the Director approves the account
  };
}

module.exports = { parseLogin, parseRegister };
