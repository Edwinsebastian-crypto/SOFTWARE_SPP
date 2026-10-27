'use strict';
const HttpError = require('../utils/http-error');
const { PRACTICE_STATUS } = require('../config/constants');

const ID = '(\\d+)';
/** `hook` runs BEFORE the call (authorization / body shaping); `after` runs on the successful response. */
const route = (method, pattern, hook, after) => ({ method, regex: new RegExp(`^${pattern}$`), hook, after });

/**
 * Allow-list of what the views may call. Anything else is a 404, so the service cannot be reached with
 * crafted paths. Paths are relative to /api/evaluations/<role>.
 */
const ROUTES = Object.freeze({
  tutor: [
    route('GET', '/evaluaciones', 'listEvaluations'),
    route('POST', '/evaluaciones', 'createEvaluation'),
    route('GET', `/evaluaciones/${ID}`),
    route('PATCH', `/evaluaciones/${ID}`, 'patchEvaluation'),
    route('DELETE', `/evaluaciones/${ID}`),
    route('POST', `/evaluaciones/${ID}/(publicar|despublicar|cerrar|generar)`),
    route('POST', `/evaluaciones/${ID}/preguntas`),
    route('POST', `/evaluaciones/${ID}/preguntas/aprobar-todas`),
    route('PUT', `/evaluaciones/${ID}/preguntas/orden`),
    route('GET', `/evaluaciones/${ID}/intentos`),
    route('PATCH', `/preguntas/${ID}`),
    route('DELETE', `/preguntas/${ID}`),
    route('POST', `/preguntas/${ID}/(aprobar|rechazar)`),
    route('GET', `/intentos/${ID}`),
    route('POST', `/respuestas/${ID}/(calificar|retro)`),
    route('GET', '/evidencias', 'listEvidence')
  ],
  student: [
    route('GET', '/evaluaciones'),
    route('POST', `/evaluaciones/${ID}/intentos`),
    route('GET', `/intentos/${ID}`),
    route('PUT', `/intentos/${ID}/respuestas/${ID}`),
    route('POST', `/intentos/${ID}/enviar`)
  ],
  // The director only reads: there is no verb other than GET on purpose.
  director: [
    route('GET', '/resumen', undefined, 'addDirectory'),
    route('GET', '/evaluaciones', 'directorQuery', 'addDirectory'),
    route('GET', `/evaluaciones/${ID}`, undefined, 'addDirectory')
  ],
  meta: [route('GET', '/health')]
});
/** Name of the role segment in the service's own API. */
const SERVICE_SEGMENT = Object.freeze({ tutor: '/tutor', student: '/estudiante', director: '/director', meta: '' });
const DIRECTOR_STATES = Object.freeze(['BORRADOR', 'PUBLICADA', 'CERRADA']);
const DIRECTORY_TTL_MS = 30000;
const CREATE_FIELDS = ['titulo', 'descripcion', 'fecha_limite', 'intentos_permitidos', 'nota_maxima', 'mostrar_resultados'];

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Turns the service's error body (FastAPI `detail`) into a single readable message. */
function errorMessage(body, status) {
  const detail = body && body.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    return `Check the data: ${detail.map((d) => String(d.msg || '').replace(/^Value error, /, '')).filter(Boolean).join(' · ')}`;
  }
  return `Evaluation service error (${status})`;
}

/**
 * Gateway between the SPP views and the evaluation microservice.
 * Business rules about WHO may touch WHICH practice stay here (PracticeAccessService is the single source of
 * truth); the service only knows document numbers.
 */
class EvaluationGatewayService {
  /** @param {{client: object, practiceAccessService: object, practiceRepository?: {list: Function}, now?: () => number}} deps */
  constructor({ client, practiceAccessService, practiceRepository, now = () => Date.now() }) {
    this.client = client;
    this.access = practiceAccessService;
    this.practices = practiceRepository;
    this.now = now;
    this.directoryCache = null;
  }

  /**
   * @param {object} user       authenticated user (req.user)
   * @param {{role: 'tutor'|'student'|'meta', method: string, path: string, query?: object, body?: any}} request
   * @returns {Promise<{status: number, body: any}>}
   */
  async forward(user, { role, method, path, query = {}, body }) {
    const table = ROUTES[role];
    if (!table || !/^[A-Za-z0-9/_-]*$/.test(path) || path.includes('//')) throw HttpError.notFound('Route not found');
    const match = table.find((r) => r.method === method && r.regex.test(path));
    if (!match) throw HttpError.notFound('Route not found');

    let payload = body;
    let params = {};
    if (match.hook) ({ body: payload, query: params } = await this[match.hook](user, query, body));

    const result = await this.client.request({
      user, method, path: `${SERVICE_SEGMENT[role]}${path}`, query: params, body: payload
    });
    const translated = this.#translate(result);
    if (match.after) translated.body = await this[match.after](translated.body);
    return translated;
  }

