'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

/**
 * Canonical (English) variable name -> legacy (Spanish) name.
 * Legacy names are still honoured so that existing `.env` files keep working after the rename.
 */
const LEGACY_ALIASES = Object.freeze({
  DATABASE_URL_PRACTICE: 'DATABASE_URL_ESTUDIANTE',
  DATABASE_URL_EVALUATION: 'DATABASE_URL_EVALUACION',
  MONGO_URI_PRIMARY: 'MONGO_URI_BASE1',
  MONGO_URI_NOTIFICATIONS: 'MONGO_URI_BASE2',
  INSTITUTIONAL_DOMAIN: 'DOMINIO_INSTITUCIONAL',
  LOGIN_MAX_ATTEMPTS: 'LOGIN_MAX_INTENTOS',
  DIRECTOR_FIRST_NAMES: 'DIRECTOR_NOMBRES',
  DIRECTOR_LAST_NAMES: 'DIRECTOR_APELLIDOS',
  DIRECTOR_DOCUMENT: 'DIRECTOR_DOCUMENTO',
  DIRECTOR_USERNAME: 'DIRECTOR_USUARIO'
});

const isSet = (value) => value !== undefined && value !== '';

/** Centralised, validated access to environment variables. */
class Env {
  /** Reads a variable (falling back to its legacy name) or returns `fallback`. */
  get(name, fallback) {
    const value = process.env[name];
    if (isSet(value)) return value;
    const legacy = LEGACY_ALIASES[name];
    if (legacy && isSet(process.env[legacy])) return process.env[legacy];
    return fallback;
  }

  /** Reads a mandatory variable or throws a descriptive error. */
  require(name) {
    const value = this.get(name);
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  }

  get isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  get port() {
    return Number(this.get('PORT', 3000));
  }

  /** Domain appended to bare usernames ("jdoe" -> "jdoe@<domain>"). */
  get institutionalDomain() {
    return this.get('INSTITUTIONAL_DOMAIN', 'university.edu');
  }
}

module.exports = new Env();
