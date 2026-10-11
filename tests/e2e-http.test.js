'use strict';
// End-to-end HTTP test with Supabase and Cloudinary SIMULATED, on top of the real legacy schema.
// WARNING: it DROPS the contents of the local test databases (spp_est / spp_eva). It refuses to run on non-local hosts.
const assert = require('assert');
const { configureTestDatabases, resetDatabases, installSupabaseFake, installCloudinaryFake } = require('./helpers/test-environment');

configureTestDatabases();
Object.assign(process.env, { LOGIN_MAX_ATTEMPTS: '1000', PORT: '4100', INSTITUTIONAL_DOMAIN: 'udi.edu.co' });
const { accounts, createAccount } = installSupabaseFake();

const postgres = require('../src/infrastructure/postgres');
const { start } = require('../src/server');
const { destroyed } = installCloudinaryFake();

const BASE = 'http://localhost:4100';

/** Minimal cookie-aware HTTP client. */
class Client {
  constructor() { this.cookies = {}; }

  async request(method, url, body, extraHeaders = {}) {
    const headers = { 'X-SPP': '1', ...extraHeaders };
    const isForm = body instanceof FormData;
    if (body && !isForm) headers['Content-Type'] = 'application/json';
    headers.Cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + url, {
      method, headers, redirect: 'manual',
      body: isForm ? body : body ? JSON.stringify(body) : undefined
    });
    for (const setCookie of res.headers.getSetCookie?.() || []) {
      const [pair] = setCookie.split(';');
      const [name, value] = pair.split('=');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/.test(setCookie)) delete this.cookies[name]; else this.cookies[name] = value;
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    return { status: res.status, data, headers: res.headers };
  }
}

const ok = (condition, message) => { assert.ok(condition, message); console.log('  ✔', message); };

function uploadForm() {
  const form = new FormData();
  form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'homework.txt');
  form.append('description', 'My evidence');
  form.append('hours', '3');
  return form;
}

