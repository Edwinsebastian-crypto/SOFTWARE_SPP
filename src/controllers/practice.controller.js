'use strict';
const { parsePracticeInput, parseLogbookInput } = require('../validators/practice.validator');
const { textId } = require('../utils/validators');
const { toPracticeDto } = require('../presenters');

class PracticeController {
  constructor({ practiceService }) {
    this.practiceService = practiceService;
  }

  /** GET /api/practices  (what the user can see depends on their role) */
  list = async (req, res) => {
    const practices = await this.practiceService.listFor(req.user);
    res.json({ practices: practices.map(toPracticeDto) });
  };

  /** GET /api/practices/:id */
  get = async (req, res) => {
    const practice = await this.practiceService.get(req.user, textId(req.params.id));
    res.json({ practice: toPracticeDto(practice) });
  };

  /** GET /api/practices/:id/activities */
  listActivities = async (req, res) => {
    res.json({ activities: await this.practiceService.listActivities(req.user, textId(req.params.id)) });
  };

  /** POST /api/practices/:id/activities */
  createActivity = async (req, res) => {
    const activity = await this.practiceService.createActivity(req.user, textId(req.params.id), req.body, req.files);
    res.status(201).json({ activity });
  };

  updateActivity = async (req, res) => {
    const activity = await this.practiceService.updateActivity(req.user, textId(req.params.id), textId(req.params.activityId), req.body, req.files);
    res.json({ activity });
  };

  removeActivity = async (req, res) => {
    await this.practiceService.removeActivity(req.user, textId(req.params.id), textId(req.params.activityId));
    res.json({ ok: true });
  };

  /** POST /api/practices  (Director) */
  create = async (req, res) => {
    const practice = await this.practiceService.create(req.user, parsePracticeInput(req.body));
    res.status(201).json({ practice: toPracticeDto(practice) });
  };

  /** PUT /api/practices/:id  (Director) */
  update = async (req, res) => {
    const practice = await this.practiceService.update(req.user, textId(req.params.id), parsePracticeInput(req.body));
    res.json({ practice: toPracticeDto(practice) });
  };

  /** DELETE /api/practices/:id  (Director) */
  remove = async (req, res) => {
    await this.practiceService.remove(req.user, textId(req.params.id));
    res.json({ ok: true });
  };

  /** PATCH /api/practices/:id/logbook  (assigned tutor or Director) */
  updateLogbook = async (req, res) => {
    const practice = await this.practiceService.updateLogbook(req.user, textId(req.params.id), parseLogbookInput(req.body));
    res.json({ practice: toPracticeDto(practice) });
  };
}

module.exports = PracticeController;
