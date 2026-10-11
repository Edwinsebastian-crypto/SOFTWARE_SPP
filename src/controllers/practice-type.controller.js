'use strict';
const { parsePracticeType } = require('../validators/catalog.validator');
const { textId } = require('../utils/validators');

/** Practice types (Director only). */
class PracticeTypeController {
  constructor({ practiceTypeService }) {
    this.practiceTypeService = practiceTypeService;
  }

  list = async (_req, res) => {
    res.json({ practiceTypes: await this.practiceTypeService.list() });
  };

  create = async (req, res) => {
    res.status(201).json({ practiceType: await this.practiceTypeService.create(parsePracticeType(req.body)) });
  };

  update = async (req, res) => {
    await this.practiceTypeService.update(textId(req.params.id), parsePracticeType(req.body));
    res.json({ ok: true });
  };

  remove = async (req, res) => {
    await this.practiceTypeService.remove(textId(req.params.id));
    res.json({ ok: true });
  };
}

module.exports = PracticeTypeController;
