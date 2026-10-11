'use strict';
const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

const CLIENT_OPTIONS = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const USERS_PAGE_SIZE = 200;
const MAX_USER_PAGES = 50;

/**
 * Supabase is used for authentication ONLY.
 *  - publicClient(): anon key         -> sign in, refresh, validate a token.
 *  - adminClient():  service-role key -> the Director creates / edits / blocks / deletes accounts.
 * A fresh public client is created per call so sessions are never shared between users.
 */
class IdentityProvider {
  #admin = null;

  publicClient() {
    return createClient(env.require('SUPABASE_URL'), env.require('SUPABASE_ANON_KEY'), CLIENT_OPTIONS);
  }

  adminClient() {
    if (!this.#admin) {
      this.#admin = createClient(env.require('SUPABASE_URL'), env.require('SUPABASE_SERVICE_ROLE_KEY'), CLIENT_OPTIONS);
    }
    return this.#admin;
  }

  /**
   * Only accounts created by this system are accepted: they carry `app_metadata.spp = true`
   * (writable only with the service-role key) and a confirmed e-mail. This prevents anyone from
   * self-registering in Supabase with somebody else's institutional e-mail.
   */
  isSystemAccount(user) {
    return !!(user && user.email && user.app_metadata && user.app_metadata.spp === true && user.email_confirmed_at);
  }

  /**
   * Finds a Supabase account by e-mail (our tables store no Supabase uid: the institutional e-mail is the link).
   * Walks the paginated listing; fine for an institution with hundreds or a few thousand users.
   */
  async findByEmail(email) {
    const target = String(email).trim().toLowerCase();
    for (let page = 1; page <= MAX_USER_PAGES; page++) {
      const { data, error } = await this.adminClient().auth.admin.listUsers({ page, perPage: USERS_PAGE_SIZE });
      if (error) throw new Error(`Supabase: ${error.message}`);
      const users = data?.users || [];
      const match = users.find((u) => (u.email || '').toLowerCase() === target);
      if (match) return match;
      if (users.length < USERS_PAGE_SIZE) return null;
    }
    return null;
  }
}

module.exports = new IdentityProvider();
