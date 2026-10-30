'use strict';
const express = require('express');
const asyncHandler = require('../utils/async-handler');
const env = require('../config/env');
const HttpError = require('../utils/http-error');

function requireInternalSecret(req, _res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || token !== env.evaluationServiceSecret) {
    throw HttpError.unauthorized('Invalid or missing internal service secret');
  }
  next();
}

function createInternalRoutes({ internalController }) {
  const router = express.Router();
  router.use(requireInternalSecret);

  router.get('/practicas/:practiceId/evidencias', asyncHandler(internalController.listEvidences));
  router.get('/evidencias/:evidenceId', asyncHandler(internalController.getEvidence));
  router.get('/actividades/:activityId', asyncHandler(internalController.getActivity));
  router.get('/evidencias/archivos/:fileId', asyncHandler(internalController.downloadEvidenceFile));
  router.get('/actividades/archivos/:fileId', asyncHandler(internalController.downloadActivityFile));
  router.get('/verificar', asyncHandler(internalController.verifyBelongs));

  return router;
}

module.exports = createInternalRoutes;

