// Unit tests: pickup request state machine (PRD §5.1, T1–T8)
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUSES, TRANSITIONS, canTransition, assertTransition } = require('../../src/services/requestStateMachine');

test('there are exactly 7 statuses and 8 transitions', () => {
  assert.equal(STATUSES.length, 7);
  assert.equal(TRANSITIONS.length, 8);
});

test('the happy path is allowed, each step by the right role', () => {
  assert.ok(canTransition('Pending', 'Assigned', 'admin'));
  assert.ok(canTransition('Assigned', 'Accepted', 'collector'));
  assert.ok(canTransition('Accepted', 'Collected', 'collector'));
  assert.ok(canTransition('Collected', 'Completed', 'collector'));
});

test('cancel, reject, reassign and on-site abort are allowed', () => {
  assert.ok(canTransition('Pending', 'Cancelled', 'user'));
  assert.ok(canTransition('Assigned', 'Rejected', 'collector'));
  assert.ok(canTransition('Rejected', 'Assigned', 'admin'));
  assert.ok(canTransition('Accepted', 'Cancelled', 'collector'));
});

test('skipping steps is refused', () => {
  assert.equal(canTransition('Pending', 'Collected', 'collector'), false);
  assert.equal(canTransition('Pending', 'Completed', 'collector'), false);
  assert.equal(canTransition('Assigned', 'Collected', 'collector'), false);
});

test('final states cannot change', () => {
  for (const to of STATUSES) {
    for (const role of ['user', 'collector', 'admin']) {
      assert.equal(canTransition('Completed', to, role), false);
      assert.equal(canTransition('Cancelled', to, role), false);
    }
  }
});

test('the wrong role is refused', () => {
  assert.equal(canTransition('Pending', 'Assigned', 'user'), false);
  assert.equal(canTransition('Assigned', 'Cancelled', 'user'), false); // user can cancel only while Pending
  assert.equal(canTransition('Pending', 'Cancelled', 'admin'), false);
  assert.equal(canTransition('Assigned', 'Accepted', 'admin'), false);
});

test('assertTransition throws HTTP 409 for an invalid change', () => {
  assert.throws(
    () => assertTransition('Completed', 'Cancelled', 'user'),
    (err) => err.statusCode === 409 && /Completed.*Cancelled/.test(err.message)
  );
  assert.doesNotThrow(() => assertTransition('Pending', 'Cancelled', 'user'));
});
