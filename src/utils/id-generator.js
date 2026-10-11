'use strict';
const crypto = require('crypto');

/**
 * Primary keys of the practicum database are varchar(30), so they are generated here.
 * Example: `PRA-MG3K9X2A1F2C` (about 16 characters).
 */
function generateId(prefix) {
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${time}${random}`;
}

module.exports = { generateId };
