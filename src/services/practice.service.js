'use strict';
const HttpError = require('../utils/http-error');
const { ROLES, USER_STATUS, AUDIT_ENTITIES, AUDIT_ACTIONS } = require('../config/constants');

/** Practice lifecycle: creation with its participants, updates, logbook (final grade) and deletion. */
class PracticeService {
  constructor({
    practiceRepository, activityRepository, userRepository, practiceTypeRepository, institutionRepository,
    practiceAccessService, auditService, notificationService, fileStorage
  }) {
    this.practiceRepository = practiceRepository;
    this.activityRepository = activityRepository;
    this.userRepository = userRepository;
    this.practiceTypeRepository = practiceTypeRepository;
    this.institutionRepository = institutionRepository;
    this.access = practiceAccessService;
    this.auditService = auditService;
    this.notificationService = notificationService;
    this.fileStorage = fileStorage;
  }

  /** Practices visible to the user, according to their role. */
  listFor(user) {
    const filters = {
      [ROLES.STUDENT]: { studentDocument: user.documentNumber },
      [ROLES.TUTOR]: { tutorDocument: user.documentNumber },
      [ROLES.ADVISOR]: { advisorDocument: user.documentNumber },
      [ROLES.DIRECTOR]: {}
    }[user.role];
    return this.practiceRepository.list(filters);
  }

  get(user, practiceId) {
    return this.access.loadAuthorized(user, practiceId);
  }

  async listActivities(user, practiceId) {
    const practice = await this.access.loadAuthorized(user, practiceId);
    return this.activityRepository.listByPractice(practice.id);
  }

  async createActivity(user, practiceId, data = {}, files = []) {
    const practice = await this.access.loadAuthorized(user, practiceId);
    const activity = await this.activityRepository.create(practice.id, data);
    
    if (files && files.length > 0) {
      const { generateId } = require('../utils/id-generator');
      const uploadedFiles = await Promise.all(files.map(async (file) => {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 255);
        const uploaded = await this.fileStorage.upload(file.buffer, { folder: `practice-activities/${practice.id}` });
        return { id: generateId('AR'), url: uploaded.secure_url, name: originalName, mimeType: file.mimetype };
      }));
      await this.activityRepository.addFiles(activity.id, uploadedFiles);
    }
    
