'use strict';
const HttpError = require('../utils/http-error');
const { USER_STATUS } = require('../config/constants');
const { toInstitutionalEmail } = require('../utils/format');

/** Login / logout. Supabase checks the credentials; the practicum database decides who the user is. */
class AuthService {
  constructor({ identity, userRepository }) {
    this.identity = identity;
    this.userRepository = userRepository;
  }

  /**
   * @param {{username, password, role}} credentials
   * @returns {Promise<{session: object, user: object}>} the Supabase session and the practicum user
   */
  async login({ username, password, role }) {
    // 1) Supabase validates username and password
    const { data, error } = await this.identity.publicClient().auth.signInWithPassword({
      email: toInstitutionalEmail(username),
      password
    });
    if (error || !data?.session || !this.identity.isSystemAccount(data.user)) {
      throw HttpError.unauthorized('Incorrect username or password');
    }

    // 2) The database says who they are and which role they hold (the link is the institutional e-mail)
    const user = await this.userRepository.findByEmail(data.user.email);
    if (!user) throw HttpError.forbidden('Your account is not registered in the practicum system');
    if (user.status !== USER_STATUS.ACTIVE) throw HttpError.forbidden('Your account is not active. Contact the Practicum Directorate');
    if (user.role !== role) throw HttpError.forbidden('The selected role does not match your account');

    return { session: data.session, user };
  }

  async logout(accessToken) {
    if (!accessToken) return;
    try {
      await this.identity.adminClient().auth.admin.signOut(accessToken);
    } catch (_) { /* the token may already have expired */ }
  }
}

module.exports = AuthService;
