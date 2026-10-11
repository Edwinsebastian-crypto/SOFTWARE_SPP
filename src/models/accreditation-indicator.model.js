'use strict';
const mongoose = require('mongoose');
const defineModel = require('./define-model');

const { Mixed } = mongoose.Schema.Types;

/** Accreditation indicators (Mongo "primary" connection, collection `indicadoresacreditacion`). Stored keys are legacy names. */
const schema = new mongoose.Schema({
  anio: { type: Number, required: true },
  idPrograma: { type: String, required: true }, // varchar(30) in PostgreSQL
  nombrePrograma: { type: String, required: true },
  totalEstudiantesActivos: { type: Number, required: true },
  practicasPorTipo: { type: [Mixed], required: true }, // [{ tipo, cantidad, promedioNota, porcentajeAprobacion }]
  distribucionNotas: { type: [Mixed], required: true }, // [{ rango, cantidadEstudiantes }]
  acompanamientoDocente: { type: Mixed, required: true }, // { retroalimentacionesTutor, retroalimentacionesAsesor }
  entidadesVinculadas: { type: [Mixed], required: true }, // [{ nombreEntidad, cantidadPracticas }]
  tasaDesercion: { type: Number, required: true }, // percentage, e.g. 12.5
  duracionPromedioPracticasDias: { type: Number, required: true },
  observaciones: { type: String, required: false }
});

module.exports = defineModel('primary', 'IndicadorAcreditacion', schema, 'indicadoresacreditacion');
