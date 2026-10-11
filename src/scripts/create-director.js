'use strict';
// Usage: npm run director:create  (reads the DIRECTOR_* variables from .env)
//  - If the director already exists in your database (by e-mail or document): only creates the Supabase access account.
//  - If not: creates the Supabase account and the row in the `director` table.
const env = require('../config/env');
const identity = require('../infrastructure/supabase');
const postgres = require('../infrastructure/postgres');
const schemaResolver = require('../infrastructure/schema-resolver');
const UserRepository = require('../repositories/user.repository');
const { ROLES, USER_STATUS } = require('../config/constants');
const { toInstitutionalEmail } = require('../utils/format');

(async () => {
  await schemaResolver.load();
  const email = toInstitutionalEmail(env.require('DIRECTOR_USERNAME'));
  const password = env.require('DIRECTOR_PASSWORD');
  const users = new UserRepository();

  const director = await users.findByEmail(email);
  if (!director) {
    const documentNumber = env.require('DIRECTOR_DOCUMENT');
    if (await users.findByDocument(documentNumber)) {
      throw new Error('A user with that document already exists but with another e-mail. Use their e-mail in DIRECTOR_USERNAME.');
    }
    await users.create(ROLES.DIRECTOR, {
      documentNumber, documentType: 'CC', firstName: env.require('DIRECTOR_FIRST_NAMES'),
      lastName: env.require('DIRECTOR_LAST_NAMES'), email, status: USER_STATUS.ACTIVE
    });
    console.log('Row created in the director table.');
  } else {
    if (director.role !== ROLES.DIRECTOR) throw new Error(`That e-mail belongs to a ${director.role}, not to a director.`);
    console.log('The director already exists in the database; it is kept as it is.');
  }

  if (await identity.findByEmail(email)) { console.log('It already has a Supabase account. Nothing else to do.'); return; }
  const { error } = await identity.adminClient().auth.admin.createUser({
    email, password, email_confirm: true, app_metadata: { spp: true, role: ROLES.DIRECTOR }
  });
  if (error) throw new Error(`Supabase: ${error.message}`);
  console.log(`Access account created: ${email}`);
})().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => postgres.close());
