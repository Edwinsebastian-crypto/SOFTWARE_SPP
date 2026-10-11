'use strict';
const path = require('path');
const { ROLE_LIST } = require('../config/constants');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

/** Serves the HTML pages. Each panel is only delivered to the role it belongs to. */
class PageController {
  constructor({ resolveUser }) {
    this.resolveUser = resolveUser;
  }

  static get PUBLIC_DIR() { return PUBLIC_DIR; }

  /** GET /pages/:page.html  (runs after the `page` authentication middleware) */
  panel = (req, res) => {
    const { page } = req.params;
    if (!ROLE_LIST.includes(page)) return res.status(404).send('Not found');
    if (req.user.role !== page) return res.redirect(`/pages/${req.user.role}.html`);
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(PUBLIC_DIR, 'pages', `${page}.html`));
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
