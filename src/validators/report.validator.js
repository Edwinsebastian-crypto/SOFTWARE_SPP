'use strict';
const v = require('../utils/validators');

const YEAR_RULE = { field: 'year', min: 2000, max: 2100 };

/** GET /api/reports?year=2026 (optional) */
function parseYearFilter(query = {}) {
  return query.year ? v.integer(query.year, YEAR_RULE) : undefined;
}

/** POST /api/reports/generate  { year? } (defaults to the current year) */
function parseGenerateYear(body = {}) {
  return v.integer((body || {}).year ?? new Date().getFullYear(), YEAR_RULE);
}

/** GET /api/audit-log?practiceId= (optional) */
function parseAuditFilter(query = {}) {
  return { practiceId: query.practiceId ? v.textId(query.practiceId, 'practice') : undefined };
}

module.exports = { parseYearFilter, parseGenerateYear, parseAuditFilter };