(async () => {
  await resetDatabases(postgres);
  await postgres.pool('practice').query(`INSERT INTO programa VALUES ('PRG-1','Early Childhood Education Degree','Faculty of Education')`);
  // legacy director with a plain-text password + the account created by users:migrate
  await postgres.pool('practice').query(`INSERT INTO director VALUES ('1095302746','CC','Hellen','Alquichire','hmancilla1@udi.edu.co','dir22','Activo','109111')`);
  createAccount('hmancilla1@udi.edu.co', 'Director123');

  const { http } = await start();
  let r;

  console.log('# Authentication (legacy director from the database)');
  const dir = new Client();
  r = await dir.request('POST', '/api/auth/login', { username: 'hmancilla1', password: 'dir22', role: 'director' });
  ok(r.status === 401, 'the old plain-text password does NOT work (only Supabase validates)');
  r = await dir.request('POST', '/api/auth/login', { username: 'hmancilla1', password: 'Director123', role: 'tutor' });
  ok(r.status === 403, 'wrong role -> 403');
  r = await new Client().request('POST', '/api/auth/login', { username: 'hmancilla1', password: 'Director123', role: 'director' }, { 'X-SPP': '' });
  ok(r.status === 403, 'missing CSRF header -> 403');
  r = await dir.request('POST', '/api/auth/login', { username: 'hmancilla1', password: 'Director123', role: 'director' });
  ok(r.status === 200 && r.data.redirectTo === '/pages/director.html', 'login with the domain e-mail (hmancilla1 -> @udi.edu.co)');
  r = await dir.request('GET', '/api/auth/session');
  ok(r.data.firstName === 'Hellen' && r.data.documentNumber === '1095302746', 'session carries the data of YOUR director table');
  r = await dir.request('GET', '/pages/tutor.html');
  ok(r.status === 302 && r.headers.get('location') === '/pages/director.html', 'each role only sees its own panel');
  r = await new Client().request('GET', '/pages/director.html');
  ok(r.status === 302 && r.headers.get('location') === '/index.html', 'panels require a session');
  r = await new Client().request('GET', '/js/config.js');
  ok(r.status === 200, 'config.js (domain) is available');

  console.log('# Attack: self-registering in Supabase with somebody else\'s e-mail');
  createAccount('intruder-director@udi.edu.co', 'Intruder123', {}, true);
  await postgres.pool('practice').query(`INSERT INTO director VALUES ('999','CC','Victim','X','intruder-director@udi.edu.co','x','Activo','')`);
  r = await new Client().request('POST', '/api/auth/login', { username: 'intruder-director', password: 'Intruder123', role: 'director' });
  ok(r.status === 401, 'account WITHOUT app_metadata.spp (self-registered) -> rejected');
  createAccount('unconfirmed@udi.edu.co', 'Password12345', { spp: true }, false);
  r = await new Client().request('POST', '/api/auth/login', { username: 'unconfirmed', password: 'Password12345', role: 'director' });
  ok(r.status === 401, 'unconfirmed e-mail -> rejected');
  await postgres.pool('practice').query(`DELETE FROM director WHERE "numDocumento"='999'`);

  console.log('# Director creates data');
  r = await dir.request('GET', '/api/users/programs');
  ok(r.data.programs[0].faculty === 'Faculty of Education', 'programs come from the programa table');
  r = await dir.request('POST', '/api/practice-types', { name: 'Pedagogical Observation', semester: 3, hours: 120 });
  ok(r.status === 201 && r.data.practiceType.id === 'TIP-001', 'type TIP-001');
  const typeId = r.data.practiceType.id;
  r = await dir.request('POST', '/api/institutions', { taxId: '900123456', name: 'Saint Joseph School', manager: 'Ana', address: 'Street 1', email: 'c@x.co' });
  ok(r.status === 201, 'institution (tax id is the key)');
  const taxId = r.data.institution.taxId;
  r = await dir.request('POST', '/api/institutions', { taxId: '900123456-7', name: 'x', manager: 'x', address: 'x', email: 'c@x.co' });
  ok(r.status === 400, 'tax id longer than 10 characters -> clear 400');
  r = await dir.request('POST', '/api/institutions', { taxId, name: 'Dup', manager: 'A', address: 'C', email: 'c@x.co' });
  ok(r.status === 409, 'duplicate tax id -> 409');
  r = await dir.request('PUT', `/api/institutions/${taxId}`, { taxId: '1', name: 'Saint Joseph School 2', manager: 'Ana', address: 'Street 1', email: 'c@x.co' });
  ok(r.data.institution.taxId === taxId && r.data.institution.name.endsWith('2'), 'editing an institution does not change its tax id');

  const program = 'Early Childhood Education Degree';
  const createUser = (role, documentNumber, firstName, email, programName) => dir.request('POST', '/api/users', {
    role, documentNumber, documentType: 'CC', firstName, lastName: 'Lastname', email, password: 'Password12345', program: programName, status: 'active'
  });
  ok((await createUser('student', '1001', 'Edwin', 'edwin', program)).status === 201, 'student created (Supabase account + student table)');
  ok((await createUser('tutor', '1002', 'Ramiro', 'ramiro', program)).status === 201, 'tutor created');
  ok((await createUser('advisor', '1003', 'Claudia', 'claudia', '')).status === 201, 'advisor created (no program)');
  ok((await createUser('student', '1004', 'Other', 'other', program)).status === 201, 'second student');
  ok(accounts.get('edwin@udi.edu.co').app_metadata.spp === true, 'the Supabase account is flagged as belonging to the system');
  r = await createUser('student', '1005', 'X', 'x', 'Invented Program');
  ok(r.status === 400, 'unknown program -> 400');
  r = await createUser('student', '1001', 'X', 'x2', program);
  ok(r.status === 409, 'duplicate document -> 409');
  r = await dir.request('POST', '/api/users', { role: 'tutor', documentNumber: '5', documentType: 'CC', firstName: 'a', lastName: 'b', email: 'z', password: 'short', program });
  ok(r.status === 400, 'weak password -> 400');
  r = await dir.request('GET', '/api/users');
  ok(r.data.users.length === 5, '5 users (legacy director + 4 new ones)');

  const payload = {
    typeId, institutionId: taxId, studentDocument: '1001', tutorDocument: '1002', advisorDocument: '1003',
    startDate: '2026-02-01', endDate: '2026-06-30'
  };
  r = await dir.request('POST', '/api/practices', payload);
  ok(r.status === 201 && /^PRA-/.test(r.data.practice.id) && r.data.practice.name === 'Pedagogical Observation', `practice created ${r.data.practice?.id}`);
  const practiceId = r.data.practice.id;
  r = await dir.request('POST', '/api/practices', { ...payload, studentDocument: '1002' });
  ok(r.status === 400, 'student with the wrong role -> 400');
  r = await dir.request('POST', '/api/practices', { ...payload, startDate: '2026-07-01' });
  ok(r.status === 400, 'inverted dates -> 400 (validated in the application)');
  r = await dir.request('POST', '/api/practices', { ...payload, typeId: 'DOESNOTEXIST' });
  ok(r.status === 400, 'unknown practice type -> 400');

  console.log('# Student');
  const student = new Client();
  r = await student.request('POST', '/api/auth/login', { username: 'edwin', password: 'Password12345', role: 'student' });
  ok(r.status === 200, 'student login');
  r = await student.request('GET', '/api/practices');
  ok(r.data.practices.length === 1 && r.data.practices[0].tutor.startsWith('Ramiro') && r.data.practices[0].logbook.finalGrade === null, 'sees only their practice; ungraded = null');
  r = await student.request('GET', '/api/users');
  ok(r.status === 403, 'cannot list users -> 403');
  r = await student.request('POST', '/api/practices', {});
  ok(r.status === 403, 'cannot create practices -> 403');
  r = await student.request('GET', `/api/practices/${practiceId}/activities`);
  ok(r.data.activities.length === 6 && r.data.activities[0].number === 1, '6 numbered activities');
  const activityId = r.data.activities[0].id;
  r = await student.request('POST', `/api/activities/${activityId}/evidences`, uploadForm());
  ok(r.status === 201 && r.data.evidence.hours === 3 && r.data.evidence.url.includes('cloudinary'), 'uploads evidence (Cloudinary + evidenciaactividad + evidenciaarchivo)');
  const evidenceId = r.data.evidence.id;
  const noHours = uploadForm(); noHours.delete('hours');
  r = await student.request('POST', `/api/activities/${activityId}/evidences`, noHours);
  ok(r.status === 400, 'hours are mandatory -> 400');
  const exe = new FormData();
  exe.append('file', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'v.exe');
  exe.append('hours', '1');
  r = await student.request('POST', `/api/activities/${activityId}/evidences`, exe);
  ok(r.status === 400, 'file type not allowed -> 400');
  r = await student.request('PUT', `/api/evidences/${evidenceId}`, { description: 'edited', hours: 5 });
  ok(r.data.evidence.description === 'edited' && r.data.evidence.hours === 5, 'edits description and hours');

  console.log('# Isolation');
  const otherStudent = new Client();
  await otherStudent.request('POST', '/api/auth/login', { username: 'other', password: 'Password12345', role: 'student' });
  r = await otherStudent.request('GET', '/api/practices');
  ok(r.data.practices.length === 0, 'another student does not see the practice');
  r = await otherStudent.request('GET', `/api/activities/${activityId}/evidences`);
  ok(r.status === 404, 'cannot access evidence of others');
  r = await otherStudent.request('DELETE', `/api/evidences/${evidenceId}`);
  ok(r.status === 404, 'cannot delete evidence of others');

  console.log('# Tutor and advisor (feedback per evidence)');
  const tutor = new Client();
  await tutor.request('POST', '/api/auth/login', { username: 'ramiro', password: 'Password12345', role: 'tutor' });
  r = await tutor.request('POST', `/api/activities/${activityId}/feedback`, { text: 'no evidence' });
  ok(r.status === 400, 'missing evidenceId -> 400');
  r = await tutor.request('POST', `/api/activities/${activityId}/feedback`, { text: 'Good job', evidenceId });
  ok(r.status === 201 && r.data.feedback.role === 'tutor', 'tutor gives feedback (retroalimentacion_t)');
  r = await tutor.request('POST', `/api/activities/${activityId}/feedback`, { text: 'x', evidenceId: 'EV-OTHER' });
  ok(r.status === 400, 'evidence of another activity -> 400');
  r = await tutor.request('PATCH', `/api/practices/${practiceId}/logbook`, { finalGrade: 4.5, generalObservation: 'Very good' });
  ok(r.data.practice.logbook.finalGrade === 4.5 && r.data.practice.logbook.generalObservation === 'Very good', 'tutor records grade and observation');
  r = await tutor.request('PATCH', `/api/practices/${practiceId}/logbook`, { finalGrade: 9 });
  ok(r.status === 400, 'grade out of range -> 400');
  r = await tutor.request('POST', `/api/activities/${activityId}/evidences`, uploadForm());
  ok(r.status === 403, 'tutor cannot upload evidence');
  const advisor = new Client();
  await advisor.request('POST', '/api/auth/login', { username: 'claudia', password: 'Password12345', role: 'advisor' });
  r = await advisor.request('POST', `/api/activities/${activityId}/feedback`, { text: 'Suggest expanding', evidenceId });
  ok(r.status === 201 && r.data.feedback.role === 'advisor', 'advisor gives feedback (retroalimentacion_a, column with a space)');
  r = await advisor.request('POST', '/api/questions', {});
  ok(r.status === 403, 'advisor does not manage the question bank');
  r = await student.request('GET', `/api/activities/${activityId}/feedback`);
  ok(r.data.feedback.length === 2, 'student sees both');

  console.log('# Questions');
  r = await tutor.request('POST', '/api/questions', { statement: 'Challenges of inclusion?', topic: 'pedagogy', practiceType: 'observacion', questionType: 'open', value: 2 });
  ok(r.status === 201 && r.data.question.topic === 'pedagogy', 'tutor creates a question');
  const questionId = r.data.question.id;
  r = await tutor.request('POST', `/api/practices/${practiceId}/questions`, { questionId });
  ok(r.status === 201, 'assigns the question to the practice');
  r = await student.request('GET', `/api/practices/${practiceId}/questions`);
  ok(r.data.questions.length === 1 && r.data.questions[0].status === 'pending', 'student sees a pending question');
  const answerId = r.data.questions[0].id;
  r = await student.request('PUT', `/api/answers/${answerId}`, { text: 'Final answer', submit: true });
  ok(r.data.status === 'answered', 'submits the answer');
  r = await tutor.request('POST', `/api/answers/${answerId}/feedback`, { text: 'Excellent' });
  ok(r.status === 201, 'tutor gives feedback on the answer');

  console.log('# Reports, users and clean-up');
  r = await dir.request('GET', '/api/reports/summary');
  ok(r.data.summary.practices === 1 && r.data.summary.students === 2 && r.data.summary.averageGrade === 4.5, 'general summary with real data');
  r = await dir.request('PATCH', '/api/users/1004/status', { status: 'inactive' });
  ok(r.data.user.status === 'inactive', 'deactivates a user');
  r = await new Client().request('POST', '/api/auth/login', { username: 'other', password: 'Password12345', role: 'student' });
  ok(r.status === 403, 'inactive user cannot log in');
  r = await dir.request('PUT', '/api/users/1002', { firstName: 'Ramiro', lastName: 'New', documentType: 'CC', program, status: 'active', password: 'NewPassword12345' });
  ok(r.status === 200, 'edits a user and their Supabase password');
  r = await new Client().request('POST', '/api/auth/login', { username: 'ramiro', password: 'NewPassword12345', role: 'tutor' });
  ok(r.status === 200, 'the new password works');
  r = await dir.request('DELETE', '/api/users/1001');
  ok(r.status === 409, 'a user with practices is not deleted');
  r = await dir.request('DELETE', '/api/users/1095302746');
  ok(r.status === 409, 'the director cannot delete themselves');
  r = await dir.request('DELETE', '/api/users/1004');
  ok(r.status === 200 && !accounts.has('other@udi.edu.co'), 'deletes a user without practices and their Supabase account');
  r = await student.request('DELETE', `/api/evidences/${evidenceId}`);
  ok(r.status === 200 && destroyed.some((id) => id.endsWith('.txt')), 'deletes the evidence and its Cloudinary file (public_id derived from the URL)');
  r = await dir.request('DELETE', `/api/practices/${practiceId}`);
  ok(r.status === 200, 'deletes the practice with everything that hangs from it');
  await student.request('POST', '/api/auth/logout', {});
  ok(!student.cookies.spp_at, 'logout clears the cookies');
  r = await student.request('GET', '/api/auth/session');
  ok(r.status === 401, 'no session -> 401');
  r = await dir.request('GET', '/api/does-not-exist');
  ok(r.status === 404 && r.data.error === 'Route not found', 'unknown API route -> JSON 404');

  console.log('\nALL OK');
  http.close();
  await postgres.close();
  process.exit(0);
})().catch((err) => {
  console.error('\nFAILED:', err.message, '\n', (err.stack || '').split('\n').slice(1, 5).join('\n'));
  process.exit(1);
});
