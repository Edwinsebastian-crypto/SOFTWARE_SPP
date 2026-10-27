'use strict';
// Unit tests for pure logic: no database, no network.
const assert = require('assert');

const env = require('../src/config/env');
// Legacy (Spanish) variable names must keep working
delete process.env.DATABASE_URL_PRACTICE;
process.env.DATABASE_URL_ESTUDIANTE = 'postgres://legacy';
process.env.INSTITUTIONAL_DOMAIN = 'example.edu';

const legacy = require('../src/repositories/legacy-values');
const v = require('../src/utils/validators');
const HttpError = require('../src/utils/http-error');
const fileStorage = require('../src/infrastructure/file-storage');
const { toInstitutionalEmail } = require('../src/utils/format');
const { parseCreateUser, parseUpdateUser, parseUserFilters } = require('../src/validators/user.validator');
const { parsePracticeInput, parseLogbookInput } = require('../src/validators/practice.validator');
const { parseLogin, parseRegister } = require('../src/validators/auth.validator');
const { parseGoogleLinks } = require('../src/utils/google-links');
const { parseFeedback, parseFeedbackUpdate } = require('../src/validators/evidence.validator');
const { toPracticeDto } = require('../src/presenters');
const { generateId } = require('../src/utils/id-generator');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✔', name); } catch (err) { console.error('  ✘', name, '\n   ', err.message); process.exitCode = 1; }
}
const throwsBadRequest = (fn) => assert.throws(fn, (e) => e instanceof HttpError && e.status === 400);

console.log('# env');
test('canonical names win, legacy names are still honoured', () => {
  assert.equal(env.get('DATABASE_URL_PRACTICE'), 'postgres://legacy');
  process.env.DATABASE_URL_PRACTICE = 'postgres://canonical';
  assert.equal(env.get('DATABASE_URL_PRACTICE'), 'postgres://canonical');
  assert.equal(env.get('NOPE', 'fallback'), 'fallback');
  assert.throws(() => env.require('NOPE'), /Missing required environment variable/);
});

console.log('# legacy value mappings');
test('stored <-> English values round-trip', () => {
  assert.equal(legacy.userStatus.fromStored(' Activo '), 'active');
  assert.equal(legacy.userStatus.toStored('inactive'), 'inactivo');
  assert.equal(legacy.practiceStatus.fromStored('Finalizada'), 'completed');
  assert.equal(legacy.auditEntity.fromStored('Retroalimentacion'), 'feedback');
  assert.equal(legacy.auditAction.toStored('delete'), 'Eliminar');
  assert.equal(legacy.capitalize(legacy.userStatus.toStored('pending')), 'Pendiente');
  assert.equal(legacy.userStatus.fromStored('something-else'), 'something-else');
});

console.log('# validators');
test('text / integer / isoDate / textId', () => {
  assert.equal(v.text('  hi ', { field: 'x' }), 'hi');
  throwsBadRequest(() => v.text('', { field: 'x' }));
  assert.equal(v.text('', { field: 'x', required: false }), '');
  throwsBadRequest(() => v.text('abcdef', { field: 'x', max: 3 }));
  assert.equal(v.integer('5', { field: 'n', min: 1, max: 10 }), 5);
  throwsBadRequest(() => v.integer('11', { field: 'n', min: 1, max: 10 }));
  throwsBadRequest(() => v.integer('1.5', { field: 'n' }));
  assert.equal(v.isoDate('2026-02-01', 'd'), '2026-02-01');
  throwsBadRequest(() => v.isoDate('01/02/2026', 'd'));
  throwsBadRequest(() => v.isoDate('2026-13-45', 'd'));
  assert.equal(v.textId('PRA-123_a.b', 'id'), 'PRA-123_a.b');
  throwsBadRequest(() => v.textId("x'; DROP TABLE", 'id'));
});

test('e-mail normalisation appends the institutional domain', () => {
  assert.equal(toInstitutionalEmail('JDoe'), 'jdoe@example.edu');
  assert.equal(toInstitutionalEmail('a@b.co'), 'a@b.co');
});

test('login no longer needs a role', () => {
  assert.deepStrictEqual(parseLogin({ username: 'jdoe', password: 'x' }), { username: 'jdoe', password: 'x' });
});
test('self-registration: pending status, institutional e-mail, never director', () => {
  const base = { role: 'student', documentNumber: '123', firstName: 'A', lastName: 'B', program: 'P', email: 'ab', password: 'Password123' };
  const parsed = parseRegister(base);
  assert.strictEqual(parsed.status, 'pending');
  assert.strictEqual(parsed.email, 'ab@example.edu');
  throwsBadRequest(() => parseRegister({ ...base, role: 'director' }));
  throwsBadRequest(() => parseRegister({ ...base, email: 'ab@gmail.com' }));
  throwsBadRequest(() => parseRegister({ ...base, password: 'weak' }));
});
test('Google links: only https Google Workspace hosts', () => {
  const [doc] = parseGoogleLinks([{ url: 'https://docs.google.com/spreadsheets/d/abc/edit' }]);
  assert.strictEqual(doc.name, 'Google Sheets link');
  assert.deepStrictEqual(parseGoogleLinks(''), []);
  assert.strictEqual(parseGoogleLinks(JSON.stringify([{ url: 'https://drive.google.com/file/d/1/view', name: 'Report' }]))[0].name, 'Report');
  for (const bad of ['http://docs.google.com/x', 'https://evil.com/docs.google.com', 'https://docs.google.com.evil.com/x', 'javascript:alert(1)', 'https://u:p@docs.google.com/x']) {
    throwsBadRequest(() => parseGoogleLinks([{ url: bad }]));
  }
});

