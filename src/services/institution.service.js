'use strict';
const HttpError = require('../utils/http-error');
const { withConflictMapping } = require('../utils/db-errors');

const DUPLICATE_MESSAGE = 'An institution with that tax id already exists';
const IN_USE_MESSAGE = 'It is in use by one or more practices and cannot be deleted';

/** Institutions where practices take place (catalog managed by the Director). */
class InstitutionService {
  constructor({ institutionRepository }) {
    this.institutionRepository = institutionRepository;
  }

  list() {
    return this.institutionRepository.list();
  }

  create(data) {
    return withConflictMapping(() => this.institutionRepository.create(data), { duplicateMessage: DUPLICATE_MESSAGE });
  }

  /** The tax id (primary key) is never modified. */
  async update(taxId, data) {
    const updated = await withConflictMapping(() => this.institutionRepository.update(taxId, data), { duplicateMessage: DUPLICATE_MESSAGE });
    if (!updated) throw HttpError.notFound('Institution not found');
    return this.institutionRepository.findById(taxId);
  }

  async remove(taxId) {
    const deleted = await withConflictMapping(() => this.institutionRepository.delete(taxId), { inUseMessage: IN_USE_MESSAGE });
    if (!deleted) throw HttpError.notFound('Institution not found');
  }
}

module.exports = InstitutionService;
