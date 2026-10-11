'use strict';
const mongoose = require('mongoose');
const defineModel = require('./define-model');

/** Audit trail (Mongo "primary" connection, collection `auditoria`). Stored keys are legacy names. */
const schema = new mongoose.Schema({
  usuario: {
    numDocumento: { type: String, required: true },
    rol: { type: String, required: true },
    nombreCompleto: { type: String, required: true }
  },
  entidad: {
    type: String,
    required: true,
    enum: ['Practica', 'Bitacora', 'Actividad', 'Evidencia', 'Retroalimentacion', 'Respuesta', 'Usuario']
  },
  idEntidad: { type: String, required: true }, // comes from PostgreSQL, hence a String and not an ObjectId
  idPractica: { type: String, required: true }, // varchar(30) in PostgreSQL
  accion: { type: String, required: true, enum: ['Insertar', 'Modificar', 'Eliminar'] },
  fecha: { type: Date, required: true, default: Date.now },
  anio: { type: Number, required: true },
  mes: { type: Number, required: true, min: 1, max: 12 }
});

// `anio` and `mes` are derived from `fecha` before validation
schema.pre('validate', function deriveYearAndMonth(next) {
  if (this.fecha) {
    this.anio = this.fecha.getFullYear();
    this.mes = this.fecha.getMonth() + 1;
  }
  next();
});

module.exports = defineModel('primary', 'Auditoria', schema, 'auditoria');
