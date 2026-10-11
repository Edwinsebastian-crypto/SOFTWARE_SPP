'use strict';
// Usage: npm run schema:apply
// Creates ONLY the tables of the EVALUATION database (pregunta, evaluacion, respuesta, retropregunta) that do not exist yet.
// The practicum database ALREADY has its tables (it is never touched).
const fs = require('fs');
const path = require('path');
const postgres = require('../infrastructure/postgres');

(async () => {
  const file = path.join(__dirname, '..', '..', 'database', 'schema', 'evaluation.sql');
  await postgres.pool('evaluation').query(fs.readFileSync(file, 'utf8'));
  console.log('OK  Evaluation database ready (only the missing tables were created).');
  console.log('    Now run: npm run schema:verify');
})().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => postgres.close());