    return activity;
  }

  async updateActivity(user, practiceId, activityId, data, files) {
    const practice = await this.access.loadAuthorized(user, practiceId);
    
    // Process file deletions if keptFileIds is provided (usually when editing via modal)
    if (data.keptFileIds) {
      const keptIds = typeof data.keptFileIds === 'string' ? JSON.parse(data.keptFileIds) : data.keptFileIds;
      const activity = await this.activityRepository.findById(activityId);
      // Wait, activityRepository.findById only returns title, we need files. 
      // Let's use listActivities and find the current one.
      const allActivities = await this.activityRepository.listByPractice(practice.id);
      const currentActivity = allActivities.find(a => String(a.id) === String(activityId));
      if (currentActivity && currentActivity.files) {
        const filesToDelete = currentActivity.files.filter(f => !keptIds.includes(f.id));
        for (const f of filesToDelete) {
          await this.activityRepository.deleteFile(f.id);
          const stored = this.fileStorage.parseUrl(f.url);
          if (stored) {
            await this.fileStorage.destroy(stored.publicId, stored.resourceType).catch(() => {});
          }
        }
      }
    }

    // Process new files
    if (files && files.length > 0) {
      const { generateId } = require('../utils/id-generator');
      const uploadedFiles = await Promise.all(files.map(async (file) => {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 255);
        const uploaded = await this.fileStorage.upload(file.buffer, { folder: `practice-activities/${practice.id}` });
        return { id: generateId('AR'), url: uploaded.secure_url, name: originalName, mimeType: file.mimetype };
      }));
      await this.activityRepository.addFiles(activityId, uploadedFiles);
    }

    await this.activityRepository.update(activityId, data);
    return this.activityRepository.findById(activityId);
  }

  async removeActivity(user, practiceId, activityId) {
    const practice = await this.access.loadAuthorized(user, practiceId);
    
    const allActivities = await this.activityRepository.listByPractice(practice.id);
    const activity = allActivities.find(a => String(a.id) === String(activityId));
    if (!activity) throw HttpError.notFound('Activity not found');

    if (activity.evidenceCount > 0) {
      throw HttpError.badRequest('Cannot delete an activity that already has evidence.');
    }

    if (activity.files && activity.files.length > 0) {
      for (const f of activity.files) {
        await this.activityRepository.deleteFile(f.id);
        const stored = this.fileStorage.parseUrl(f.url);
        if (stored) {
          await this.fileStorage.destroy(stored.publicId, stored.resourceType).catch(() => {});
        }
      }
    }
    
    await this.activityRepository.deleteActivity(activityId);
    this.auditService.record(user, { entity: 'activity', entityId: activityId, practiceId: practice.id, action: AUDIT_ACTIONS.DELETE });
  }

  /** Verifies that the referenced catalog entries exist and that the participants have the right role and are active. */
  async #validateReferences(input) {
    const type = await this.practiceTypeRepository.findById(input.typeId);
    if (!type) throw HttpError.badRequest('The practice type does not exist');
    if (!(await this.institutionRepository.findById(input.institutionId))) throw HttpError.badRequest('The institution does not exist');

    const [student, tutor, advisor] = await Promise.all([
      this.userRepository.findByDocument(input.studentDocument),
      this.userRepository.findByDocument(input.tutorDocument),
      this.userRepository.findByDocument(input.advisorDocument)
    ]);
    const isValid = (user, role) => user && user.role === role && user.status === USER_STATUS.ACTIVE;
    if (!isValid(student, ROLES.STUDENT)) throw HttpError.badRequest('The selected student is not valid or is not active');
    if (!isValid(tutor, ROLES.TUTOR)) throw HttpError.badRequest('The selected tutor is not valid or is not active');
    if (!isValid(advisor, ROLES.ADVISOR)) throw HttpError.badRequest('The selected advisor is not valid or is not active');
    return { type, student, tutor, advisor };
  }

  /** @param {object} input validated by parsePracticeInput */
  async create(actor, input) {
    const { type, student, tutor, advisor } = await this.#validateReferences(input);
    const id = await this.practiceRepository.create(input);
    this.auditService.record(actor, { entity: AUDIT_ENTITIES.PRACTICE, entityId: id, practiceId: id, action: AUDIT_ACTIONS.INSERT });

    this.notificationService.notifyPracticeAssigned({
      practiceId: id,
      practiceName: type.name,
      startDate: input.startDate,
      endDate: input.endDate,
      participants: [
        { person: student, roleLabel: 'student' },
        { person: tutor, roleLabel: 'academic tutor' },
        { person: advisor, roleLabel: 'pedagogical advisor' }
      ]
    });
    return this.practiceRepository.findById(id);
  }

  async update(actor, id, input) {
    if (!(await this.practiceRepository.findById(id))) throw HttpError.notFound('Practice not found');
    await this.#validateReferences(input);
    await this.practiceRepository.update(id, input);
    this.auditService.record(actor, { entity: AUDIT_ENTITIES.PRACTICE, entityId: id, practiceId: id, action: AUDIT_ACTIONS.UPDATE });
    return this.practiceRepository.findById(id);
  }

  async remove(actor, id) {
    if (!(await this.practiceRepository.findById(id))) throw HttpError.notFound('Practice not found');
    await this.practiceRepository.delete(id);
    this.auditService.record(actor, { entity: AUDIT_ENTITIES.PRACTICE, entityId: id, practiceId: id, action: AUDIT_ACTIONS.DELETE });
  }

  /** The assigned tutor (or the director) records the final grade and a general observation. */
  async updateLogbook(actor, practiceId, input) {
    const practice = await this.access.loadAuthorized(actor, practiceId);
    await this.practiceRepository.updateLogbook(practice.id, input);
    this.auditService.record(actor, { entity: AUDIT_ENTITIES.LOGBOOK, entityId: practice.id, practiceId: practice.id, action: AUDIT_ACTIONS.UPDATE });
    return this.practiceRepository.findById(practice.id);
  }
}

module.exports = PracticeService;
