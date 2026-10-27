'use strict';
const HttpError = require('./http-error');
const { GOOGLE_LINK_MIME } = require('../config/constants');

/** Only Google Workspace hosts are accepted as "linked evidence" (Drive, Docs, Sheets, Slides, Forms). */
const ALLOWED_HOSTS = Object.freeze({
  'drive.google.com': 'Google Drive',
  'docs.google.com': 'Google Docs',
  'sheets.google.com': 'Google Sheets',
  'slides.google.com': 'Google Slides',
  'forms.google.com': 'Google Forms'
});
const MAX_LINKS = 10;
const MAX_URL_LENGTH = 500; // evidenciaarchivo.rutaArchivo is varchar(500)

/** Friendlier label for docs.google.com depending on the path (/document, /spreadsheets, /presentation, /forms). */
function labelFor(url) {
  if (url.hostname === 'docs.google.com') {
    if (url.pathname.startsWith('/spreadsheets')) return 'Google Sheets';
    if (url.pathname.startsWith('/presentation')) return 'Google Slides';
    if (url.pathname.startsWith('/forms')) return 'Google Forms';
    if (url.pathname.startsWith('/document')) return 'Google Docs';
  }
  return ALLOWED_HOSTS[url.hostname];
}

/** @returns {{url: string, name: string, mimeType: string}} or throws HttpError 400 */
function parseGoogleLink(raw) {
  const value = raw && typeof raw === 'object' ? raw : { url: raw };
  let url;
  try { url = new URL(String(value.url || '').trim()); } catch (_) { throw HttpError.badRequest('The link is not a valid URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || !ALLOWED_HOSTS[url.hostname]) {
    throw HttpError.badRequest('Only https links to Google Drive, Docs, Sheets, Slides or Forms are allowed');
  }
  const href = url.toString();
  if (href.length > MAX_URL_LENGTH) throw HttpError.badRequest('The link is too long');
  const typed = typeof value.name === 'string' ? value.name.trim().slice(0, 150) : '';
  return { url: href, name: typed || `${labelFor(url)} link`, mimeType: GOOGLE_LINK_MIME };
}

/** Accepts an array or a JSON string (multipart bodies send strings). Empty -> []. */
function parseGoogleLinks(input) {
  if (input === undefined || input === null || input === '') return [];
  let list = input;
  if (typeof input === 'string') {
    try { list = JSON.parse(input); } catch (_) { throw HttpError.badRequest('Invalid links'); }
  }
  if (!Array.isArray(list)) throw HttpError.badRequest('Invalid links');
  if (list.length > MAX_LINKS) throw HttpError.badRequest(`At most ${MAX_LINKS} links per evidence`);
  return list.map(parseGoogleLink);
}

module.exports = { parseGoogleLink, parseGoogleLinks, MAX_LINKS };
