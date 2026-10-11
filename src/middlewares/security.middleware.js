'use strict';
const helmet = require('helmet');
const env = require('../config/env');

/** HTTP security headers, including a Content-Security-Policy tuned to the assets the views load. */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'"], // no inline scripts and no inline event handlers (onclick="...") are used
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
        'img-src': ["'self'", 'data:', 'https://res.cloudinary.com'],
        'frame-src': ["'self'", 'https://res.cloudinary.com'],
        'connect-src': ["'self'"],
        'upgrade-insecure-requests': env.isProduction ? [] : null
      }
    }
  });
}

module.exports = { securityHeaders };
