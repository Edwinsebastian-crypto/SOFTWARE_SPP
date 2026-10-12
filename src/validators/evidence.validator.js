'use strict';
const v = require('../utils/validators');

function parseHours(value, { required }) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  return v.integer(value, { field: 'hours worked', min: 0, max: 1000 });
}

/** POST /api/activities/:activityId/evidences (multipart body: description, hours) */
function parseEvidenceUpload(body = {}) {
  const input = body || {};
  return {
    description: v.text(input.description, { field: 'description', max: 4000, required: false }),
    hours: parseHours(input.hours, { required: true })
  };
}

/** PUT /api/evidences/:evidenceId  { description, hours? } */
function parseEvidenceUpdate(body = {}) {
  const input = body || {};
  return {
    description: v.text(input.description, { field: 'description', max: 4000, required: false }),
    hours: parseHours(input.hours, { required: false })
  };
}

/** POST /api/activities/:activityId/feedback  { evidenceId, text, date } */
function parseFeedback(body = {}) {
  const input = body || {};
  return {
    evidenceId: v.textId(input.evidenceId, 'evidence'),
    text: v.text(input.text, { field: 'comment', max: 4000 }),
    date: (input.date && String(input.date).trim()) ? String(input.date).trim() : null
  };
}

/** PATCH /api/activities/:activityId/feedback/:feedbackId  { text, date } */
function parseFeedbackUpdate(body = {}) {
  const input = body || {};
  return {
    text: v.text(input.text, { field: 'comment', max: 4000 }),
    date: (input.date && String(input.date).trim()) ? String(input.date).trim() : null
  };
}

module.exports = { parseEvidenceUpload, parseEvidenceUpdate, parseFeedback, parseFeedbackUpdate };
