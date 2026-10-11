'use strict';
const {
  parseCreateUser, parseUpdateUser, parseDocumentParam, parseStatus, parseUserFilters
} = require('../validators/user.validator');
const { toUserDto } = require('../presenters');

/** User management (Director only). */
class UserController {
  constructor({ userService }) {
    this.userService = userService;
  }

  /** GET /api/users?role=&status=&search= */
  list = async (req, res) => {
    const users = await this.userService.list(parseUserFilters(req.query));
    res.json({ users: users.map(toUserDto) });
  };

  /** GET /api/users/programs */
  programs = async (_req, res) => {
    res.json({ programs: await this.userService.listPrograms() });
  };

  /** POST /api/users */
  create = async (req, res) => {
    const user = await this.userService.create(req.user, parseCreateUser(req.body));
    res.status(201).json({ user: toUserDto(user) });
  };

  /** PUT /api/users/:document  (the role and e-mail are not changed here) */
  update = async (req, res) => {
    const user = await this.userService.update(req.user, parseDocumentParam(req.params.document), parseUpdateUser(req.body));
    res.json({ user: toUserDto(user) });
  };

  /** PATCH /api/users/:document/status  { status } */
  changeStatus = async (req, res) => {
    const user = await this.userService.changeStatus(
      req.user, parseDocumentParam(req.params.document), parseStatus(req.body?.status)
    );
    res.json({ user: toUserDto(user) });
  };

  /** DELETE /api/users/:document */
  remove = async (req, res) => {
    await this.userService.remove(req.user, parseDocumentParam(req.params.document));
    res.json({ ok: true });
  };
}

module.exports = UserController;
