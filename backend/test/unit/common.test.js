// Unit tests: controller input helpers (controllers/common.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { isRealDate, parseDateRange, parseReason } = require('../../src/controllers/common');

test('isRealDate accepts real dates only', () => {
  assert.ok(isRealDate('2026-11-10'));
  assert.ok(isRealDate('2028-02-29'));          // leap year
  assert.equal(isRealDate('2026-02-29'), false); // not a leap year
  assert.equal(isRealDate('2026-02-31'), false); // Date.parse would turn this into 3 March
  assert.equal(isRealDate('2026-13-01'), false);
  assert.equal(isRealDate('10-11-2026'), false);
});

test('parseDateRange checks both dates and their order', () => {
  assert.deepEqual(parseDateRange({}), { from: null, to: null });
  assert.deepEqual(parseDateRange({ from: '2026-11-01', to: '2026-11-30' }), { from: '2026-11-01', to: '2026-11-30' });
  assert.throws(() => parseDateRange({ from: '2026-02-31' }), (e) => e.statusCode === 400 && e.errors[0].field === 'from');
  assert.throws(() => parseDateRange({ from: '2026-11-30', to: '2026-11-01' }), (e) => e.statusCode === 400 && e.errors[0].field === 'to');
});

test('parseReason needs 5 to 200 characters', () => {
  assert.equal(parseReason({ reason: '  Vehicle broke down  ' }), 'Vehicle broke down');
  assert.throws(() => parseReason({ reason: 'no' }), (e) => e.statusCode === 400);
  assert.throws(() => parseReason({ reason: 'x'.repeat(201) }), (e) => e.statusCode === 400);
  assert.throws(() => parseReason(undefined), (e) => e.statusCode === 400);
});
