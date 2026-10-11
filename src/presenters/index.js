'use strict';
const { PRACTICE_STATUS } = require('../config/constants');

/**
 * Presenters shape domain objects into the JSON the views consume.
 * (Repositories return domain objects; the HTTP contract is defined here, in one place.)
 */

function toUserDto(user) {
  if (!user) return null;
  return {
    id: user.documentNumber,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    documentType: user.documentType,
    documentNumber: user.documentNumber,
    email: user.email,
    program: user.program || '',
    faculty: user.faculty || '',
    status: user.status,
    lastAccess: null // the legacy schema has no "last access" column
  };
}

/** Current session of the logged-in user. */
function toSessionDto(user) {
  return {
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    documentType: user.documentType,
    documentNumber: user.documentNumber,
    email: user.email,
    program: user.program,
    status: user.status
  };
}

/** A grade of 0 and an observation of '' (NOT NULL in the database) mean "not graded yet". */
function toPracticeDto(p) {
  const grade = Number(p.finalGrade);
  return {
    id: p.id,
    code: p.id,
    name: p.typeName || '',
    status: p.status,
    type: p.typeName || '',
    typeId: p.typeId,
    hours: p.requiredHours,
    semester: p.semester,
    institution: p.institutionName || '',
    institutionId: p.institutionId,
    startDate: p.startDate,
    endDate: p.endDate,
    student: p.studentName,
    studentDocument: p.studentDocument,
    tutor: p.tutorName || '',
    tutorDocument: p.tutorDocument,
    advisor: p.advisorName || '',
    advisorDocument: p.advisorDocument,
    // the "logbook" is derived from the practice (it has no table of its own)
    logbook: {
      createdAt: p.startDate,
      finalGrade: grade > 0 ? grade : null,
      generalObservation: (p.finalObservation || '').trim() || null,
      status: p.status === PRACTICE_STATUS.ACTIVE ? 'active' : 'closed'
    },
    studentDetails: {
      documentType: p.studentDocumentType,
      email: p.studentEmail,
      program: p.studentProgram,
      status: p.studentStatus
    }
  };
}

function toEvidenceDto(e) {
  return {
    id: e.id,
    files: e.files ? e.files.map(f => ({ id: f.id, url: f.url, name: f.name })) : [],
    description: e.description || '',
    hours: e.hours,
    date: null
  };
}

function toFeedbackDto(f) {
  return { id: f.id, role: f.role, text: f.text, date: f.date, evidenceId: f.evidenceId, authorDocument: f.authorDocument || f.authorDocument || null };
}

function toQuestionDto(q) {
  return {
    id: q.id,
    code: q.code,
    statement: q.statement,
    topic: q.topic,
    practiceType: q.practiceType,
    questionType: q.questionType,
    value: q.value,
    createdAt: q.createdAt
  };
}

/** An answer slot of a practice. `index` is the zero-based position, shown to the user as "Question #n". */
function toAnswerDto(a, index) {
  return {
    id: a.id,
    number: index + 1,
    questionId: a.questionId,
    statement: a.statement,
    topic: a.topic,
    value: a.value,
    answer: a.text || '',
    status: a.status,
    observation: a.observation || ''
  };
}

module.exports = { toUserDto, toSessionDto, toPracticeDto, toEvidenceDto, toFeedbackDto, toQuestionDto, toAnswerDto };
