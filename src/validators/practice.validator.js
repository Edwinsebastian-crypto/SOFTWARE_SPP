'use strict';
const HttpError = require('../utils/http-error');
const v = require('../utils/validators');
const { PRACTICE_STATUS, PRACTICE_STATUS_LIST } = require('../config/constants');

/** POST/PUT /api/practices */
function parsePracticeInput(body = {}) {
  const input = body || {};
  const practice = {
    typeId: v.textId(input.typeId, 'practice type'),
    institutionId: v.textId(input.institutionId, 'institution'),
    studentDocument: v.text(input.studentDocument, { field: 'student', max: 30 }),
    tutorDocument: v.text(input.tutorDocument, { field: 'tutor', max: 30 }),
    advisorDocument: v.text(input.advisorDocument, { field: 'advisor', max: 30 }),
    startDate: v.isoDate(input.startDate, 'start date'),
    endDate: v.isoDate(input.endDate, 'end date'),
    status: v.oneOf(input.status, PRACTICE_STATUS_LIST, PRACTICE_STATUS.ACTIVE)
  };
  // The legacy schema does not enforce this, so it is validated here
  if (practice.endDate < practice.startDate) throw HttpError.badRequest('The end date cannot be earlier than the start date');
  return practice;
}

/** PATCH /api/practices/:id/logbook  { finalGrade?, generalObservation? } */
function parseLogbookInput(body = {}) {
  const input = body || {};
  let finalGrade = null;
  if (input.finalGrade !== undefined && input.finalGrade !== null && input.finalGrade !== '') {
    finalGrade = Number(input.finalGrade);
    if (Number.isNaN(finalGrade) || finalGrade < 0 || finalGrade > 5) throw HttpError.badRequest('The grade must be between 0.0 and 5.0');
  }
  const generalObservation = input.generalObservation === undefined
    ? null
    : v.text(input.generalObservation, { field: 'observation', max: 1000, required: false });
  return { finalGrade, generalObservation };
}

module.exports = { parsePracticeInput, parseLogbookInput };
