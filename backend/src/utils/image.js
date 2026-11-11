// ==============================================================================
// Waste Resource Recycle (WRR) - Checking an uploaded photo
// The browser sends the photo as a data URL ("data:image/jpeg;base64,...").
// We trust the file's first bytes ("magic numbers"), not the name or the label,
// so a renamed .exe or HTML file is refused.
// ==============================================================================

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB after decoding

const TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
];

/**
 * Returns { buffer, ext, mime } for a valid photo, or { error } with a message for the user.
 */
function parsePhoto(value) {
  if (typeof value !== 'string' || value.length === 0) return { error: 'Add a photo of the waste.' };
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(value);
  if (!match) return { error: 'The photo must be a JPG, PNG or WebP image.' };

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_PHOTO_BYTES) return { error: 'The photo must be at most 2 MB.' };
  const type = buffer.length >= 12 ? TYPES.find((t) => t.test(buffer)) : null;
  if (!type) return { error: 'The photo must be a JPG, PNG or WebP image.' };
  return { buffer, ext: type.ext, mime: type.mime };
}

const MIME_BY_EXT = Object.fromEntries(TYPES.map((t) => [t.ext, t.mime]));

module.exports = { parsePhoto, MAX_PHOTO_BYTES, MIME_BY_EXT };
