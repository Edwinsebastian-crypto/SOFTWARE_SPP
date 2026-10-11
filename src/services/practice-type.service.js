'use strict';
const HttpError = require('../utils/http-error');
const { withConflictMapping } = require('../utils/db-errors');

const IN_USE_MESSAGE = 'It is in use by one or more practices and cannot be deleted';

/** Practice types (catalog managed by the Director). */
class PracticeTypeService {
  constructor({ practiceTypeRepository }) {
    this.practiceTypeRepository = practiceTypeRepository;
  }

  list() {
    return this.practiceTypeRepository.list();
  }

  create(data) {
    return withConflictMapping(() => this.practiceTypeRepository.create(data), { duplicateMessage: 'A type with that code already exists' });
  }

  async update(id, data) {
    if (!(await this.practiceTypeRepository.update(id, data))) throw HttpError.notFound('Practice type not found');
  }

  async remove(id) {
    const deleted = await withConflictMapping(() => this.practiceTypeRepository.delete(id), { inUseMessage: IN_USE_MESSAGE });
    if (!deleted) throw HttpError.notFound('Practice type not found');
  }
}

module.exports = PracticeTypeService;
