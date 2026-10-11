'use strict';
const HttpError = require('../utils/http-error');
const v = require('../utils/validators');

/** POST/PUT /api/institutions */
function parseInstitution(body = {}) {
  const input = body || {};
  const email = v.text(input.email, { field: 'email', max: 150 });
  if (!v.isEmail(email)) throw HttpError.badRequest('Invalid e-mail');
  return {
    taxId: v.text(input.taxId, { field: 'tax id', max: 10 }), // nitEntidad is varchar(10) in the legacy schema
    name: v.text(input.name, { field: 'name', max: 200 }),
    manager: v.text(input.manager, { field: 'manager', max: 150 }),
    address: v.text(input.address, { field: 'address', max: 200 }),
    email
  };
}

/** POST/PUT /api/practice-types */
function parsePracticeType(body = {}) {
  const input = body || {};
  return {
    name: v.text(input.name, { field: 'name', max: 150 }),
    semester: v.integer(input.semester, { field: 'semester', min: 1, max: 12 }),
    hours: v.integer(input.hours, { field: 'hours', min: 1, max: 5000 })
  };
}

module.exports = { parseInstitution, parsePracticeType };
