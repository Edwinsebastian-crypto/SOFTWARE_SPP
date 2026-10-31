'use strict';
const path = require('path');
const { ROLE_LIST } = require('../config/constants');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
/** Pages that are not a role panel, mapped to the only role allowed to see them. */
const EXTRA_PAGES = new Map([['director-evaluations', 'director']]);

/** Serves the HTML pages. Each panel is only delivered to the role it belongs to. */
class PageController {
  constructor({ resolveUser }) {
    this.resolveUser = resolveUser;
  }

  static get PUBLIC_DIR() { return PUBLIC_DIR; }

  /** GET /pages/:page.html  (runs after the `page` authentication middleware) */
  panel = (req, res) => {
    const { page } = req.params;
    if (page === 'evaluaciones-tutor') return res.redirect('/pages/tutor.html');
    if (page === 'evaluaciones-estudiante') return res.redirect('/pages/student.html');
    if (page === 'director-evaluations') return res.redirect('/pages/director.html#reports');
    const requiredRole = ROLE_LIST.includes(page) ? page : EXTRA_PAGES.get(page);
    if (!requiredRole) return res.status(404).send('Not found');
    if (req.user.role !== requiredRole) return res.redirect(`/pages/${req.user.role}.html`);
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(PUBLIC_DIR, 'pages', `${page}.html`));
  };

  /** GET /register.html -> public registration form (signed-in users go to their panel) */
  register = async (req, res, next) => {
    try {
      const user = await this.resolveUser(req, res);
      if (user) return res.redirect(`/pages/${user.role}.html`);
      res.set('Cache-Control', 'no-store');
      res.sendFile(path.join(PUBLIC_DIR, 'register.html'));
    } catch (err) { next(err); }
  };

  /** GET / and /index.html  -> users with a valid session go straight to their panel */
  home = async (req, res, next) => {
    try {
      const user = await this.resolveUser(req, res);
      if (user) return res.redirect(`/pages/${user.role}.html`);
      res.set('Cache-Control', 'no-store');
      res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    } catch (err) { next(err); }
  };
}

module.exports = PageController;
