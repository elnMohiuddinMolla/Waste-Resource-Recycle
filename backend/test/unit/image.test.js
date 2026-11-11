// Unit tests: checking an uploaded waste photo (utils/image.js, PRD v1.4.0 FR-03)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePhoto } = require('../../src/utils/image');

const dataUrl = (label, bytes) => `data:image/${label};base64,${Buffer.from(bytes).toString('base64')}`;
const pad = (start) => [...start, ...new Array(16).fill(0)];

test('real JPG, PNG and WebP files are accepted and their type comes from the bytes', () => {
  assert.equal(parsePhoto(dataUrl('jpeg', pad([0xff, 0xd8, 0xff, 0xe0]))).ext, 'jpg');
  assert.equal(parsePhoto(dataUrl('png', pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).ext, 'png');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);
  assert.equal(parsePhoto(dataUrl('webp', webp)).mime, 'image/webp');
  // The label may be wrong; the bytes decide (a PNG labelled as JPEG is still a PNG)
  assert.equal(parsePhoto(dataUrl('jpeg', pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).ext, 'png');
});

test('missing, fake, other formats and too-large photos are refused', () => {
  assert.ok(parsePhoto(undefined).error);
  assert.ok(parsePhoto('').error);
  assert.ok(parsePhoto('not a data url').error);
  assert.ok(parsePhoto(dataUrl('png', Buffer.from('<html><body>not an image</body></html>'))).error);
  assert.ok(parsePhoto('data:image/gif;base64,R0lGODlhAQABAAAAACw=').error);
  assert.ok(parsePhoto('data:text/html;base64,PGh0bWw+').error);
  const big = Buffer.alloc(2 * 1024 * 1024 + 1); big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  assert.match(parsePhoto(dataUrl('jpeg', big)).error, /2 MB/);
});
