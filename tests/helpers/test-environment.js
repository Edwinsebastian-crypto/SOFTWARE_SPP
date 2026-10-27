'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Module } = require('module');

const ROOT = path.join(__dirname, '..', '..');
const PRACTICE_SCHEMA = path.join(ROOT, 'database', 'fixtures', 'practice-legacy-schema.sql');

/**
 * Points the application at LOCAL test databases. The tests DROP the `public` schema, so this refuses to
 * run against anything that is not on localhost.
 */
function configureTestDatabases() {
  const practiceUrl = process.env.DATABASE_URL_PRACTICE_TEST || 'postgres://spp:spp@localhost/spp_est';
  const { hostname } = new URL(practiceUrl);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
    throw new Error(`Refusing to run destructive tests against a non-local database (${hostname})`);
  }
  process.env.DATABASE_URL_PRACTICE = practiceUrl;
  process.env.DB_SSL = 'false';
  // never let a developer's real credentials leak into a test run
  delete process.env.DATABASE_URL_ESTUDIANTE;
}

/** Drops and recreates the practice schema with the legacy practicum tables. */
async function resetDatabases(postgres) {
  await postgres.pool('practice').query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await postgres.pool('practice').query(fs.readFileSync(PRACTICE_SCHEMA, 'utf8'));
}

/**
 * Replaces `@supabase/supabase-js` with an in-memory fake. MUST be called before the application is required.
 * @returns {{accounts: Map, createAccount: Function}}
 */
function installSupabaseFake() {
  const accounts = new Map(); // email -> account
  const tokens = new Map(); // token -> account
  let counter = 0;

  const createAccount = (email, password, appMetadata = { spp: true }, confirmed = true) => {
    const account = { id: crypto.randomUUID(), email, password, app_metadata: appMetadata, email_confirmed_at: confirmed ? 'ok' : null };
    accounts.set(email, account);
    return account;
  };
  const publicView = (a) => ({ id: a.id, email: a.email, app_metadata: a.app_metadata, email_confirmed_at: a.email_confirmed_at });

  const fake = {
    createClient: () => ({
      auth: {
        signInWithPassword: async ({ email, password }) => {
          const account = accounts.get(email);
          if (!account || account.password !== password) return { data: null, error: { message: 'Invalid login' } };
          const token = `tok${++counter}`;
          tokens.set(token, account);
          return { data: { user: publicView(account), session: { access_token: token, refresh_token: `r${counter}`, expires_in: 3600 } }, error: null };
        },
        getUser: async (token) => (tokens.has(token)
          ? { data: { user: publicView(tokens.get(token)) }, error: null }
          : { data: null, error: { message: 'bad' } }),
        refreshSession: async () => ({ data: null, error: { message: 'no' } }),
        admin: {
          createUser: async ({ email, password, app_metadata: appMetadata }) => {
            if (accounts.has(email)) return { data: null, error: { message: 'already registered' } };
            return { data: { user: publicView(createAccount(email, password, appMetadata)) }, error: null };
          },
          deleteUser: async (id) => {
            for (const [email, account] of accounts) if (account.id === id) accounts.delete(email);
            return { error: null };
          },
          updateUserById: async (id, { password }) => {
            for (const account of accounts.values()) if (account.id === id) account.password = password;
            return { error: null };
          },
          listUsers: async () => ({ data: { users: [...accounts.values()].map(publicView) }, error: null }),
          signOut: async () => ({ error: null })
        }
      }
    })
  };

  process.env.SUPABASE_URL = 'http://fake';
  process.env.SUPABASE_ANON_KEY = 'a';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
  const original = Module._load;
  Module._load = function load(request, ...rest) {
    return request === '@supabase/supabase-js' ? fake : original.call(this, request, ...rest);
  };
  return { accounts, createAccount };
}

/** Replaces Cloudinary's uploader with a fake that records destroyed public ids. Call after requiring the app code. */
function installCloudinaryFake() {
  const cloudinary = require(path.join(ROOT, 'src', 'infrastructure', 'cloudinary'));
  const destroyed = [];
  cloudinary.uploader = {
    upload_stream: (options, callback) => ({
      end: (buffer) => setImmediate(() => callback(null, {
        secure_url: `https://res.cloudinary.com/demo/raw/upload/v1/${options.folder}/f${buffer.length}.txt`,
        public_id: `${options.folder}/f${buffer.length}.txt`,
        resource_type: 'raw'
      }))
    }),
    destroy: async (publicId) => { destroyed.push(publicId); return {}; }
  };
  return { destroyed };
}

module.exports = { ROOT, configureTestDatabases, resetDatabases, installSupabaseFake, installCloudinaryFake };
