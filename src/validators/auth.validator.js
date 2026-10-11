'use strict';
const HttpError = require('../utils/http-error');
const { ROLE_LIST } = require('../config/constants');

/** @returns {{username: string, password: string, role: string}} */
function parseLogin(body = {}) {
  const { username, password, role } = body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    throw HttpError.badRequest('Enter your username and password');
  }
  if (!ROLE_LIST.includes(role)) throw HttpError.badRequest('Select a valid role');
  if (username.length > 150 || password.length > 200) throw HttpError.badRequest('Invalid credentials');
  return { username, password, role };
}

module.exports = { parseLogin };
