'use strict';
// Usage: npm run users:migrate                        -> a RANDOM temporary password for every user
//        npm run users:migrate -- --password=Test1234 -> the same temporary password for everyone (handy for TESTING)
// Creates, in Supabase, the access account of the users that already exist in your database and do not have one yet.
// Your tables are not modified. The old passwords of the "contrasena" column are NEVER used or read.
const crypto = require('crypto');
const identity = require('../infrastructure/supabase');
const postgres = require('../infrastructure/postgres');
const schemaResolver = require('../infrastructure/schema-resolver');
const UserRepository = require('../repositories/user.repository');
const { USER_STATUS } = require('../config/constants');

const PASSWORD_ARG = '--password=';

function randomPassword() {
  const groups = ['abcdefghjkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789'];
  const all = groups.join('');
  let password = groups.map((g) => g[crypto.randomInt(g.length)]).join('');
  while (password.length < 12) password += all[crypto.randomInt(all.length)];
  return password;
}

(async () => {
  await schemaResolver.load();
  const arg = process.argv.find((a) => a.startsWith(PASSWORD_ARG));
  const fixedPassword = arg ? arg.slice(PASSWORD_ARG.length) : null;
  if (fixedPassword && !(fixedPassword.length >= 8 && /[a-z]/.test(fixedPassword) && /[A-Z]/.test(fixedPassword) && /\d/.test(fixedPassword))) {
    throw new Error('The password must have 8+ characters with an uppercase letter, a lowercase letter and a number.');
  }

  const admin = identity.adminClient();
  const users = await new UserRepository().list({ status: USER_STATUS.ACTIVE });
  console.log(`Active users in the database: ${users.length}\n`);

  let created = 0; let skipped = 0; let failed = 0;
  for (const user of users) {
    const email = (user.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log(`  ! ${user.role} ${user.documentNumber}: invalid e-mail, skipped`);
      failed++;
      continue;
    }
    const password = fixedPassword || randomPassword();
    const { error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, app_metadata: { spp: true, role: user.role }
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) { skipped++; console.log(`  = ${email}: already had an account`); }
      else { failed++; console.log(`  ! ${email}: ${error.message}`); }
      continue;
    }
    created++;
    console.log(`  + ${user.role.padEnd(10)} ${email}  temporary password: ${password}`);
  }
  console.log(`\nCreated: ${created} · Already existed: ${skipped} · Failed: ${failed}`);
  if (created) console.log('Hand the temporary passwords over through a secure channel; do not leave them in this history.');
})().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => postgres.close());
