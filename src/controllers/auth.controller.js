'use strict';
const { COOKIES } = require('../config/constants');
const { parseLogin } = require('../validators/auth.validator');
const { toSessionDto } = require('../presenters');
const { writeSession, clearSession } = require('../utils/session-cookies');

class AuthController {
  constructor({ authService }) {
    this.authService = authService;
  }

  /** POST /api/auth/login  { username, password, role } */
  login = async (req, res) => {
    const { session, user } = await this.authService.login(parseLogin(req.body));
    writeSession(res, session);
    res.json({ role: user.role, redirectTo: `/pages/${user.role}.html` });
  };

  /** POST /api/auth/logout */
  logout = async (req, res) => {
    await this.authService.logout(req.cookies?.[COOKIES.ACCESS]);
    clearSession(res);
    res.json({ ok: true });
  };

  /** GET /api/auth/session */
  session = (req, res) => {
    res.json(toSessionDto(req.user));
  };
}

module.exports = AuthController;
