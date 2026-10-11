'use strict';
const { USER_STATUS } = require('../config/constants');

const TOKEN_CACHE_TTL_MS = 60 * 1000;
const TOKEN_CACHE_MAX_ENTRIES = 5000;

/**
 * Resolves the authenticated practicum user from the session cookies.
 *  - The JWT only lives in an httpOnly cookie.
 *  - The link between Supabase and our tables is the INSTITUTIONAL E-MAIL (no uid column exists).
 *  - Only accounts created by this system are accepted (see IdentityProvider.isSystemAccount).
 *  - Role and status are ALWAYS read from the database, never from the token.
 */
class SessionService {
  #tokenCache = new Map(); // token -> { user, expiresAt }

  constructor({ identity, userRepository }) {
    this.identity = identity;
    this.userRepository = userRepository;
  }

  async #accountFromToken(token) {
    const cached = this.#tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) return cached.user;
    const { data, error } = await this.identity.publicClient().auth.getUser(token);
    if (error || !this.identity.isSystemAccount(data?.user)) return null;
    this.#tokenCache.set(token, { user: data.user, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    if (this.#tokenCache.size > TOKEN_CACHE_MAX_ENTRIES) this.#tokenCache.clear();
    return data.user;
  }

  /**
   * @returns {Promise<{user: object|null, refreshedSession: object|null}>}
   *   `refreshedSession` is set when the access token had to be renewed with the refresh token
   *   (the caller must then persist it in the cookies).
   */
  async resolve({ accessToken, refreshToken }) {
    let account = accessToken ? await this.#accountFromToken(accessToken) : null;
    let refreshedSession = null;

    if (!account && refreshToken) {
      const { data, error } = await this.identity.publicClient().auth.refreshSession({ refresh_token: refreshToken });
      const refreshed = data?.user || data?.session?.user;
      if (!error && data?.session && this.identity.isSystemAccount(refreshed)) {
        refreshedSession = data.session;
        account = refreshed;
      }
    }
    if (!account) return { user: null, refreshedSession: null };

    const row = await this.userRepository.findByEmail(account.email);
    if (!row || row.status !== USER_STATUS.ACTIVE) return { user: null, refreshedSession: null };
    return {
      user: {
        uid: account.id, role: row.role, documentNumber: row.documentNumber, documentType: row.documentType,
        firstName: row.firstName, lastName: row.lastName, email: row.email,
        program: row.program || '', status: row.status
      },
      refreshedSession
    };
  }
}

module.exports = SessionService;
