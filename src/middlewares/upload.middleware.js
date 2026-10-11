'use strict';
const multer = require('multer');
const HttpError = require('../utils/http-error');
const { UPLOAD } = require('../config/constants');

const allowedMimeTypes = new Set(UPLOAD.ALLOWED_MIME_TYPES);

function fileFilter(_req, file, cb) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(HttpError.badRequest('File type not allowed (PDF, images, Word, Excel, PowerPoint or text)'));
  }
  cb(null, true);
}

/** In-memory upload of a single `file` field, limited in size and MIME type. */
const uploadSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD.MAX_BYTES, files: 1 },
  fileFilter
}).single('file');

const uploadMultipleFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD.MAX_BYTES, files: 10 },
  fileFilter
}).array('files', 10);

module.exports = { uploadSingleFile, uploadMultipleFiles };
