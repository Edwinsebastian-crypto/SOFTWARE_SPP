'use strict';
const env = require('./config/env');
const postgres = require('./infrastructure/postgres');
const mongo = require('./infrastructure/mongo');
const schemaResolver = require('./infrastructure/schema-resolver');
const { createApp } = require('./app');

/** Reads the real structure of the tables, then opens the port. Resolves to `{ app, http }`. */
async function start() {
  try {
    await schemaResolver.load();
  } catch (err) {
    console.error('\nCould not read the practicum database:', err.message);
    console.error('Check DATABASE_URL_PRACTICE in your .env file\n');
    process.exit(1);
  }

  const app = createApp();
  const http = app.listen(env.port, () => console.log(`SPP listening on http://localhost:${env.port}`));

  const shutdown = async () => {
    console.log('Shutting down...');
    http.close();
    await Promise.allSettled([postgres.close(), mongo.close()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { app, http };
}

if (require.main === module) start();

module.exports = { start };
