'use strict';
const HttpError = require('../utils/http-error');

/** Reports and accreditation indicators (Director only). */
class ReportService {
  constructor({ indicatorRepository, auditService }) {
    this.indicatorRepository = indicatorRepository;
    this.auditService = auditService;
  }

  summary() {
    return this.indicatorRepository.summary();
  }

  /** Real data of the five report tabs, computed from PostgreSQL. */
  dashboard() {
    return this.indicatorRepository.dashboard();
  }

  /** Indicators already stored in MongoDB. */
  list(year) {
    return this.indicatorRepository.list(year);
  }

  /** Computes the indicators from PostgreSQL and stores them in MongoDB. */
  async generate(year) {
    const indicators = await this.indicatorRepository.calculate(year);
    try {
      await this.indicatorRepository.save(year, indicators);
    } catch (err) {
      console.error('[reports] could not store indicators:', err.message);
      throw HttpError.badGateway('The indicators were computed but could not be saved to MongoDB');
    }
    return indicators;
  }

  auditLog({ practiceId } = {}) {
    return this.auditService.list({ practiceId });
  }
}

module.exports = ReportService;
