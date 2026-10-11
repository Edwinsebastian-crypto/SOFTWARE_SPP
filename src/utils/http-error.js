'use strict';

/** Error carrying an HTTP status code; the global error handler turns it into a JSON response. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }

  static badRequest(message = 'Invalid request') { return new HttpError(400, message); }
  static unauthorized(message = 'Invalid session') { return new HttpError(401, message); }
  static forbidden(message = 'You do not have permission to perform this action') { return new HttpError(403, message); }
  static notFound(message = 'Resource not found') { return new HttpError(404, message); }
  static conflict(message = 'Conflict with the current state') { return new HttpError(409, message); }
  static badGateway(message = 'Upstream service failure') { return new HttpError(502, message); }
}

module.exports = HttpError;
