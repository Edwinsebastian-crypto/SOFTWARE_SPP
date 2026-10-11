'use strict';
const env = require('../config/env');

/** "Jane Doe" from any object exposing `firstName` / `lastName`. */
const fullName = (person) => `${person.firstName} ${person.lastName}`.trim();

/** "jdoe" -> "jdoe@<institutional domain>"; a value that already contains "@" is respected. */
function toInstitutionalEmail(value) {
  const v = String(value).trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${env.institutionalDomain}`;
}

module.exports = { fullName, toInstitutionalEmail };
