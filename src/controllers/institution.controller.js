'use strict';
const { parseInstitution } = require('../validators/catalog.validator');
const { textId } = require('../utils/validators');

/** Institutions where practices take place (Director only). */
class InstitutionController {
  constructor({ institutionService }) {
    this.institutionService = institutionService;
  }

  list = async (_req, res) => {
    res.json({ institutions: await this.institutionService.list() });
  };

  create = async (req, res) => {
    res.status(201).json({ institution: await this.institutionService.create(parseInstitution(req.body)) });
  };

  update = async (req, res) => {
    // the tax id (primary key) in the path is authoritative; the one in the body is ignored
    const institution = await this.institutionService.update(textId(req.params.id), parseInstitution(req.body));
    res.json({ institution });
  };

  remove = async (req, res) => {
    await this.institutionService.remove(textId(req.params.id));
    res.json({ ok: true });
  };
}

module.exports = InstitutionController;
