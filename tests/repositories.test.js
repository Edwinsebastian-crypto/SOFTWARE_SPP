'use strict';
// Integration test of the repositories against a copy of the REAL legacy schema.
// WARNING: it DROPS the contents of the local test databases (spp_est / spp_eva). It refuses to run on non-local hosts.
const assert = require('assert');
const { configureTestDatabases, resetDatabases } = require('./helpers/test-environment');

configureTestDatabases();

const postgres = require('../src/infrastructure/postgres');
const schema = require('../src/infrastructure/schema-resolver');
const UserRepository = require('../src/repositories/user.repository');
const PracticeRepository = require('../src/repositories/practice.repository');
const ActivityRepository = require('../src/repositories/activity.repository');
const EvidenceRepository = require('../src/repositories/evidence.repository');
const FeedbackRepository = require('../src/repositories/feedback.repository');
const InstitutionRepository = require('../src/repositories/institution.repository');
const PracticeTypeRepository = require('../src/repositories/practice-type.repository');
const QuestionRepository = require('../src/repositories/question.repository');
const AnswerRepository = require('../src/repositories/answer.repository');
const IndicatorRepository = require('../src/repositories/indicator.repository');

(async () => {
  await resetDatabases(postgres);
  await schema.load();
  assert.equal(schema.column('practica', 'estado'), '"estado "');
  assert.equal(schema.column('asesor_pedagogico', 'correoinst', 'correinst'), '"correInst"');
  assert.equal(schema.column('tutor_academico', 'idprograma'), '"Idprograma"');
  console.log('Real schema + column resolver OK');

  const users = new UserRepository();
  const practices = new PracticeRepository();
  const activities = new ActivityRepository();
  const evidences = new EvidenceRepository();
  const feedback = new FeedbackRepository();
  const institutions = new InstitutionRepository();
  const practiceTypes = new PracticeTypeRepository();
  const questions = new QuestionRepository();
  const answers = new AnswerRepository();
  const indicators = new IndicatorRepository();
  const practiceDb = postgres.pool('practice');

  await practiceDb.query(`INSERT INTO programa VALUES ('PRG-1','Early Childhood Education Degree','Faculty of Education')`);
  // a "legacy" director with a plain-text password, like the one in the real database
  await practiceDb.query(`INSERT INTO director VALUES ('1095302746','CC','Hellen','Alquichire','hmancilla1@udi.edu.co','dir22','Activo','109111')`);
  const director = await users.findByEmail('HMANCILLA1@udi.edu.co');
  assert.equal(director.role, 'director');
  assert.equal(director.status, 'active');
  const program = await users.findProgramByName('early childhood education degree');
  assert.equal(program.id, 'PRG-1');

  const base = { documentType: 'CC', status: 'active', programId: 'PRG-1' };
  await users.create('student', { ...base, documentNumber: '111', firstName: 'Edwin', lastName: 'Tester', email: 'e@udi.edu.co' });
  await users.create('tutor', { ...base, documentNumber: '222', firstName: 'Ramiro', lastName: 'Urtado', email: 't@udi.edu.co' });
  await users.create('advisor', { ...base, documentNumber: '333', firstName: 'Claudia', lastName: 'Rueda', email: 'a@udi.edu.co' });
  assert.equal((await users.list()).length, 4);
  const student = await users.findByDocument('111');
  assert.equal(student.program, 'Early Childhood Education Degree');
  assert.equal(student.status, 'active');
  const raw = (await practiceDb.query(`SELECT contrasena, "googleId", estado FROM estudiante WHERE "numDocumento"='111'`)).rows[0];
  assert.equal(raw.contrasena, 'GESTIONADA_POR_SUPABASE');
  assert.equal(raw.estado, 'Activo');
  await users.update('tutor', '222', { ...base, firstName: 'Ramiro2', lastName: 'Urtado', status: 'pending' });
  assert.equal((await users.findByDocument('222')).status, 'pending');
  await users.updateStatus('tutor', '222', 'active');
  assert.equal((await users.list({ search: 'claudia' })).length, 1);
  assert.equal((await users.list({ role: 'advisor' })).length, 1);
  console.log('UserRepository OK (4 roles, e-mail columns with different spellings, status Activo/active)');

  const institution = await institutions.create({ taxId: '900123456', name: 'School X', manager: 'Ana', address: 'Street 1', email: 'c@x.co' });
  await assert.rejects(
    () => institutions.create({ taxId: '900123456-7', name: 'x', manager: 'x', address: 'x', email: 'x' }),
    /too long|value too long/i
  );
  const type1 = await practiceTypes.create({ name: 'Observation', semester: 3, hours: 120 });
  const type2 = await practiceTypes.create({ name: 'Intermediate', semester: 6, hours: 240 });
  assert.equal(type1.id, 'TIP-001');
  assert.equal(type2.id, 'TIP-002');

  const practiceId = await practices.create({
    typeId: 'TIP-001', institutionId: institution.taxId, studentDocument: '111', tutorDocument: '222', advisorDocument: '333',
    startDate: '2026-02-01', endDate: '2026-06-01'
  }, 6);
  const detail = await practices.findById(practiceId);
  assert.equal(detail.studentName, 'Edwin Tester');
  assert.equal(detail.startDate, '2026-02-01');
  assert.equal(detail.requiredHours, 120);
  assert.equal(detail.status, 'active');
  assert.equal(Number(detail.finalGrade), 0);
  assert.equal(detail.tutorName, 'Ramiro2 Urtado');
  assert.equal((await practices.list({ tutorDocument: '222' })).length, 1);
  assert.equal((await practices.list({ tutorDocument: '999' })).length, 0);
  const activityList = await activities.listByPractice(practiceId);
  assert.equal(activityList.length, 6);
  assert.deepEqual(activityList.map((a) => a.number), [1, 2, 3, 4, 5, 6]);
  console.log('Practice + 6 activities OK ->', practiceId);

  await evidences.create({
    id: 'EV-1', description: 'd', hours: 3, activityId: activityList[0].id,
    file: { id: 'AR-1', url: 'https://res.cloudinary.com/x/raw/upload/v1/evidence/f.pdf', name: 'f.pdf', mimeType: 'application/pdf' }
  });
  const evidence = await evidences.findById('EV-1');
  assert.equal(evidence.practiceId, practiceId);
  assert.equal(evidence.hours, 3);
  assert.equal(evidence.fileName, 'f.pdf');
  assert.equal((await evidences.listByActivity(activityList[0].id)).length, 1);
  await evidences.update('EV-1', 'updated', 5);
  assert.equal((await evidences.findById('EV-1')).hours, 5);
  await feedback.create({ evidenceId: 'EV-1', authorDocument: '222', authorRole: 'tutor', text: 'Good' });
  await feedback.create({ evidenceId: 'EV-1', authorDocument: '333', authorRole: 'advisor', text: 'Expand' });
  const feedbackList = await feedback.listByActivity(activityList[0].id);
  assert.equal(feedbackList.length, 2);
  assert.deepEqual(feedbackList.map((f) => f.role).sort(), ['advisor', 'tutor']);
  await practices.updateLogbook(practiceId, { finalGrade: 4.5, generalObservation: 'ok' });
  assert.equal(Number((await practices.findById(practiceId)).finalGrade), 4.5);
  await practices.updateLogbook(practiceId, { finalGrade: null, generalObservation: 'text only' });
  assert.equal(Number((await practices.findById(practiceId)).finalGrade), 4.5); // COALESCE keeps the grade
  console.log('Evidence/File/Tutor+advisor feedback/Grade OK');

  const question = await questions.create({
    statement: 'Inclusion?', topic: 'pedagogy', practiceType: 'observacion', questionType: 'open', value: 2, authorDocument: '222'
  });
  assert.equal(question.topic, 'pedagogy');
  assert.equal(question.questionType, 'open');
  const assigned = await answers.assignQuestion(practiceId, question.id);
  await answers.assignQuestion(practiceId, question.id); // idempotent
  await answers.save(assigned.id, 'answer', 'answered');
  await answers.createFeedback(assigned.id, '222', 'Excellent');
  const answerList = await answers.listByPractice(practiceId);
  assert.equal(answerList.length, 1);
  assert.equal(answerList[0].observation, 'Excellent');
  assert.equal(answerList[0].status, 'answered');
  assert.equal((await answers.findById(assigned.id)).practiceId, practiceId);
  console.log('Questions/Answers (text practice id) OK');

  const computed = await indicators.calculate(2026);
  const indicator = computed.find((i) => i.programId === 'PRG-1');
  assert.equal(indicator.activeStudentsTotal, 1);
  assert.equal(indicator.practicesByType[0].averageGrade, 4.5);
  assert.equal(indicator.teacherSupport.tutorFeedbackCount, 1);
  assert.equal(indicator.teacherSupport.advisorFeedbackCount, 1);
  assert.equal(indicator.partnerInstitutions[0].institutionName, 'School X');
  const summary = await indicators.summary();
  assert.equal(summary.practices, 1);
  assert.equal(summary.activePractices, 1);
  assert.equal(summary.students, 1);
  console.log('Indicators computed OK:', JSON.stringify(indicator.practicesByType), summary.averageGrade);

  await assert.rejects(() => users.delete('student', '111'), /foreign key|violates/i);
  assert.equal(await practices.delete(practiceId), 1);
  for (const table of ['practica', 'actividad', 'evidenciaactividad', 'evidenciaarchivo', 'retroalimentacion_t', 'retroalimentacion_a']) {
    const { rows } = await practiceDb.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
    assert.equal(rows[0].c, 0, `${table} must be empty`);
  }
  console.log('Manual cascade delete of a practice OK (no orphans); FK protecting users with practices OK');
  assert.equal(await users.delete('student', '111'), 1);

  await postgres.close();
  console.log('\nREPOSITORIES: ALL OK');
})().catch((err) => {
  console.error('FAILED:', err.message, '\n', (err.stack || '').split('\n').slice(1, 4).join('\n'));
  process.exit(1);
});
