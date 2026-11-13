// Unit tests: shared input validators
const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../../src/utils/validators');

test('Bangladeshi mobile numbers', () => {
  assert.ok(v.isValidPhone('01711000000'));
  assert.ok(v.isValidPhone('+8801911000000'));
  assert.equal(v.isValidPhone('01211000000'), false); // 012 is not a mobile prefix
  assert.equal(v.isValidPhone('0171100000'), false);  // 10 digits
  assert.equal(v.isValidPhone(1711000000), false);
});

test('emails', () => {
  assert.ok(v.isValidEmail('user@example.com'));
  assert.equal(v.isValidEmail('user@'), false);
  assert.equal(v.isValidEmail('a b@example.com'), false);
});

test('positive integers', () => {
  assert.equal(v.toPositiveInt('5'), 5);
  assert.equal(v.toPositiveInt(0), null);
  assert.equal(v.toPositiveInt('1.5'), null);
  assert.equal(v.toPositiveInt('abc'), null);
  assert.equal(v.toPositiveInt(7), 7);
  // only plain digits, no hex / exponent / booleans / arrays
  assert.equal(v.toPositiveInt('0x10'), null);
  assert.equal(v.toPositiveInt('1e3'), null);
  assert.equal(v.toPositiveInt(true), null);
  assert.equal(v.toPositiveInt([5]), null);
  // at most the MySQL INT maximum (a huge ?page= used to break LIMIT/OFFSET)
  assert.equal(v.toPositiveInt('2147483647'), 2147483647);
  assert.equal(v.toPositiveInt('2147483648'), null);
  assert.equal(v.toPositiveInt('1e20'), null);
});

test('positive amounts are rounded to 2 decimals', () => {
  assert.equal(v.toPositiveAmount(15), 15);
  assert.equal(v.toPositiveAmount('2.345'), 2.35);
  assert.equal(v.toPositiveAmount(0), null);
  assert.equal(v.toPositiveAmount(-1), null);
  assert.equal(v.toPositiveAmount(''), null);
  assert.equal(v.toPositiveAmount(100000000), null); // too big for DECIMAL(10,2)
});

test('non-negative amounts allow 0 (a category rate may be 0)', () => {
  assert.equal(v.toNonNegativeAmount(0), 0);
  assert.equal(v.toNonNegativeAmount('0'), 0);
  assert.equal(v.toNonNegativeAmount('12.345'), 12.35);
  assert.equal(v.toNonNegativeAmount(-0.01), null);
  assert.equal(v.toNonNegativeAmount('abc'), null);
});

test('booleans must be real JSON booleans', () => {
  assert.equal(v.toBoolean(true), true);
  assert.equal(v.toBoolean(false), false);
  assert.equal(v.toBoolean('true'), null);
  assert.equal(v.toBoolean(1), null);
});

test('date-times are read as Bangladesh time', () => {
  const p = v.parseBdDateTime('2026-11-15T10:00');
  assert.equal(p.sql, '2026-11-15 10:00:00');
  assert.equal(p.date.toISOString(), '2026-11-15T04:00:00.000Z'); // 10:00 BST = 04:00 UTC
  assert.equal(v.parseBdDateTime('2026-11-15 10:00:30').sql, '2026-11-15 10:00:30');
});

test('invalid date-times are refused', () => {
  assert.equal(v.parseBdDateTime('2026-02-31T10:00'), null);
  assert.equal(v.parseBdDateTime('15/11/2026 10:00'), null);
  assert.equal(v.parseBdDateTime('2026-11-15T10:00:00Z'), null);
  assert.equal(v.parseBdDateTime(null), null);
});