test('user validation', () => {
  const body = { role: 'student', documentNumber: '10', firstName: 'A', lastName: 'B', email: 'ab', password: 'Passw0rdX', program: 'P' };
  const user = parseCreateUser(body);
  assert.equal(user.email, 'ab@example.edu');
  assert.equal(user.status, 'active');
  assert.equal(user.documentType, 'CC');
  throwsBadRequest(() => parseCreateUser({ ...body, role: 'janitor' }));
  throwsBadRequest(() => parseCreateUser({ ...body, password: 'weak' }));
  throwsBadRequest(() => parseCreateUser({ ...body, documentNumber: 'a b' }));
  assert.equal(parseUpdateUser({ firstName: 'A', lastName: 'B' }).password, null);
  throwsBadRequest(() => parseUpdateUser({ firstName: 'A', lastName: 'B', password: 'weak' }));
  throwsBadRequest(() => parseUserFilters({ role: 'janitor' }));
});

test('practice validation', () => {
  const base = { typeId: 'T', institutionId: 'I', studentDocument: '1', tutorDocument: '2', advisorDocument: '3', startDate: '2026-02-01', endDate: '2026-06-01' };
  assert.equal(parsePracticeInput(base).status, 'active');
  assert.equal(parsePracticeInput({ ...base, status: 'cancelled' }).status, 'cancelled');
  throwsBadRequest(() => parsePracticeInput({ ...base, endDate: '2026-01-01' }));
  assert.deepEqual(parseLogbookInput({ finalGrade: '4.5', generalObservation: ' ok ' }), { finalGrade: 4.5, generalObservation: 'ok' });
  assert.deepEqual(parseLogbookInput({}), { finalGrade: null, generalObservation: null });
  throwsBadRequest(() => parseLogbookInput({ finalGrade: 6 }));
});

test('feedback validation: parses text, evidenceId and optional date', () => {
  assert.deepEqual(parseFeedback({ evidenceId: 'EV-1', text: 'Good job', date: '2026-10-11 12:00:00' }), {
    evidenceId: 'EV-1', text: 'Good job', date: '2026-10-11 12:00:00'
  });
  assert.deepEqual(parseFeedback({ evidenceId: 'EV-1', text: 'Good job' }), {
    evidenceId: 'EV-1', text: 'Good job', date: null
  });
  assert.deepEqual(parseFeedbackUpdate({ text: 'Updated', date: '2026-10-11 12:05:00' }), {
    text: 'Updated', date: '2026-10-11 12:05:00'
  });
});

console.log('# presenters / storage / ids');
test('practice presenter treats grade 0 and empty observation as "not graded"', () => {
  const dto = toPracticeDto({
    id: 'PRA-1', status: 'active', typeName: 'Observation', finalGrade: '0.00', finalObservation: '', startDate: '2026-01-01', endDate: '2026-02-01'
  });
  assert.equal(dto.logbook.finalGrade, null);
  assert.equal(dto.logbook.generalObservation, null);
  assert.equal(dto.logbook.status, 'active');
  assert.equal(toPracticeDto({ id: 'P', status: 'completed', finalGrade: '4.50', finalObservation: 'ok' }).logbook.finalGrade, 4.5);
});

test('Cloudinary public id is derived from the stored URL', () => {
  assert.deepEqual(
    fileStorage.parseUrl('https://res.cloudinary.com/demo/image/upload/v123/practice-evidence/PRA-1/photo.jpg'),
    { resourceType: 'image', publicId: 'practice-evidence/PRA-1/photo' }
  );
  assert.deepEqual(
    fileStorage.parseUrl('https://res.cloudinary.com/demo/raw/upload/v1/folder/file.txt'),
    { resourceType: 'raw', publicId: 'folder/file.txt' }
  );
  assert.equal(fileStorage.parseUrl('https://example.com/file.pdf'), null);
});

test('generated ids fit varchar(30)', () => {
  const id = generateId('PRA');
  assert.match(id, /^PRA-[0-9A-Z]+$/);
  assert.ok(id.length <= 30);
  assert.notEqual(generateId('PRA'), id);
});

console.log(`\nUNIT: ${passed} passed${process.exitCode ? ' (with failures)' : ' — ALL OK'}`);
