'use strict';
const mongoose = require('mongoose');
const defineModel = require('./define-model');

/** Notification queue (Mongo "notifications" connection, collection `notificaciones`). Stored keys are legacy names. */
const schema = new mongoose.Schema({
  tipo: {
    type: String,
    required: true,
    enum: ['PracticaAsignada'] // add values here when new notification types are defined
  },
  destinatario: {
    numDocumento: { type: String, required: true },
    correo: { type: String, required: true },
    nombreCompleto: { type: String, required: true }
  },
  idPractica: { type: String, required: true }, // varchar(30) in PostgreSQL
  asunto: { type: String, required: true },
  contenido: { type: String, required: true },
  fechaCreacion: { type: Date, required: true, default: Date.now },
  fechaEnvio: { type: Date, required: false } // unknown until the mail has actually been sent
});

module.exports = defineModel('notifications', 'Notificacion', schema, 'notificaciones');
