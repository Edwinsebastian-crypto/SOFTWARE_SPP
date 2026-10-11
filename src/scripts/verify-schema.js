'use strict';
// Usage: npm run schema:verify
// Compares the tables/columns the code expects with the ones that exist in your databases and reports what is missing.
// (Table and column names are the persisted legacy names.)
const postgres = require('../infrastructure/postgres');

const PRACTICE = {
  actividad: ['idActividad', 'nombre', 'descripcion', 'fechaAsignacion', 'fechaLimite', 'notaObtenida', 'idPractica'],
  archivosactividad: ['idArchivoAct', 'rutaArchivo', 'nombreArchivo', 'tipoMine', 'idActividad'],
  asesor_pedagogico: ['numDocumento', 'tipoDocumento', 'nombre', 'apellido', ['correoinst', 'correinst'], 'contrasena', 'googleId', 'estado'],
  director: ['numDocumento', 'tipoDocumento', 'nombre', 'apellido', ['correoinst', 'correinst'], 'contrasena', 'estado', 'googleId'],
  estudiante: ['numDocumento', 'tipoDocumento', 'nombre', 'apellido', ['correoinst', 'correinst'], 'contrasena', 'googleId', 'estado', 'idprograma'],
  evidenciaactividad: ['idEvidencia', 'descripcion', 'horasRealizadas', 'idActividad'],
  evidenciaarchivo: ['idArchivo', 'rutaArchivo', 'nombreArchivo', 'tipoMine', 'idEvidenciaAct'],
  institucion: ['nitEntidad', 'nombre', 'direccion', 'encargado', 'correoInstitucion'],
  practica: ['idPractica', 'fechaInicio', 'fechaFinal', 'notaFinal', 'observacionFinal', 'estado', 'idTipoPractica', 'numDocEstudiante', 'numDocTutor', 'numDocAsesor', 'nitInstitucion'],
  programa: ['idprograma', 'nombre', 'facultad'],
  retroalimentacion_a: ['idRetroalimentacionA', 'comentario', 'fecha', 'idEvidencia', 'numDocAsesor'],
  retroalimentacion_t: ['idRetroalimentacionT', 'comentario', 'fecha', 'idEvidencia', 'numDocTutor'],
  tipopractica: ['idTipoPractica', 'nombre', 'numSemestre', 'horasRequeridas'],
  tutor_academico: ['numDocumento', 'tipoDocumento', 'nombre', 'apellido', ['correoinst', 'correinst'], 'contrasena', 'googleId', 'estado', 'idprograma']
};

const EVALUATION = {
  pregunta: ['idpregunta', 'enunciado', 'tema', 'tipopractica', 'tipopregunta', 'valor', 'docautor', 'fecha'],
  evaluacion: ['idevaluacion', 'idpractica', 'fecha'],
  respuesta: ['idrespuesta', 'idevaluacion', 'idpregunta', 'texto', 'estado', 'fecha'],
  retropregunta: ['idretro', 'idrespuesta', 'docautor', 'texto', 'fecha']
};

/** Prints every missing table / column of `database` and returns how many problems were found. */
async function check(database, expected) {
  const { rows } = await postgres.pool(database).query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`
  );
  const actual = new Map();
  for (const row of rows) {
    if (!actual.has(row.table_name)) actual.set(row.table_name, new Set());
    actual.get(row.table_name).add(row.column_name.trim().toLowerCase());
  }
  let problems = 0;
  for (const [table, columns] of Object.entries(expected)) {
    if (!actual.has(table)) { console.log(`  ✗ Table "${table}" is missing`); problems++; continue; }
    for (const column of columns) {
      const options = (Array.isArray(column) ? column : [column]).map((c) => c.toLowerCase());
      if (!options.some((option) => actual.get(table).has(option))) {
        console.log(`  ✗ ${table}: column ${options.join(' or ')} is missing`);
        problems++;
      }
    }
  }
  return problems;
}

(async () => {
  console.log('PRACTICE database (DATABASE_URL_PRACTICE):');
  const practiceProblems = await check('practice', PRACTICE);
  if (!practiceProblems) console.log('  ✓ Everything matches the expected schema');

  console.log('EVALUATION database (DATABASE_URL_EVALUATION):');
  const evaluationProblems = await check('evaluation', EVALUATION);
  if (!evaluationProblems) console.log('  ✓ Everything matches');
  else console.log('  → If tables are missing, run: npm run schema:apply. If a table exists with different columns, share its structure.');

  process.exitCode = practiceProblems || evaluationProblems ? 1 : 0;
})().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => postgres.close());
