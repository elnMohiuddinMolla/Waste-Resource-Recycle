// ==============================================================================
// Waste Resource Recycle (WRR) - Shared Input Validators
// Rules from api-spec.md and requirement-validation.md §5.
// ==============================================================================

const BD_PHONE_REGEX = /^(?:\+8801|01)[3-9]\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATETIME_REGEX = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/;

// Largest value a DECIMAL(10,2) column can hold
const MAX_DECIMAL_10_2 = 99999999.99;

function isValidPhone(value) {
  return typeof value === 'string' && BD_PHONE_REGEX.test(value.trim());
}

function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim()) && value.trim().length <= 100;
}

// Largest value of a MySQL INT column (all our ids)
const MAX_INT = 2147483647;

// Returns a positive integer (1 .. MAX_INT), or null if the value is not one.
// Only plain digits count: "0x10", "1e3" or true are not ids. The upper limit also
// keeps ?page= small enough for LIMIT/OFFSET (a huge page once gave "1e+21" in the SQL).
function toPositiveInt(value) {
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= MAX_INT ? n : null;
}

// Returns a number > 0 rounded to 2 decimals, or null
function toPositiveAmount(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > MAX_DECIMAL_10_2) return null;
  return Math.round(n * 100) / 100;
}

// Returns a number >= 0 rounded to 2 decimals, or null (e.g. a category rate may be 0)
function toNonNegativeAmount(value) {
  if (value === 0 || value === '0') return 0;
  return toPositiveAmount(value);
}

// true / false only (JSON booleans); anything else returns null
function toBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

// Trimmed string, or '' when the value is not a string
function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parses a date-time typed by the user, e.g. "2026-11-15T10:00" or "2026-11-15 10:00:00".
 * The value is read as Bangladesh time (+06:00), like everything else in WRR.
 * Returns { sql: 'YYYY-MM-DD HH:mm:ss', date: Date } or null if invalid.
 */
function parseBdDateTime(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(DATETIME_REGEX);
  if (!m) return null;

  const sql = `${m[1]} ${m[2]}${m[3] || ':00'}`;
  const date = new Date(`${m[1]}T${m[2]}${m[3] || ':00'}+06:00`);
  if (Number.isNaN(date.getTime())) return null;

  // Reject impossible dates such as 2026-02-31 (JS would roll them over)
  const check = new Date(date.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  if (check !== sql) return null;

  return { sql, date };
}

module.exports = {
  BD_PHONE_REGEX,
  isValidPhone,
  isValidEmail,
  toPositiveInt,
  toPositiveAmount,
  toNonNegativeAmount,
  toBoolean,
  cleanText,
  parseBdDateTime
};