  #translate({ status, body }) {
    if (status < 400) return { status, body };
    if (status === 401) throw HttpError.badGateway('The evaluation service rejected the session (check EVALUATION_SERVICE_SECRET)');
    if (status >= 500) throw HttpError.badGateway('The evaluation service failed');
    throw new HttpError(status, errorMessage(body, status));
  }

  // ---------------------------------------------------------------- hooks (tutor)

  async listEvaluations(user, query) {
    const practiceId = text(query.id_practica);
    if (practiceId) await this.access.loadAuthorized(user, practiceId);
    return { body: undefined, query: { id_practica: practiceId } };
  }

  async listEvidence(user, query) {
    const practiceId = text(query.id_practica);
    if (!practiceId) throw HttpError.badRequest('id_practica is required');
    await this.access.loadAuthorized(user, practiceId);
    return { body: undefined, query: { id_practica: practiceId } };
  }

  /** The student is NOT taken from the request: it is always the student of the practice. */
  async createEvaluation(user, _query, body) {
    const input = body && typeof body === 'object' ? body : {};
    const practiceId = text(input.id_practica);
    if (!practiceId) throw HttpError.badRequest('id_practica is required');
    const practice = await this.access.loadAuthorized(user, practiceId);
    if (practice.status === PRACTICE_STATUS.CANCELLED) throw HttpError.conflict('The practice is cancelled');

    const payload = { id_practica: practice.id, id_estudiante: practice.studentDocument };
    for (const field of CREATE_FIELDS) if (input[field] !== undefined) payload[field] = input[field];
    if (input.id_actividad) {
      const { activity } = await this.access.loadAuthorizedActivity(user, text(input.id_actividad));
      if (activity.practiceId !== practice.id) throw HttpError.badRequest('The activity belongs to another practice');
      payload.id_actividad = activity.id;
    }
    return { body: payload, query: {} };
  }

  async patchEvaluation(user, _query, body) {
    if (body && body.id_actividad) await this.access.loadAuthorizedActivity(user, text(body.id_actividad));
    return { body, query: {} };
  }

  // ---------------------------------------------------------------- hooks (director: read only)

  /** Only these filters reach the service, each one validated. */
  async directorQuery(_user, query) {
    const params = {};
    const estado = text(query.estado).toUpperCase();
    if (estado) {
      if (!DIRECTOR_STATES.includes(estado)) throw HttpError.badRequest('estado must be BORRADOR, PUBLICADA or CERRADA');
      params.estado = estado;
    }
    for (const field of ['id_tutor', 'id_practica']) {
      const value = text(query[field]);
      if (value.length > 30) throw HttpError.badRequest(`${field} is too long`);
      if (value) params[field] = value;
    }
    const q = text(query.q);
    if (q) params.q = q.slice(0, 100);
    if (text(query.solo_alertas) === 'true') params.solo_alertas = 'true';
    for (const [field, min, max] of [['limite', 1, 100], ['desplazamiento', 0, 100000]]) {
      if (query[field] === undefined || query[field] === '') continue;
      const n = Number(query[field]);
      if (!Number.isInteger(n) || n < min || n > max) throw HttpError.badRequest(`${field} must be an integer between ${min} and ${max}`);
      params[field] = n;
    }
    return { body: undefined, query: params };
  }

  /**
   * The service only knows document numbers and practice ids. Adds `directorio` with the readable names of
   * the ones that appear in the response, so the director sees people and not codes. Ids that are not in the
   * practice database (e.g. the practice was deleted) are simply absent: the view shows them as "not found".
   */
  async addDirectory(body) {
    if (!body || typeof body !== 'object' || !this.practices) return body;
    const wanted = { id_practica: new Set(), id_tutor: new Set(), id_estudiante: new Set() };
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (wanted[key] && typeof value === 'string') wanted[key].add(value);
        else walk(value);
      }
    };
    walk(body);

    const { byId, tutors, students } = await this.#directory();
    const pick = (ids, source) => Object.fromEntries([...ids].filter((id) => source.has(id)).map((id) => [id, source.get(id)]));
    return {
      ...body,
      directorio: {
        practicas: pick(wanted.id_practica, byId),
        tutores: pick(wanted.id_tutor, tutors),
        estudiantes: pick(wanted.id_estudiante, students)
      }
    };
  }

  /** One query for every practice, cached for a few seconds (the director screen makes three calls on load). */
  async #directory() {
    const now = this.now();
    if (this.directoryCache && now - this.directoryCache.at < DIRECTORY_TTL_MS) return this.directoryCache.value;
    const byId = new Map();
    const tutors = new Map();
    const students = new Map();
    for (const p of await this.practices.list()) {
      byId.set(p.id, {
        estudiante: p.studentName || null, tutor: p.tutorName || null,
        institucion: p.institutionName || null, tipo: p.typeName || null, estado: p.status || null
      });
      if (p.tutorDocument && p.tutorName) tutors.set(p.tutorDocument, p.tutorName);
      if (p.studentDocument && p.studentName) students.set(p.studentDocument, p.studentName);
    }
    const value = { byId, tutors, students };
    this.directoryCache = { at: now, value };
    return value;
  }
}

module.exports = EvaluationGatewayService;
