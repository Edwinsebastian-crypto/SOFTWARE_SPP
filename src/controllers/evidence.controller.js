'use strict';
const { parseEvidenceUpload, parseEvidenceUpdate } = require('../validators/evidence.validator');
const { textId } = require('../utils/validators');
const { toEvidenceDto } = require('../presenters');

class EvidenceController {
  constructor({ evidenceService }) {
    this.evidenceService = evidenceService;
  }

  /** GET /api/activities/:activityId/evidences */
  listByActivity = async (req, res) => {
    const evidences = await this.evidenceService.listByActivity(req.user, textId(req.params.activityId, 'activityId'));
    res.json({ evidences: evidences.map(toEvidenceDto) });
  };

  /** POST /api/activities/:activityId/evidences  (multipart: files, description, hours) — owning student only */
  upload = async (req, res) => {
    const evidence = await this.evidenceService.upload(req.user, textId(req.params.activityId, 'activityId'), {
      files: req.files,
      ...parseEvidenceUpload(req.body)
    });
    res.status(201).json({ message: 'Evidence uploaded successfully', evidence: toEvidenceDto(evidence) });
  };

  /** PUT /api/evidences/:evidenceId  { description, hours?, keptFileIds } + files */
  update = async (req, res) => {
    const { keptFileIds } = req.body;
    let parsedKeptIds = [];
    if (keptFileIds) {
      parsedKeptIds = Array.isArray(keptFileIds) ? keptFileIds : [keptFileIds];
    }
    const updateData = parseEvidenceUpdate(req.body);
    const evidence = await this.evidenceService.update(req.user, textId(req.params.evidenceId, 'evidenceId'), {
      ...updateData,
      newFiles: req.files || [],
      keptFileIds: parsedKeptIds
    });
    res.json({ evidence: toEvidenceDto(evidence) });
  };

  /** DELETE /api/evidences/:evidenceId */
  remove = async (req, res) => {
    await this.evidenceService.remove(req.user, textId(req.params.evidenceId, 'evidenceId'));
    res.json({ ok: true });
  };
}

module.exports = EvidenceController;
