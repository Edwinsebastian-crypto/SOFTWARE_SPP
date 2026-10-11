'use strict';
const mongoose = require('mongoose');
const env = require('../config/env');

/**
 * Two independent connections inside the same cluster:
 *  - `primary`:       audit log + accreditation indicators
 *  - `notifications`: notification queue consumed by the mail microservice
 * They are created lazily (only when the URI exists), so the app boots even when Mongo is not configured.
 */
const CONNECTIONS = Object.freeze({
  primary: { variable: 'MONGO_URI_PRIMARY', label: 'mongo-primary' },
  notifications: { variable: 'MONGO_URI_NOTIFICATIONS', label: 'mongo-notifications' }
});

class MongoConnections {
  #connections = new Map();

  /** @param {'primary'|'notifications'} name @returns {mongoose.Connection|null} */
  connection(name) {
    const config = CONNECTIONS[name];
    if (!config) throw new Error(`Unknown Mongo connection: ${name}`);
    if (!this.#connections.has(name)) this.#connections.set(name, this.#create(config));
    return this.#connections.get(name);
  }

  #create({ variable, label }) {
    const uri = env.get(variable);
    if (!uri) {
      console.warn(`[mongo] ${variable} is not set: ${label} is disabled`);
      return null;
    }
    const connection = mongoose.createConnection(uri);
    connection.on('connected', () => console.log(`Connected to ${label}`));
    connection.on('error', (err) => console.error(`Error connecting to ${label}:`, err.message));
    return connection;
  }

  async close() {
    await Promise.all([...this.#connections.values()].filter(Boolean).map((c) => c.close()));
    this.#connections.clear();
  }
}

module.exports = new MongoConnections();
