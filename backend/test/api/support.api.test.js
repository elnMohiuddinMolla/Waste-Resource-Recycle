// API tests: help and support tickets (PRD v1.5.0, FR-22, api-spec.md Module 9)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer } = require('./helpers');

let api;
let tanvir;    // user 4: owns requests #1, #2 and redemption #1
let sadia;     // user 5: owns request #3
let rafiqul;   // collector 2: assigned to request #2
let admin;

const ticket = (extra = {}) => ({
  category: 'Pickup',
  subject: 'Collector did not come',
  message: 'Nobody came at the time I chose. Please check.',
  ...extra
});

before(async () => {
  await resetDatabase();
  api = startServer();
  tanvir = await api.login('tanvir@gmail.com');
  sadia = await api.login('sadia@gmail.com');
  rafiqul = await api.login('collector1@wrr.com');
  admin = await api.login('admin@wrr.com');
});
after(async () => api && api.close());

const open = (cookie, body) => api.call('POST', '/support-tickets', { cookie, body });

test('opening a ticket validates every field', async () => {
  const r = await open(tanvir, { category: 'Weather', subject: 'Hi', message: 'short', request_id: 'x' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.errors.map((e) => e.field).sort(), ['category', 'message', 'request_id', 'subject']);
});

test('users and collectors open tickets, linking only what they can see', async () => {
  let r = await open(tanvir, ticket({ request_id: 1, redemption_id: 1 }));
  assert.equal(r.status, 201);
  assert.equal(r.body.data.status, 'Open');
  assert.equal(r.body.data.request_id, 1);

  r = await open(rafiqul, ticket({ category: 'Other', subject: 'Address unclear', request_id: 2 })); // his assigned job
  assert.equal(r.status, 201);

  r = await open(tanvir, ticket({ request_id: 3 }));       // Sadia's request
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'request_id');
  r = await open(tanvir, ticket({ redemption_id: 999 }));   // not his (does not exist)
  assert.equal(r.body.errors[0].field, 'redemption_id');
  r = await open(rafiqul, ticket({ redemption_id: 1 }));    // Tanvir's redemption
  assert.equal(r.body.errors[0].field, 'redemption_id');
  r = await open(rafiqul, ticket({ request_id: 3 }));       // not assigned to him
  assert.equal(r.body.errors[0].field, 'request_id');
});

test('admins cannot open tickets; not logged in is 401', async () => {
  assert.equal((await open(admin, ticket())).status, 403);
  assert.equal((await open(undefined, ticket())).status, 401);
});

test('everyone sees only their own tickets', async () => {
  const mine = await api.call('GET', '/support-tickets/mine', { cookie: tanvir });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.total, 1);
  const none = await api.call('GET', '/support-tickets/mine', { cookie: sadia });
  assert.equal(none.body.data.total, 0);
  assert.equal((await api.call('GET', '/support-tickets/mine', { cookie: admin })).status, 403);
});

test('admin lists tickets by status; only admins may', async () => {
  let r = await api.call('GET', '/admin/support-tickets?status=Open', { cookie: admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, 2);
  assert.ok(r.body.data.tickets.every((t) => t.status === 'Open' && t.user_name));
  r = await api.call('GET', '/admin/support-tickets?status=Lost', { cookie: admin });
  assert.equal(r.status, 400);
  assert.equal((await api.call('GET', '/admin/support-tickets', { cookie: tanvir })).status, 403);
});

test('the admin answers: Answered, and the owner gets a SUPPORT_ANSWERED notification', async () => {
  const id = (await api.call('GET', '/support-tickets/mine', { cookie: tanvir })).body.data.tickets[0].ticket_id;

  let r = await api.call('PUT', `/admin/support-tickets/${id}/reply`, { cookie: admin, body: { reply: '' } });
  assert.equal(r.status, 400);
  r = await api.call('PUT', '/admin/support-tickets/999/reply', { cookie: admin, body: { reply: 'Hello' } });
  assert.equal(r.status, 404);

  r = await api.call('PUT', `/admin/support-tickets/${id}/reply`, { cookie: admin, body: { reply: 'Sorry! Rafiqul will come tomorrow at 10 am.' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'Answered');
  assert.equal(r.body.data.admin_reply, 'Sorry! Rafiqul will come tomorrow at 10 am.');

  const notes = (await api.call('GET', '/notifications', { cookie: tanvir })).body.data.notifications;
  assert.ok(notes.some((n) => n.type === 'SUPPORT_ANSWERED' && n.message.includes(`#${id}`)));
});

test('closing: only the owner or an admin, and only once', async () => {
  const id = (await api.call('GET', '/support-tickets/mine', { cookie: tanvir })).body.data.tickets[0].ticket_id;
  assert.equal((await api.call('PATCH', `/support-tickets/${id}/close`, { cookie: sadia })).status, 404);

  let r = await api.call('PATCH', `/support-tickets/${id}/close`, { cookie: tanvir });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'Closed');
  assert.ok(r.body.data.closed_at);
  assert.equal((await api.call('PATCH', `/support-tickets/${id}/close`, { cookie: tanvir })).status, 409);
  r = await api.call('PUT', `/admin/support-tickets/${id}/reply`, { cookie: admin, body: { reply: 'One more thing' } });
  assert.equal(r.status, 409);

  const rafiqulTicket = (await api.call('GET', '/support-tickets/mine', { cookie: rafiqul })).body.data.tickets[0].ticket_id;
  r = await api.call('PATCH', `/support-tickets/${rafiqulTicket}/close`, { cookie: admin });
  assert.equal(r.status, 200);
});

test('at most 5 open tickets per person', async () => {
  for (let i = 1; i <= 5; i++) assert.equal((await open(sadia, ticket({ subject: `Question number ${i}` }))).status, 201);
  const sixth = await open(sadia, ticket({ subject: 'Question number 6' }));
  assert.equal(sixth.status, 422);

  const first = (await api.call('GET', '/support-tickets/mine', { cookie: sadia })).body.data.tickets.at(-1).ticket_id;
  await api.call('PATCH', `/support-tickets/${first}/close`, { cookie: sadia });
  assert.equal((await open(sadia, ticket({ subject: 'Question number 6' }))).status, 201);
});
