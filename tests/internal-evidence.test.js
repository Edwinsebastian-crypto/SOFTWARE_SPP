const test = require('node:test');
const assert = require('node:assert/strict');
const InternalEvidenceRepository = require('../src/repositories/internal-evidence.repository');

test('internal evidence repository - validation of missing id/type', async () => {
  const repo = new InternalEvidenceRepository();
  repo.query = async () => [];

  assert.deepEqual(await repo.listByPractice(''), []);
  assert.equal(await repo.getEvidenceById(''), null);
  assert.equal(await repo.getActivityById(''), null);
  assert.equal(await repo.getEvidenceFileById(''), null);
  assert.equal(await repo.getActivityFileById(''), null);
  assert.equal(await repo.belongsToPractice('UNKNOWN', '1', 'PRA-1'), false);
});

test('internal evidence repository - belongsToPractice maps types properly', async () => {
  let executedQuery = '';
  let executedParams = [];
  const repo = new InternalEvidenceRepository();
  repo.query = async (sql, params) => {
    executedQuery = sql;
    executedParams = params;
    return [{ '?column?': 1 }];
  };

  const belongsEv = await repo.belongsToPractice('EVIDENCIA', '10', 'PRA-123');
  assert.equal(belongsEv, true);
  assert.equal(executedParams[0], '10');
  assert.equal(executedParams[1], 'PRA-123');
  assert.match(executedQuery, /evidenciaactividad/);

  const belongsAct = await repo.belongsToPractice('ACTIVIDAD', '20', 'PRA-123');
  assert.equal(belongsAct, true);
  assert.equal(executedParams[0], '20');
  assert.equal(executedParams[1], 'PRA-123');
  assert.match(executedQuery, /actividad/);

  repo.query = async () => [];
  const notBelongs = await repo.belongsToPractice('EVIDENCIA', '10', 'PRA-999');
  assert.equal(notBelongs, false);
});
