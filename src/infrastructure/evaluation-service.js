'use strict';
const crypto = require('crypto');
const HttpError = require('../utils/http-error');

const TOKEN_TTL_SECONDS = 120;
/** Roles of the monolith -> roles understood by the evaluation service. */
const SERVICE_ROLES = Object.freeze({ tutor: 'TUTOR', student: 'ESTUDIANTE', director: 'DIRECTOR' });

const b64url = (input) => Buffer.from(input).toString('base64url');

/**
 * HTTP client of the evaluation microservice. Knows nothing about the domain: it signs a short-lived
 * HS256 token for the logged-in user (`sub` = document number, `rol`) and performs the request.
 * The service trusts that token, so its URL must NOT be reachable from the Internet.
 */
class EvaluationServiceClient {
  /** @param {{url: string, secret: string, timeoutMs?: number, fetchImpl?: Function, now?: () => number}} options */
  constructor({ url, secret, timeoutMs = 90000, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
    this.baseUrl = String(url || '').replace(/\/+$/, '');
    this.secret = secret || '';
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    this.now = now;
  }

  get configured() {
    return Boolean(this.baseUrl && this.secret);
  }

  /** JWT (HS256) understood by the service: { sub, rol, iat, exp, iss }. */
  signToken(user) {
    const rol = SERVICE_ROLES[user.role];
    if (!rol || !user.documentNumber) throw HttpError.forbidden('Evaluations are not available for this role');
    const iat = Math.floor(this.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
      sub: String(user.documentNumber), rol, iat, exp: iat + TOKEN_TTL_SECONDS, iss: 'spp-monolith'
    }));
    const signature = crypto.createHmac('sha256', this.secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  /**
   * @returns {Promise<{status: number, body: any}>} `body` is the parsed JSON (or null when there is none).
   * @throws {HttpError} 503 when not configured, 504 on timeout, 502 when the service cannot be reached.
   */
  async request({ user, method, path, query, body }) {
    if (!this.configured) throw new HttpError(503, 'The evaluation service is not configured');
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const init = {
      method,
      headers: { Accept: 'application/json', Authorization: `Bearer ${this.signToken(user)}` },
      signal: AbortSignal.timeout(this.timeoutMs)
    };
    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await this.fetch(url, init);
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new HttpError(504, 'The evaluation service took too long to respond');
      }
      throw HttpError.badGateway('The evaluation service is unavailable');
    }
    let parsed = null;
    if (response.status !== 204) {
      try { parsed = await response.json(); } catch (_err) { parsed = null; }
    }
    return { status: response.status, body: parsed };
  }
}

module.exports = EvaluationServiceClient;
