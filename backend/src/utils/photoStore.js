// ==============================================================================
// Waste Resource Recycle (WRR) - Where pickup photos are kept
// Files live in backend/uploads/pickups/ (or UPLOAD_DIR), never in frontend/, so they
// are only reachable through the logged-in API (GET /pickup-requests/:id/photo).
// The server picks a random file name; the database stores only that name.
// ==============================================================================

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'), 'pickups');
const SAFE_NAME = /^[a-f0-9]{32}\.(jpg|png|webp)$/; // only names this module created

async function save(buffer, ext) {
  await fs.mkdir(DIR, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(DIR, name), buffer, { flag: 'wx' }); // never overwrite
  return name;
}

// Full path of a stored photo; refuses anything that is not one of our names
function fullPath(name) {
  if (!SAFE_NAME.test(name || '')) throw new Error('Invalid photo name.');
  return path.join(DIR, name);
}

async function remove(name) {
  try { await fs.unlink(fullPath(name)); } catch { /* already gone */ }
}

module.exports = { save, fullPath, remove };
