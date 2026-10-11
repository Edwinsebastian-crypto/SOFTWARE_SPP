'use strict';
const HttpError = require('../utils/http-error');
const { COOKIES } = require('../config/constants');
const { writeSession } = require('../utils/session-cookies');

/**
 * Builds the authentication middlewares on top of the session service.
 *  - api:  for /api endpoints, answers 401 when there is no valid session.
 *  - page: for HTML pages, redirects to the login screen.
 *  - resolveUser: returns the user (or null) without answering; it renews the cookies when the
 *    access token had to be refreshed.
 */
function createAuthenticator(sessionService) {
  async function resolveUser(req, res) {
    const { user, refreshedSession } = await sessionService.resolve({
      accessToken: req.cookies?.[COOKIES.ACCESS],
      refreshToken: req.cookies?.[COOKIES.REFRESH]
    });
    if (refreshedSession) writeSession(res, refreshedSession);
    return user;
  }

  const api = async (req, res, next) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return next(HttpError.unauthorized());
      req.user = user;
      next();
    } catch (err) { next(err); }
  };

  const page = async (req, res, next) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return res.redirect('/index.html');
      req.user = user;
      next();
    } catch (err) { next(err); }
  };

  return { resolveUser, api, page };
}

module.exports = { createAuthenticator };
