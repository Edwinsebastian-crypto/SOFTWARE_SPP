'use strict';
const HttpError = require('../utils/http-error');
const { withConflictMapping } = require('../utils/db-errors');
const { USER_STATUS, AUDIT_ENTITIES, AUDIT_ACTIONS } = require('../config/constants');
const UserRepository = require('../repositories/user.repository');

const ROLES_WITH_PROGRAM = UserRepository.ROLES_WITH_PROGRAM;
const ALREADY_EXISTS_PATTERN = /already|registered|exists/i;

/**
 * User management (Director only): the Supabase Auth account + the profile row in the table of the user's role.
 */
class UserService {
  constructor({ userRepository, identity, auditService }) {
    this.userRepository = userRepository;
    this.identity = identity;
    this.auditService = auditService;
  }

  list(filters) {
    return this.userRepository.list(filters);
  }

  listPrograms() {
    return this.userRepository.listPrograms();
  }

  /** Students and tutors belong to a program (FK to `programa`); advisors and directors do not. */
  async #resolveProgramId(role, programName) {
    if (!ROLES_WITH_PROGRAM.has(role)) return null;
    if (!programName) throw HttpError.badRequest('The field "program" is required');
    const program = await this.userRepository.findProgramByName(programName);
    if (!program) throw HttpError.badRequest('The selected program does not exist in the database');
    return program.id;
  }

  #isSelf(actor, user) {
    return (user.email || '').toLowerCase() === (actor.email || '').toLowerCase();
  }

  async #requireByDocument(documentNumber) {
    const user = await this.userRepository.findByDocument(documentNumber);
    if (!user) throw HttpError.notFound('User not found');
    return user;
  }

  /** @param {object} input validated by parseCreateUser */
  async create(actor, input) {
    const programId = await this.#resolveProgramId(input.role, input.programName);
    if (await this.userRepository.findByDocument(input.documentNumber)) throw HttpError.conflict('A user with that document already exists');
    if (await this.userRepository.findByEmail(input.email)) throw HttpError.conflict('A user with that e-mail already exists');

    const admin = this.identity.adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email, password: input.password, email_confirm: true,
      app_metadata: { spp: true, role: input.role },
      user_metadata: { firstName: input.firstName, lastName: input.lastName }
    });
    if (error) {
      if (ALREADY_EXISTS_PATTERN.test(error.message)) throw HttpError.conflict('That e-mail already has an access account');
      throw HttpError.badRequest(`Could not create the account: ${error.message}`);
    }
    try {
      await this.userRepository.create(input.role, { ...input, programId });
    } catch (err) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {}); // never leave orphan accounts
      throw err;
    }
    this.auditService.record(actor, { entity: AUDIT_ENTITIES.USER, entityId: input.documentNumber, action: AUDIT_ACTIONS.INSERT });
    return this.userRepository.findByDocument(input.documentNumber);
  }

  /** The role and e-mail are never changed here. @param {object} input validated by parseUpdateUser */
  async update(actor, documentNumber, input) {
    const current = await this.#requireByDocument(documentNumber);
    const programId = await this.#resolveProgramId(current.role, input.programName);
    if (this.#isSelf(actor, current) && input.status !== USER_STATUS.ACTIVE) throw HttpError.conflict('You cannot deactivate your own account');

    await this.userRepository.update(current.role, documentNumber, { ...input, programId });

    if (input.password) {
      const account = await this.identity.findByEmail(current.email);
      const admin = this.identity.adminClient();
      const result = account
        ? await admin.auth.admin.updateUserById(account.id, { password: input.password })
        // the user already existed in the database but had no access account yet: create it
        : await admin.auth.admin.createUser({ email: current.email, password: input.password, email_confirm: true, app_metadata: { spp: true, role: current.role } });
      if (result.error) throw HttpError.badRequest(`Could not change the password: ${result.error.message}`);
    }
    this.auditService.record(actor, { entity: AUDIT_ENTITIES.USER, entityId: documentNumber, action: AUDIT_ACTIONS.UPDATE });
    return this.userRepository.findByDocument(documentNumber);
  }

  async changeStatus(actor, documentNumber, status) {
    const current = await this.#requireByDocument(documentNumber);
    if (this.#isSelf(actor, current) && status !== USER_STATUS.ACTIVE) throw HttpError.conflict('You cannot deactivate your own account');
    await this.userRepository.updateStatus(current.role, documentNumber, status);
    this.auditService.record(actor, { entity: AUDIT_ENTITIES.USER, entityId: documentNumber, action: AUDIT_ACTIONS.UPDATE });
    return this.userRepository.findByDocument(documentNumber);
  }

  async remove(actor, documentNumber) {
    const current = await this.#requireByDocument(documentNumber);
    if (this.#isSelf(actor, current)) throw HttpError.conflict('You cannot delete your own account');
    await withConflictMapping(
      () => this.userRepository.delete(current.role, documentNumber),
      { inUseMessage: 'The user has associated practices. Deactivate the user instead of deleting' }
    );
    try {
      const account = await this.identity.findByEmail(current.email);
      if (account) await this.identity.adminClient().auth.admin.deleteUser(account.id);
    } catch (err) {
      console.warn('[supabase] could not delete the account:', err.message);
    }
    this.auditService.record(actor, { entity: AUDIT_ENTITIES.USER, entityId: documentNumber, action: AUDIT_ACTIONS.DELETE });
  }
}

module.exports = UserService;
