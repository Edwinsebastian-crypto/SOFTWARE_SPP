'use strict';

/**
 * Composition root: the ONLY place where concrete classes are instantiated and wired together.
 *
 *   repositories (SQL / Mongo)  ->  services (business rules)  ->  controllers (HTTP)
 *
 * Everything below depends on abstractions it receives through its constructor, which keeps each
 * layer replaceable and unit-testable.
 */
const identity = require('./infrastructure/supabase');
const fileStorage = require('./infrastructure/file-storage');
const { createAuthenticator } = require('./middlewares/authenticate.middleware');

const UserRepository = require('./repositories/user.repository');
const PracticeRepository = require('./repositories/practice.repository');
const ActivityRepository = require('./repositories/activity.repository');
const EvidenceRepository = require('./repositories/evidence.repository');
const FeedbackRepository = require('./repositories/feedback.repository');
const InstitutionRepository = require('./repositories/institution.repository');
const PracticeTypeRepository = require('./repositories/practice-type.repository');
const QuestionRepository = require('./repositories/question.repository');
const AnswerRepository = require('./repositories/answer.repository');
const IndicatorRepository = require('./repositories/indicator.repository');
const AuditRepository = require('./repositories/audit.repository');
const NotificationRepository = require('./repositories/notification.repository');

const AuditService = require('./services/audit.service');
const NotificationService = require('./services/notification.service');
const PracticeAccessService = require('./services/practice-access.service');
const SessionService = require('./services/session.service');
const AuthService = require('./services/auth.service');
const UserService = require('./services/user.service');
const InstitutionService = require('./services/institution.service');
const PracticeTypeService = require('./services/practice-type.service');
const PracticeService = require('./services/practice.service');
const EvidenceService = require('./services/evidence.service');
const FeedbackService = require('./services/feedback.service');
const QuestionService = require('./services/question.service');
const AnswerService = require('./services/answer.service');
const ReportService = require('./services/report.service');

const AuthController = require('./controllers/auth.controller');
const UserController = require('./controllers/user.controller');
const InstitutionController = require('./controllers/institution.controller');
const PracticeTypeController = require('./controllers/practice-type.controller');
const PracticeController = require('./controllers/practice.controller');
const EvidenceController = require('./controllers/evidence.controller');
const FeedbackController = require('./controllers/feedback.controller');
const QuestionController = require('./controllers/question.controller');
const AnswerController = require('./controllers/answer.controller');
const ReportController = require('./controllers/report.controller');
const PageController = require('./controllers/page.controller');

function createContainer() {
  // ----- repositories -----
  const userRepository = new UserRepository();
  const practiceRepository = new PracticeRepository();
  const activityRepository = new ActivityRepository();
  const evidenceRepository = new EvidenceRepository();
  const feedbackRepository = new FeedbackRepository();
  const institutionRepository = new InstitutionRepository();
  const practiceTypeRepository = new PracticeTypeRepository();
  const questionRepository = new QuestionRepository();
  const answerRepository = new AnswerRepository();
  const indicatorRepository = new IndicatorRepository();
  const auditRepository = new AuditRepository();
  const notificationRepository = new NotificationRepository();

  // ----- services -----
  const auditService = new AuditService({ auditRepository });
  const notificationService = new NotificationService({ notificationRepository });
  const practiceAccessService = new PracticeAccessService({ practiceRepository, activityRepository });
  const sessionService = new SessionService({ identity, userRepository });
  const authService = new AuthService({ identity, userRepository });
  const userService = new UserService({ userRepository, identity, auditService });
  const institutionService = new InstitutionService({ institutionRepository });
  const practiceTypeService = new PracticeTypeService({ practiceTypeRepository });
  const practiceService = new PracticeService({
    practiceRepository, activityRepository, userRepository, practiceTypeRepository, institutionRepository,
    answerRepository, practiceAccessService, auditService, notificationService, fileStorage
  });
  const evidenceService = new EvidenceService({ evidenceRepository, practiceAccessService, fileStorage, auditService });
  const feedbackService = new FeedbackService({ feedbackRepository, evidenceRepository, practiceAccessService, auditService });
  const questionService = new QuestionService({ questionRepository });
  const answerService = new AnswerService({ answerRepository, questionRepository, practiceAccessService, auditService });
  const reportService = new ReportService({ indicatorRepository, auditService });

  // ----- HTTP layer -----
  const authenticate = createAuthenticator(sessionService);
  const controllers = {
    auth: new AuthController({ authService }),
    user: new UserController({ userService }),
    institution: new InstitutionController({ institutionService }),
    practiceType: new PracticeTypeController({ practiceTypeService }),
    practice: new PracticeController({ practiceService }),
    evidence: new EvidenceController({ evidenceService }),
    feedback: new FeedbackController({ feedbackService }),
    question: new QuestionController({ questionService }),
    answer: new AnswerController({ answerService }),
    report: new ReportController({ reportService }),
    page: new PageController({ resolveUser: authenticate.resolveUser })
  };

  return {
    authenticate,
    controllers,
    services: {
      auditService, authService, sessionService, userService, institutionService, practiceTypeService, practiceService,
      evidenceService, feedbackService, questionService, answerService, reportService
    },
    repositories: {
      userRepository, practiceRepository, activityRepository, evidenceRepository, feedbackRepository, institutionRepository,
      practiceTypeRepository, questionRepository, answerRepository, indicatorRepository, auditRepository, notificationRepository
    }
  };
}

module.exports = { createContainer };
