'use strict';
const { COOKIES } = require('../config/constants');
const { parseLogin, parseRegister } = require('../validators/auth.validator');
const { toSessionDto } = require('../presenters');
const { writeSession, clearSession } = require('../utils/session-cookies');

class AuthController {
  constructor({ authService, userService }) {
    this.authService = authService;
    this.userService = userService;
  }

  /** GET /api/auth/programs — public list (id, name, faculty) for the registration form */
  programs = async (_req, res) => {
    res.json({ programs: await this.userService.listPrograms() });
  };

  /** POST /api/auth/register — creates a PENDING account; the Director accepts it later */
  register = async (req, res) => {
    await this.userService.register(parseRegister(req.body));
    res.status(201).json({ message: 'Registration received. The Director must accept it before you can sign in.' });
  };

  /** POST /api/auth/login  { username, password } — the role is detected automatically */
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
