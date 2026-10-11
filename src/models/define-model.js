'use strict';
const mongo = require('../infrastructure/mongo');

/**
 * Returns a lazy accessor for a Mongoose model bound to one of the Mongo connections.
 * The accessor yields `null` when that connection is not configured, so callers can degrade gracefully.
 *
 * NOTE: stored field names and collection names of the Mongo models are LEGACY (Spanish) names kept
 * for compatibility with documents that already exist. Do not rename them without a data migration;
 * repositories translate to/from the English domain shape.
 */
function defineModel(connectionName, modelName, schema, collection) {
  let model = null;
  return () => {
    if (model) return model;
    const connection = mongo.connection(connectionName);
    if (!connection) return null;
    model = connection.model(modelName, schema, collection);
    return model;
  };
}

module.exports = defineModel;
