'use strict';
const HttpError = require('../utils/http-error');
const { ROLES } = require('../config/constants');

/**
 * Single rule of "who may touch which practice", shared by every service.
 *  - director: everything
 *  - student:  only their own practice
 *  - tutor / advisor: only the practices assigned to them
 */
class PracticeAccessService {
  constructor({ practiceRepository, activityRepository }) {
    this.practiceRepository = practiceRepository;
    this.activityRepository = activityRepository;
  }

  isParticipant(user, practice) {
    switch (user.role) {
      case ROLES.DIRECTOR: return true;
      case ROLES.STUDENT: return practice.studentDocument === user.documentNumber;
      case ROLES.TUTOR: return practice.tutorDocument === user.documentNumber;
      case ROLES.ADVISOR: return practice.advisorDocument === user.documentNumber;
      default: return false;
    }
  }

  /** Loads the practice and verifies access. Answers 404 (not 403) so existence is not revealed. */
  async loadAuthorized(user, practiceId) {
    const practice = await this.practiceRepository.findById(practiceId);
    if (!practice || !this.isParticipant(user, practice)) throw HttpError.notFound('Practice not found');
    return practice;
  }

  /** Loads an activity together with its (authorized) practice. */
  async loadAuthorizedActivity(user, activityId) {
    const activity = await this.activityRepository.findById(activityId);
    if (!activity) throw HttpError.notFound('Activity not found');
    const practice = await this.loadAuthorized(user, activity.practiceId);
    return { activity, practice };
  }
}

module.exports = PracticeAccessService;
