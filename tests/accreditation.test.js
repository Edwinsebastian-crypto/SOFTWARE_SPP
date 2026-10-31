'use strict';
// Pure aggregation of the accreditation indicators: no database, no network.
const assert = require('assert');
const { buildIndicators, lastMonths, fillMonths, daysBetween, INDICATOR_VERSION } = require('../src/utils/accreditation');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✔', name); } catch (err) { console.error('  ✘', name, '\n   ', err.message); process.exitCode = 1; }
}

const programs = [
  { id: 'P-01', name: 'Early Childhood', faculty: 'Education', totalStudents: 4, activeStudents: 3, activeTutors: 1 },
  { id: 'P-02', name: 'Literature', faculty: 'Humanities', totalStudents: 2, activeStudents: 2, activeTutors: 1 }
];
const row = (over) => ({
  id: 'PRA-1', programId: 'P-01', startDate: '2026-02-01', endDate: '2026-03-03', finalGrade: '4.50', finalObservation: ' ok ',
  status: 'completed', typeId: 'TIP-001', typeName: 'Observation', requiredHours: 120, taxId: '900', institutionName: 'School X',
  institutionAddress: 'Street 1', institutionManager: 'Ana', institutionEmail: 'x@x.co',
  studentDocument: '111', studentDocumentType: 'CC', studentName: 'Edwin T', studentEmail: 'e@u.co', studentStatus: 'active',
  tutorDocument: '222', tutorName: 'Ramiro U', tutorEmail: 't@u.co', advisorDocument: '333', advisorName: 'Claudia R', advisorEmail: 'a@u.co',
  activities: 6, evidences: 4, hours: 100, tutorFeedback: 2, advisorFeedback: 0, ...over
});
const practices = [
  row({}),
  row({ id: 'PRA-2', studentDocument: '112', studentName: 'Maria', finalGrade: '2.00', status: 'active', tutorFeedback: 0, advisorFeedback: 1, hours: 20 }),
  row({ id: 'PRA-3', studentDocument: '113', studentName: 'Luis', finalGrade: '0.00', finalObservation: '', status: 'cancelled', hours: 5, typeId: 'TIP-002', typeName: 'Intervention', taxId: '800', institutionName: 'School Y' }),
  row({ id: 'PRA-4', programId: 'P-02', studentDocument: '200', studentName: 'Sofia', finalGrade: '3.00', tutorDocument: '555', tutorName: 'Marta', tutorEmail: null })
];

console.log('# accreditation indicators');
const [early, literature] = buildIndicators({ year: 2026, programs, practices, generatedAt: '2026-10-28T00:00:00.000Z' });

test('one indicator per program, with version and generation date', () => {
  assert.equal(early.programId, 'P-01');
  assert.equal(literature.programId, 'P-02');
  assert.equal(early.version, INDICATOR_VERSION);
  assert.equal(early.generatedAt, '2026-10-28T00:00:00.000Z');
  assert.equal(early.activeStudentsTotal, 3);
  assert.equal(early.totalStudents, 4);
});

test('summary: statuses, grades, approval and hours', () => {
  const s = early.summary;
  assert.deepEqual([s.practices, s.active, s.completed, s.cancelled], [3, 1, 1, 1]);
  assert.deepEqual([s.graded, s.ungraded, s.approved, s.failed], [2, 1, 1, 1]);
  assert.equal(s.averageGrade, 3.25);
  assert.equal(s.minGrade, 2);
  assert.equal(s.maxGrade, 4.5);
  assert.equal(s.approvalRate, 50);
  assert.equal(s.requiredHours, 240);       // the cancelled practice does not count
  assert.equal(s.loggedHours, 120);
  assert.equal(s.hoursCompletion, 50);
  assert.equal(s.activities, 18);
});

test('grade distribution always lists the three ranges', () => {
  assert.deepEqual(early.gradeDistribution, [
    { range: '4.0-5.0', studentCount: 1 }, { range: '3.0-3.9', studentCount: 0 }, { range: '0.1-2.9', studentCount: 1 }
  ]);
  assert.equal(literature.gradeDistribution[1].studentCount, 1); // exactly 3.00
});

test('practices by type and partner institutions carry the complete data', () => {
  const [first, second] = early.practicesByType;
  assert.deepEqual([first.type, first.count, first.students, first.averageGrade, first.approvalRate], ['Observation', 2, 2, 3.25, 50]);
  assert.equal(second.type, 'Intervention');
  const school = early.partnerInstitutions[0];
  assert.deepEqual([school.institutionName, school.taxId, school.address, school.manager, school.email], ['School X', '900', 'Street 1', 'Ana', 'x@x.co']);
  assert.deepEqual([school.practiceCount, school.activeCount, school.completedCount], [2, 1, 1]);
});

test('teacher support, tutors and advisors', () => {
  const t = early.teacherSupport;
  assert.deepEqual([t.tutorFeedbackCount, t.advisorFeedbackCount, t.practicesWithoutTutorFeedback, t.practicesWithoutAdvisorFeedback], [4, 1, 1, 2]);
  assert.equal(t.feedbackPerPractice, 1.7);
  assert.equal(early.tutors[0].name, 'Ramiro U');
  assert.equal(early.tutors[0].email, 't@u.co');
  assert.equal(early.tutors[0].feedbackCount, 4);
  assert.equal(early.advisors[0].feedbackCount, 1);
});

test('the practice roster keeps one complete entry per practice', () => {
  assert.equal(early.practices.length, 3);
  const [p] = early.practices;
  assert.equal(p.practiceId, 'PRA-1');
  assert.equal(p.studentName, 'Edwin T');
  assert.equal(p.finalGrade, 4.5);
  assert.equal(p.finalObservation, 'ok');
  assert.equal(p.durationDays, 30);
  assert.equal(early.practices[2].finalGrade, null);    // 0 means "not graded"
  assert.equal(early.practices[2].finalObservation, null);
});

test('dropout and duration', () => {
  assert.equal(early.dropoutRate, 33.3);
  assert.equal(early.averagePracticeDurationDays, 30);
});

test('a program without practices still gets an indicator with zeros', () => {
  const [empty] = buildIndicators({ year: 2023, programs: [programs[0]], practices: [] });
  assert.equal(empty.summary.practices, 0);
  assert.equal(empty.averagePracticeDurationDays, 0);
  assert.equal(empty.dropoutRate, 0);
  assert.deepEqual(empty.practicesByType, []);
  assert.equal(empty.gradeDistribution.length, 3);
});

console.log('# month helpers');
test('lastMonths crosses the year boundary and fillMonths pads with zeros', () => {
  const months = lastMonths(new Date(2026, 1, 15), 4);
  assert.deepEqual(months, ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(fillMonths([{ month: '2026-01', count: 3 }], months, ['count']).map((m) => m.count), [0, 0, 3, 0]);
});
test('daysBetween ignores invalid dates', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(daysBetween('x', '2026-01-31'), null);
});

console.log(`\nACCREDITATION: ${passed} passed${process.exitCode ? ' (with failures)' : ' — ALL OK'}`);
