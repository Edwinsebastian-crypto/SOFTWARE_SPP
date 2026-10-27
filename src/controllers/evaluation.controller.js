'use strict';

/** /api/evaluations/*: forwards to the evaluation microservice (see EvaluationGatewayService). */
class EvaluationController {
  constructor({ evaluationGatewayService }) {
    this.gateway = evaluationGatewayService;
  }

  /** Builds the handler for one role segment (`tutor`, `student` or `meta`). The wildcard is the path below it. */
  proxy = (role) => async (req, res) => {
    const { status, body } = await this.gateway.forward(req.user, {
      role,
      method: req.method,
      path: `/${req.params[0] || ''}`.replace(/\/+$/, '') || '/',
      query: req.query,
      body: req.body
    });
    if (status === 204 || body === null) return res.status(status).end();
    return res.status(status).json(body);
  };

  /** GET /api/evaluations/health */
  health = async (req, res) => {
    const { status, body } = await this.gateway.forward(req.user, { role: 'meta', method: 'GET', path: '/health' });
    res.status(status).json(body);
  };
}

module.exports = EvaluationController;
