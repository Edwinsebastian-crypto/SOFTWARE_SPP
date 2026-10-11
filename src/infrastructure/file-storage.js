'use strict';
const cloudinary = require('./cloudinary');

const UPLOAD_URL_PATTERN = /\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/;

/** File storage backed by Cloudinary. The rest of the app never touches the Cloudinary SDK directly. */
class FileStorage {
  /** Uploads an in-memory buffer. Resolves to Cloudinary's result (`secure_url`, `public_id`, `resource_type`). */
  upload(buffer, { folder }) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'auto' },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      stream.end(buffer);
    });
  }

  destroy(publicId, resourceType) {
    return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }

  /**
   * The database does not store Cloudinary's public_id, so it is derived from the stored URL.
   * @returns {{resourceType: string, publicId: string}|null}
   */
  parseUrl(url) {
    const match = UPLOAD_URL_PATTERN.exec(url || '');
    if (!match) return null;
    const resourceType = match[1];
    const path = decodeURIComponent(match[2]);
    return { resourceType, publicId: resourceType === 'raw' ? path : path.replace(/\.[^./]+$/, '') };
  }
}

module.exports = new FileStorage();
