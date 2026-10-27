'use strict';

/** Application-wide constants and domain enumerations (API-facing, English values). */

const ROLES = Object.freeze({
  STUDENT: 'student',
  TUTOR: 'tutor',
  ADVISOR: 'advisor',
  DIRECTOR: 'director'
});
const ROLE_LIST = Object.freeze(Object.values(ROLES));

/** Roles that may self-register (the Director account is never created this way). */
const REGISTRABLE_ROLES = Object.freeze(['student', 'tutor', 'advisor']);

const USER_STATUS = Object.freeze({ ACTIVE: 'active', PENDING: 'pending', INACTIVE: 'inactive' });
const USER_STATUS_LIST = Object.freeze(Object.values(USER_STATUS));

const PRACTICE_STATUS = Object.freeze({ ACTIVE: 'active', COMPLETED: 'completed', CANCELLED: 'cancelled' });
const PRACTICE_STATUS_LIST = Object.freeze(Object.values(PRACTICE_STATUS));

const QUESTION_TOPICS = Object.freeze(['pedagogy', 'didactics', 'assessment']);
const QUESTION_TYPES = Object.freeze(['open', 'multiple-choice', 'true-false']);
const ANSWER_STATUS = Object.freeze({ PENDING: 'pending', DRAFT: 'draft', ANSWERED: 'answered' });

const DOCUMENT_TYPES = Object.freeze(['CC', 'CE', 'PA']);

const AUDIT_ENTITIES = Object.freeze({
  PRACTICE: 'practice',
  LOGBOOK: 'logbook',
  EVIDENCE: 'evidence',
  FEEDBACK: 'feedback',
  ANSWER: 'answer',
  USER: 'user'
});
const AUDIT_ACTIONS = Object.freeze({ INSERT: 'insert', UPDATE: 'update', DELETE: 'delete' });
/** Audit entries that are not tied to a practice carry this placeholder. */
const NO_PRACTICE = 'N/A';

/** Every practice is created with this many activities (the student panel shows six fixed slots). */
const ACTIVITIES_PER_PRACTICE = 6;

const COOKIES = Object.freeze({ ACCESS: 'spp_at', REFRESH: 'spp_rt' });
/** Anti-CSRF header every state-changing API request must send. */
const CSRF_HEADER = 'X-SPP';

/** MIME type stored for evidence that is a link to a Google Drive / Docs / Sheets / Slides file. */
const GOOGLE_LINK_MIME = 'application/vnd.google-apps.link';

const UPLOAD = Object.freeze({
  MAX_BYTES: 10 * 1024 * 1024,
  ALLOWED_MIME_TYPES: Object.freeze([
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ])
});

module.exports = {
  ROLES, ROLE_LIST, REGISTRABLE_ROLES, USER_STATUS, USER_STATUS_LIST, PRACTICE_STATUS, PRACTICE_STATUS_LIST,
  QUESTION_TOPICS, QUESTION_TYPES, ANSWER_STATUS, DOCUMENT_TYPES,
  AUDIT_ENTITIES, AUDIT_ACTIONS, NO_PRACTICE, ACTIVITIES_PER_PRACTICE,
  COOKIES, CSRF_HEADER, UPLOAD, GOOGLE_LINK_MIME
};
