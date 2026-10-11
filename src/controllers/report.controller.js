'use strict';
const { parseYearFilter, parseGenerateYear, parseAuditFilter } = require('../validators/report.validator');

/** Reports, accreditation indicators and audit log (Director only). */
class ReportController {
  constructor({ reportService }) {
    this.reportService = reportService;
  }

  /** GET /api/reports/summary */
  summary = async (_req, res) => {
    res.json({ summary: await this.reportService.summary() });
  };

  /** GET /api/reports/dashboard  (real data of the five report tabs) */
  dashboard = async (_req, res) => {
    res.json({ dashboard: await this.reportService.dashboard() });
  };

  /** GET /api/reports?year=2026  (indicators stored in MongoDB) */
  list = async (req, res) => {
    res.json({ indicators: await this.reportService.list(parseYearFilter(req.query)) });
  };

  /** POST /api/reports/generate  { year? }  (computes from PostgreSQL and stores in MongoDB) */
  generate = async (req, res) => {
    res.json({ indicators: await this.reportService.generate(parseGenerateYear(req.body)) });
  };

  /** GET /api/audit-log?practiceId= */
  auditLog = async (req, res) => {
    res.json({ entries: await this.reportService.auditLog(parseAuditFilter(req.query)) });
  };
}

module.exports = ReportController;
