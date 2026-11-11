# prompt.md — Build WRR Step by Step (Backend First)

These prompts build the **whole** Waste Resource Recycle project, one feature per step, in a safe order.
Paste one prompt into your AI agent (Claude Code, Codex, Cursor, ...), let it finish, check it, then move on.

The prompts work in two situations:
- **Starting from an empty folder:** run every step from A1.
- **Continuing this repository:** steps marked `[x]` are already built. Running one again makes the agent *verify* it against the docs and fix only gaps.

---

## 0. How to use

1. Start **MySQL** in the XAMPP Control Panel (API tests need it).
2. Pick the first unticked step in the tracker below and paste its prompt.
3. When the agent says it is done, run in `backend/`:
   - `npm test` (unit tests, no database)
   - `npm run test:api` (API tests on the separate `wrr_test` database)
4. Check the step's **Done when** list yourself. If something is wrong, tell the agent in the same chat.
5. Tick the box (the agent should already have done this) and continue.

**One step per chat** works best. If the agent asks a question, answer it — the prompts tell it to ask instead of guessing.

---

## 1. Progress tracker

**Phase A — Foundation**
- [x] A1 — Project skeleton, configuration, error handling, test harness
- [x] A2 — Database schema + seed data
- [x] A3 — Shared core (validators, transactions, state machines, notifications)

**Phase B — Backend features** (one API area per step)
- [x] B1 — Auth: register, login, logout, me, rate limit
- [x] B2 — Public catalog: categories, zones
- [x] B3 — Pickup request: submit
- [x] B4 — Pickup request: my list + details with timeline
- [x] B5 — Pickup request: cancel
- [x] B6 — Admin: request queue + assign / reassign collector
- [x] B7 — Collector: job list, accept, reject, abort
- [x] B8 — Collector: record weight (rate snapshot)
- [x] B9 — Collector: complete + EARN points
- [x] B10 — Collector: history
- [x] B11 — Rewards: balance + ledger history
- [x] B12 — Redemption: active rule, submit, my redemptions
- [x] B13 — Admin: redemption queue + approve / paid / reject
- [x] B14 — Notifications: list, mark one, mark all
- [x] B15 — Admin: waste categories
- [x] B16 — Admin: zones
- [x] B17 — Admin: redemption rules
- [x] B18 — Admin: users + collector accounts
- [x] B19 — Admin: collection records + weight correction (ADJUST)
- [ ] B20 — Admin: 5 reports
- [ ] B21 — Backend audit (every endpoint vs api-spec, security, performance)

**Phase C — Frontend** (plain HTML/CSS/JS, served by Express)
- [ ] C1 — Shared frontend core (styles, api.js, auth guard, layout, UI helpers)
- [ ] C2 — Public pages: landing, login, register
- [ ] C3 — User: dashboard + notifications page
- [ ] C4 — User: new pickup request
- [ ] C5 — User: my requests, details timeline, cancel
- [ ] C6 — User: points history + cash redemption
- [ ] C7 — Collector: dashboard + job actions (accept / reject / abort)
- [ ] C8 — Collector: record weight, complete, history
- [ ] C9 — Admin: dashboard KPIs
- [ ] C10 — Admin: request queue + assignment
- [ ] C11 — Admin: redemptions
- [ ] C12 — Admin: users, collectors, zones, categories, rules
- [ ] C13 — Admin: collection records + weight correction
- [ ] C14 — Admin: reports (print + CSV export)

**Phase D — Testing & lab report**
- [ ] D1 — End-to-end walkthrough + NFR checks
- [ ] D2 — Test-case table for the lab report
- [ ] D3 — Documentation sync + viva preparation

---

## 2. Common rules (every prompt says "follow the Common Rules")

The agent must follow all of these in every step:

1. **Read first:** `AGENTS.md`, then the documents named in the step. Sources of truth:
   - `WRR_PRD.md` → requirements and business rules (FR-01–FR-21, NFR-01–NFR-08, §5 rules).
   - `api-spec.md` → exact paths, bodies, responses, validation, status codes.
   - `database.md` → tables, constraints, report SQL (§6), transactions (§7), seed data. `database/schema.sql` and `database/seed.sql` must stay identical to it.
   - `architecture.md` → layers, folders, frontend rules.
   - `dfd.md`, `requirement-validation.md` → flows, edge cases, "future work" (do **not** build future work).
2. **Stack is fixed:** Node.js + Express backend, plain HTML/CSS/JS frontend (no React/Next/Vue, no build step), MySQL/MariaDB (XAMPP). Do not add new npm packages without asking.
3. **Layers:** `routes → controllers → services → models`. Controllers check input shape; services hold business rules and transactions; models hold SQL only.
4. **Reuse, never duplicate:** `utils/AppError`, `utils/transaction.withTransaction`, `utils/validators`, `utils/money`, `controllers/common.js`, `services/requestStateMachine`, `services/redemptionStateMachine`, `services/notification.service` (`NOTIFICATION_TYPES`), `models/statusLog.model`.
5. **Database rules:** parameterized SQL only (`?`). Every multi-table change runs in one `withTransaction`. Lock rows with `SELECT ... FOR UPDATE` before checking-then-changing. Point/money maths in SQL with `ROUND(..., 2)`; compare DECIMAL strings with `utils/money.toCents`.
6. **Status codes:** 400 validation (with `errors: [{field, message}]`) · 401 not logged in · 403 wrong role / inactive · 404 not found or not yours · 409 invalid state change or duplicate · 422 business rule (balance, min_points, negative correction) · 429 rate limit · 500.
7. **Security:** JWT only in the `HttpOnly` cookie; never return `password_hash` or the token; check ownership on every request; frontend inserts user text with `textContent` only.
8. **Tests:** add or extend API tests in `backend/test/api/<area>.api.test.js` (they rebuild the separate `wrr_test` database — never point them at `wrr_db`). Pure logic gets unit tests in `backend/test/unit/`. All old tests must still pass.
9. **When the docs are silent or disagree:** stop and ask me. Do not invent features. If the step itself defines a missing detail, also add it to `api-spec.md` so the spec stays complete.
10. **Finish every step by:** running `npm test` and `npm run test:api`, updating "Current code status" in `AGENTS.md`, ticking the step in this file, and giving me a short summary (what was built, test results, anything I must do).
11. Keep code simple and commented where the reason is not obvious — it must be explained in a viva.

---

## Phase A — Foundation

### A1 — Project skeleton  `[x]`

```
Follow the Common Rules in prompt.md. Read AGENTS.md, architecture.md §2, §7, §9 and api-spec.md §1.

Goal: an Express server that runs, with configuration, error handling and a test harness.
If backend/ already exists, verify every item below and fix only what is missing.

Build in backend/:
- package.json with dependencies express, mysql2, bcryptjs, jsonwebtoken, cookie-parser,
  dotenv, express-rate-limit; dev dependency nodemon. Scripts:
  start, dev, test = node --test "test/unit/*.test.js",
  test:api = node --test --test-concurrency=1 "test/api/*.test.js".
- .env.example (PORT=5000, DB_HOST, DB_PORT, DB_USER=root, DB_PASSWORD empty, DB_NAME=wrr_db,
  JWT_SECRET, NODE_ENV) with comments. Never create a real .env with secrets.
- src/config/db.js: mysql2/promise pool, dateStrings, and SET time_zone = '+06:00' on every new connection.
- src/utils/AppError.js (statusCode, message, errors).
- src/middleware/error.js: JSON 404 + error handler (bad JSON → 400; 500 hides internals).
- src/app.js: express.json, cookie-parser, routers under /api/v1, JSON 404 for unknown /api paths,
  express.static for ../frontend, exits with a clear message if JWT_SECRET is missing,
  exports app and only listens when run directly.
- test/api/helpers.js: rebuilds TEST_DB_NAME (default wrr_test, refuses wrr_db) from
  database/schema.sql + seed.sql, starts the app on a random port, call() and login() helpers.

Done when: npm run dev starts and prints the URL; GET /api/v1/anything returns JSON 404.
```

### A2 — Database  `[x]`

```
Follow the Common Rules in prompt.md. Read database.md completely and WRR_PRD.md §9.

Goal: database/schema.sql and database/seed.sql that are identical to database.md §8 and §9.
If they exist, compare them line by line with database.md and report any difference before changing.

Check in particular: 10 tables; utf8mb4; CHECK constraints; estimated_weight_kg NOT NULL;
request_status_logs FK ON DELETE RESTRICT; generated columns + UNIQUE uq_rt_one_earn and
uq_rule_single_active; record_id FK ON UPDATE RESTRICT; seed users (password123), 4 zones,
6 categories, rule 0.50 BDT/point min 100, requests 1–3 with full status logs, Tanvir balance 55.00.

Load both files into the wrr_test database (never wrr_db unless I ask) and run the 5 report
queries of database.md §6 once to prove they work.

Done when: both scripts run without errors on XAMPP MariaDB 10.4 and the balance check returns 55.00.
```

### A3 — Shared core  `[x]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §5 and FR-14, api-spec.md §1.

Goal: the shared building blocks every feature reuses. Verify or create:
- src/utils/validators.js: BD phone ^(?:\+8801|01)[3-9]\d{8}$, email, positive int,
  positive DECIMAL(10,2) amount, cleanText, parseBdDateTime (input read as +06:00, rejects
  impossible dates).
- src/utils/transaction.js: withTransaction(work) with commit / rollback / release.
- src/utils/money.js: toCents, centsToString.
- src/controllers/common.js: parseRequestId (bad id → 404), parsePaging (limit ≤ 50),
  parseStatusList, isRealDate / parseDate / parseDateRange (real YYYY-MM-DD dates, to ≥ from),
  parseOptionalId, parseReason (5–200 chars).
- src/services/requestStateMachine.js: the 7 statuses and exactly the 8 transitions T1–T8 of
  PRD §5.1 with their roles; assertTransition throws 409.
- src/services/redemptionStateMachine.js: approve Pending→Approved, paid Approved→Paid,
  reject Pending|Approved→Rejected; anything else 409; PAYOUT_METHODS bKash, Nagad, Bank.
- src/services/notification.service.js: NOTIFICATION_TYPES (the 11 of FR-14) and
  createNotification({connection, userId, requestId, redemptionId, type, message}) that refuses
  unknown types.
- src/models/statusLog.model.js: insert(connection, ...) and listForRequest.
- Unit tests for the state machines and validators.

Done when: npm test passes and every transition in PRD §5.1 has a unit test.
```

---

## Phase B — Backend features

### B1 — Auth  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md Module 1, WRR_PRD.md FR-01, FR-02, NFR-03.

Build: POST /api/v1/auth/register, POST /api/v1/auth/login, POST /api/v1/auth/logout
(no login needed, always clears the cookie), GET /api/v1/auth/me, plus middleware/auth.js (JWT from the "token" cookie, re-reads the user
every request, inactive → 403), middleware/role.js requireRole(...roles),
middleware/rateLimiter.js (5 failed logins / 15 min / IP, then 429; successful logins not counted).

Rules: register always creates role "user"; email lowercased and unique (409); password ≥ 8;
zone must be active; bcryptjs cost 10. Login sets token=<JWT>; HttpOnly; SameSite=Lax; Path=/;
Max-Age=604800 (Secure in production) and returns only the user object. Same 401 message for
unknown email and wrong password.

Tests (auth.api.test.js): validation errors per field, duplicate email 409, register 201 without
hash, cookie flags, /me with and without cookie, inactive login 403, deactivated mid-session 403,
logout clears the cookie even without a session, 6th failed login → 429.

Done when: all auth tests pass.
```

### B2 — Public catalog  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md Module 2, WRR_PRD.md FR-04.

Build: GET /api/v1/categories (active only: category_id, name, points_per_kg, is_other as boolean)
and GET /api/v1/zones (active only: zone_id, name, description). Both public.

Tests: 6 seed categories with "Other Recyclable Waste" is_other true; 4 zones; an inactive
category or zone is not listed.
```

### B3 — Pickup request: submit  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §3.1, WRR_PRD.md FR-03, §5.1, FR-14.

Build: POST /api/v1/pickup-requests (role user).
Validation (400 with field errors): category_id active; zone_id active; pickup_address 1–255;
contact_phone BD mobile; estimated_weight_kg > 0; preferred_at strictly in the future (Bangladesh
time); other_description ≥ 5 chars when the category is_other.
One transaction: insert Pending request, status log (null → Pending, "User submitted request"),
PICKUP_SUBMITTED notification to the user. Response 201 {request_id, status, created_at}.

Tests: success writes request + log + notification; each validation rule; past date; Other
without description; inactive category/zone; collector 403; no cookie 401.
```

### B4 — Pickup request: list + details  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §3.2, §3.3, WRR_PRD.md FR-05.

Build:
- GET /api/v1/pickup-requests/mine?status=&from=&to=&category_id=&page=&limit= (user, FR-12):
  own requests newest first with category, zone, collector name, actual weight;
  {total, page, limit, requests}. from/to are whole days on created_at.
- GET /api/v1/pickup-requests/:id (user owner, assigned collector, admin): details, collector
  {id, name, phone} or null, points_earned, timeline from request_status_logs with changed_by name.
  Anyone else gets 404 (not 403).

Tests: only own rows; paging; status, date and category filters; bad status or 2026-02-31 → 400; seed request 1 shows 155.00 points
and 5 timeline rows; other user 404; unassigned collector 404; admin 200; bad id 404.
```

### B5 — Pickup request: cancel  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §3.4, WRR_PRD.md FR-06 (transition T3).

Build: PUT /api/v1/pickup-requests/:id/cancel (owner only). Lock the row; not owner → 404;
status not Pending → 409 "Cannot cancel request. Only Pending requests can be cancelled
(current status: X)."; else set Cancelled + status log "Cancelled by user" in one transaction.

Tests: cancel Pending works and is logged; second cancel 409; Accepted request 409; someone
else's request 404 and unchanged.
```

### B6 — Admin: request queue + assignment  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §8.1, §8.2, WRR_PRD.md FR-07, §5.1 (T1, T2).

Build (role admin):
- GET /api/v1/admin/pickup-requests?status=&zone_id=&page=&limit= (default limit 20), ordered by
  preferred_at: user name/phone, category, zone, weight, status, collector id/name.
- PUT /api/v1/admin/pickup-requests/:id/assign {collector_id}: lock request; 404 if missing;
  assertTransition(status → Assigned, admin) so only Pending or Rejected pass (else 409);
  collector must be active with role collector (else 400 field collector_id); set collector_id
  + Assigned, log "Assigned to X" or "Reassigned to X", PICKUP_ASSIGNED notification to the
  collector — one transaction.

Tests: queue filters; non-admin 403; assign Pending; reassign Rejected; Accepted/Completed 409;
assign to a user or inactive collector 400; unknown request 404.
```

### B7 — Collector: jobs, accept, reject, abort  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §4.1–§4.4, WRR_PRD.md FR-08 (T4, T5, T7).

Build (role collector; a job not assigned to this collector → 404):
- GET /api/v1/collector/requests?status=Assigned,Accepted&zone_id= (default Assigned, Accepted,
  Collected): user name, contact phone, address, zone, category, description, weight, time.
- PUT .../requests/:id/accept: T4, log, PICKUP_ACCEPTED to user.
- PUT .../requests/:id/reject {reason 5–200}: T5, set collector_id NULL, log with the reason,
  PICKUP_REJECTED to user.
- PUT .../requests/:id/abort {reason 5–200}: T7 (Accepted only), log, PICKUP_ABORTED to user.
Lock the request row in each action; every action is one transaction.

Tests: accept; reject clears collector and appears in admin Rejected queue; old collector 404
afterwards; abort from Assigned 409; another collector 404; short reason 400.
```

### B8 — Collector: record weight  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §4.5, WRR_PRD.md FR-09, §5.2 (T6).

Build: POST /api/v1/collector/collection-records {request_id, actual_weight_kg > 0, remarks ≤ 1000}.
One transaction: lock request (own job, Accepted); insert collection_records copying the
category's current points_per_kg into points_per_kg_applied and collected_at = NOW(); status
Collected; log "Weighed X kg on scale"; PICKUP_COLLECTED to user.
Response 201 {record_id, request_id, actual_weight_kg, points_per_kg_applied,
calculated_points = ROUND(weight × rate, 2) computed in SQL, status}.

Tests: 18.75 kg paper → 6.00 rate, 112.50 points; Assigned request 409; weight 0 400;
missing request_id 400; other collector 404.
```

### B9 — Collector: complete + EARN  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §4.6, WRR_PRD.md FR-10, FR-11, §5.3 (T8),
database.md §7 Transaction 1.

Build: PUT /api/v1/collector/requests/:id/complete. One transaction: lock request (own job,
Collected); status Completed; collection_records.completed_at = NOW(); ONE EARN row with
points = ROUND(actual_weight_kg × points_per_kg_applied, 2) computed in SQL; log; PICKUP_COMPLETED
notification with the points. Response {request_id, status, points_credited}.

Tests: full path Pending → Completed credits the right points; a rate change after weighing does
not change the reward; second complete 409 and still one EARN row; two complete calls at the
same moment credit once; 1.33 kg × 4.00 = 5.32.
```

### B10 — Collector: history  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §4.7, WRR_PRD.md FR-12.

Build: GET /api/v1/collector/history?from=&to=&category_id=&page=&limit= (FR-12; dates YYYY-MM-DD,
inclusive, on completed_at): {summary: {total_completed_pickups, total_kg_collected}, records, page, limit}.
Only completed records of this collector.

Tests: summary totals; date and category filters; bad or impossible date 400; another collector sees 0.
```

### B11 — Rewards  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md Module 5, WRR_PRD.md §5.3.

Build (role user):
- GET /api/v1/rewards/balance → {user_id, available_balance = SUM(points),
  currency_equivalent_bdt at the active rule or null}.
- GET /api/v1/rewards/history?page=&limit= (default 15): newest first with a readable reference
  (formats in api-spec §5.2).

Tests: Tanvir 55.00 / 27.50 BDT; history REDEEM then EARN with correct references; collector 403.
```

### B12 — Redemption: rule, submit, mine  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §6.1–§6.3, WRR_PRD.md FR-15, §5.4,
database.md §7 Transaction 2.

Build:
- GET /api/v1/redemptions/rules/active (user, admin): 404 if none.
- POST /api/v1/redemptions {points_redeemed, payout_method, payout_account} (user).
  Validation 400: points > 0; method bKash|Nagad|Bank; account = BD mobile for bKash/Nagad,
  6–30 digits/dashes for Bank.
  One transaction: SELECT user FOR UPDATE; read active rule (none → 422); balance;
  points < min_points → 422; points > balance → 422 "Insufficient points balance. Available: X,
  Requested: Y."; insert Pending redemption with rule_id and cash_amount = ROUND(points × rate, 2)
  in SQL; REDEEM row −points; REDEMPTION_REQUESTED notification. 201 response per spec.
- GET /api/v1/redemptions/mine?status= (user).

Tests: validation; below min 422; above balance 422 (balance unchanged); success holds points;
two simultaneous redemptions cannot both pass; Bank account accepted; no active rule → 422.
```

### B13 — Admin: redemption processing  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §8.3, §8.4, WRR_PRD.md FR-21, §5.4,
database.md §7 Transaction 3.

Build (role admin):
- GET /api/v1/admin/redemptions?status=&page=&limit= (oldest first, with user name/phone).
- PATCH /api/v1/admin/redemptions/:id {action, admin_note, payout_trx_id}.
  approve / paid (payout_trx_id required, 4–50 letters/digits/dashes) / reject (admin_note ≥ 5
  required). Lock the redemption; redemptionStateMachine.nextStatus (409 otherwise); set
  admin_id + processed_at; reject also posts REFUND +points; notification for each action.

Tests: paid before approve 409; approve twice 409; paid without TrxID 400; paid stores TrxID;
paid cannot be rejected (no refund); reject from Pending and from Approved refunds; Rejected is
final; unknown id 404; non-admin 403.
```

### B14 — Notifications  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md Module 7, WRR_PRD.md FR-14.

Build (any logged-in role, always only the caller's own rows):
- GET /api/v1/notifications?unread_only=true|false&limit= (default 20, max 50): newest first,
  {unread_count (all unread, not just this page), notifications: [{notification_id, type,
  message, is_read (boolean), request_id, redemption_id, created_at}]}.
- PATCH /api/v1/notifications/:id/read → 200; someone else's or unknown id → 404;
  already read is still 200.
- PATCH /api/v1/notifications/read-all → 200 with {updated: n}.
Put SQL in models/notification.model.js; routes in routes/notification.routes.js.

Tests (notification.api.test.js): Tanvir's seed has 1 unread of 2; unread_only filter; marking
one lowers the count; another user's id 404; read-all makes the count 0; collector sees the
PICKUP_ASSIGNED notification after an assignment; no cookie 401.

Done when: all tests pass and api-spec Module 7 shows request_id/redemption_id in the list.
```

### B15 — Admin: waste categories  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §8.6, WRR_PRD.md FR-04, FR-16 (catalog
part), §5.2, requirement-validation.md EC-03.

Build (role admin), add the missing request/response details to api-spec.md §8.6:
- GET /api/v1/admin/categories → all categories incl. inactive (category_id, name,
  points_per_kg, is_other, is_active as booleans).
- POST /api/v1/admin/categories {name 2–100, points_per_kg ≥ 0 (≤ 99999999.99), is_other
  boolean default false} → 201 with the new category. Duplicate name (case-insensitive) → 409.
- PUT /api/v1/admin/categories/:id {name, points_per_kg, is_active} → 200; unknown id 404;
  duplicate name 409. Changing the rate never changes existing collection_records
  (the snapshot rule).

Tests: list includes inactive; create; duplicate 409; update rate → GET /categories shows new
rate but an existing record's points_per_kg_applied is unchanged; deactivate hides it from the
public list and new requests (400), while an Assigned request in that category can still be
completed; validation 400; non-admin 403.
```

### B16 — Admin: zones  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §8.7, WRR_PRD.md FR-19.

Build (role admin), add the missing details to api-spec.md §8.7:
- GET /api/v1/admin/zones → all zones incl. inactive.
- POST /api/v1/admin/zones {name 2–100, description ≤ 1000 optional} → 201; duplicate 409.
- PUT /api/v1/admin/zones/:id {name, description, is_active} → 200; unknown 404; duplicate 409.
Zones are never deleted (FKs are RESTRICT).

Tests: create, duplicate, rename, deactivate → disappears from GET /zones and register/submit
with that zone give 400; existing users/requests keep their zone; non-admin 403.
```

### B17 — Admin: redemption rules  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §8.8, WRR_PRD.md FR-16, database.md §5
(uq_rule_single_active), requirement-validation.md EC-06.

Build (role admin):
- GET /api/v1/admin/redemption-rules → {active: rule or null, archived: [...] newest first},
  each with updated_by name.
- POST /api/v1/admin/redemption-rules {taka_per_point > 0 with at most 4 decimals,
  min_points ≥ 0} → 201. One transaction: UPDATE all rules is_active = FALSE, then INSERT the
  new active rule with updated_by = admin (order matters because of the UNIQUE index).

Tests: after two POSTs exactly one rule is active; old rules kept; a Pending redemption keeps its
original rule_id and cash_amount; a new redemption uses the new rate; taka_per_point 0 → 400;
non-admin 403.
```

### B18 — Admin: users + collector accounts  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §8.9, WRR_PRD.md FR-20, §3.1,
requirement-validation.md MF-02.

Build (role admin), add the missing GET /admin/users details to api-spec.md §8.9:
- GET /api/v1/admin/users?role=&status=&zone_id=&page=&limit= → {total, page, limit, users:
  [user_id, full_name, email, phone, role, zone_id, zone_name, status, created_at,
  open_jobs (collectors: count of Assigned/Accepted/Collected)]}. Never return password_hash.
- POST /api/v1/admin/collectors {full_name, email, phone, password ≥ 8, zone_id (active,
  required)} → 201, role collector. Reuse the register validators; duplicate email 409.
- PATCH /api/v1/admin/users/:id/status {status active|inactive} → 200. An admin cannot
  deactivate their own account (409). Deactivating a collector with open jobs is allowed but
  the response includes open_jobs so the UI can warn (do NOT auto-reassign — that is future work).
- PATCH /api/v1/admin/users/:id/zone {zone_id} → only for collectors (else 409), zone active.

Tests: list filters; create collector can log in; duplicate 409; deactivate user → their login
403 and existing cookie 403; reactivate works; self-deactivate 409; zone change for a user 409;
non-admin 403.
```

### B19 — Admin: collection records + weight correction  `[x]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §8.5, WRR_PRD.md FR-18, §5.3, NFR-08,
database.md §7 Transaction 4, requirement-validation.md EC-01.

Build (role admin), add GET details to api-spec.md:
- GET /api/v1/admin/collection-records?from=&to=&zone_id=&page=&limit= → records with request
  id, user, collector, category, zone, weight, rate, points posted so far (EARN + ADJUST),
  collected_at, completed_at, request status.
- PUT /api/v1/admin/collection-records/:id {actual_weight_kg > 0, remarks ≤ 1000}.
  Only when the request is Completed (else 409). Same weight → 400. One transaction:
  lock the user's row FOR UPDATE; delta = ROUND(new_kg × points_per_kg_applied, 2) −
  SUM(EARN + ADJUST points of this record) (api-spec §8.5); if balance + delta < 0 → 422
  "Weight correction denied: the user's balance would drop below 0.00."; update weight and
  remarks; insert one ADJUST row (skip if delta = 0); status log Completed → Completed by the
  admin, note "Weight corrected from X kg to Y kg".
  Response {record_id, corrected_weight_kg, point_adjustment}.

Tests: downward 15.50 → 12.00 on seed record 1 gives −35.00 only if the balance allows (seed
balance is 55 so it works) and creates exactly one ADJUST + one log; upward correction credits;
two corrections in a row leave the record total = ROUND(final_kg × rate, 2); correction that
would go negative → 422 with nothing changed; non-Completed record 409; non-admin 403.
```

### B20 — Admin: reports  `[ ]`

```
Follow the Common Rules in prompt.md. Read api-spec.md §8.10, WRR_PRD.md FR-17, NFR-02,
database.md §6 Queries 2–6.

Build: GET /api/v1/admin/reports/:type?from=&to=&zone_id=&category_id= for
weight-by-category, request-volume-by-status, collector-performance, point-liability,
redemption-summary. Use the SQL of database.md §6 exactly (models/report.model.js), with from/to
as whole days (to inclusive). Defaults: from = first day of the current month, to = today.
Unknown type → 404. Response {success, report_type, filters, data}.

Tests: each type returns 200 with the columns of database.md §6; seed numbers (e.g. Report 1 shows
15.50 kg Plastic in Zone 1 for 2026-11-10); request-volume percentages add up to 100; bad date 400;
unknown type 404; non-admin 403.
```

### B21 — Backend audit  `[ ]`

```
Follow the Common Rules in prompt.md. Do not add features in this step.

1. List every endpoint in api-spec.md §2 (44) and the matching route in backend/src/routes.
   Report missing, extra or differently named ones.
2. For each FR-01..FR-21 in WRR_PRD.md, say which code implements it and which test covers it.
3. Security checklist (NFR-03): every SQL uses placeholders (grep for template strings inside
   queries; only LIMIT/OFFSET numbers may be inlined); every route has authenticateToken +
   requireRole except the public ones; ownership checks; no password_hash or token in responses.
4. Performance (NFR-02): time each endpoint against wrr_test with seed data plus 1,000 extra
   requests (script in backend/scripts/, not committed data); core calls ≤ 2 s, reports ≤ 5 s.
5. Run npm test and npm run test:api.
Report findings to me first; fix only after I agree.
```

---

## Phase C — Frontend

Frontend rules for every C step (also in architecture.md §2.1):
plain HTML/CSS/JS, no framework or build step · one stylesheet `frontend/css/style.css` ·
mobile-first, works from 360 px · every page loads `js/api.js` · user text only via `textContent` ·
show `errors[]` next to the matching field · disable the submit button while waiting ·
dates shown as `DD MMM YYYY, hh:mm a` in Bangladesh time · every portal page checks the role on load.

### C1 — Shared frontend core  `[ ]`

```
Follow the Common Rules in prompt.md. Read architecture.md §2.1, §7, §9.3, WRR_PRD.md NFR-01,
NFR-03, NFR-06.

Build in frontend/:
- css/style.css: colour variables, layout (header, nav, main, cards, tables that scroll on
  mobile), forms, buttons (primary, danger, disabled), status badges for all 7 request statuses
  and 4 redemption statuses, alert/toast, modal, loading state. Mobile-first from 360 px.
- js/api.js: api(path, {method, body}) using fetch('/api/v1' + path, {credentials:'same-origin'}),
  JSON in/out, on 401 redirect to /login.html?next=<current page>, returns {ok, status, body}.
- js/ui.js: el(tag, {text, className, attrs}) builder (textContent only), formatDateTime,
  formatPoints, statusBadge(status), showFieldErrors(form, errors), clearErrors, toast(message,
  type), confirmDialog(message) returning a Promise, setLoading(button, on).
- js/auth.js: requireRole(...roles) → calls GET /auth/me, redirects to login if not logged in or to
  the right portal if the role is wrong, returns the user; renderHeader(user) with role-specific
  nav links and a Logout button (POST /auth/logout).
- js/notifications.js: badge that polls GET /notifications?unread_only=true&limit=1 every 30 s
  (only user and collector).
- A short "Frontend helpers" section in architecture.md listing these helpers.

Done when: a test page can call api('/auth/me') and render the header for each role.
Manually check at 360 px and desktop widths.
```

### C2 — Public pages  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.1 step 1, api-spec.md Module 1–2.

Build: index.html (short project intro + Login/Register buttons), login.html (email, password;
on success go to ?next= or the role's dashboard: /user/dashboard.html, /collector/dashboard.html,
/admin/dashboard.html; show 401/403/429 messages), register.html (full name, email, phone,
password with confirm field checked in JS, address, zone dropdown from GET /zones; on 201 show
success and go to login). If already logged in, login/register redirect to the dashboard.

Done when: I can register a new user, log in as each seed account, and see a field error under
each wrong input.
```

### C3 — User: dashboard + notifications  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.1 steps 2, 6, FR-14.

Build: user/dashboard.html — stat cards: available balance + BDT value (GET /rewards/balance),
completed pickups (GET /pickup-requests/mine?status=Completed&limit=1 → total), active requests
(sum of totals for Pending, Assigned, Accepted, Collected), unread notifications; a big
"New Pickup Request" button (NFR-01: ≤ 3 screens from login); the 5 latest requests.
user/notifications.html — list with unread highlighted, "Mark as read" per item, "Mark all as
read", link to the related request when request_id is set.

Done when: numbers match the seed data for tanvir@gmail.com and marking read updates the badge.
```

### C4 — User: new pickup request  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.1 step 3, FR-03, api-spec.md §3.1.

Build: user/new-request.html — category dropdown (GET /categories, show points/kg), description
box shown and required only for is_other, estimated kg, zone (default = user's zone), pickup
address and contact phone pre-filled from /auth/me, datetime-local with min = now; client-side
checks mirror the server rules but the server errors are always shown. On 201 go to the request
details.

Done when: a request appears in "My requests" as Pending, and a past date shows the server's
message under the date field.
```

### C5 — User: my requests, details, cancel  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.1 steps 4–5, FR-05, FR-06,
api-spec.md §3.2–§3.4.

Build: user/requests.html — table/cards with status, date-range and category filters and paging; clicking a row opens a
details panel (GET /pickup-requests/:id): all fields, collector name/phone when assigned,
actual weight and points when available, and a vertical timeline (status, time, by whom, note).
"Cancel request" button only when Pending, with a confirm dialog; refresh after success; show 409
messages. Support requests.html?id=<n> to open a request directly (used by C3 and C4).

Done when: cancel works for a Pending request and is hidden for others.
```

### C6 — User: points history + redemption  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.1 steps 7–8, FR-11, FR-12, FR-15,
api-spec.md Modules 5–6.

Build:
- user/history.html — completed pickups (weight, rate, points) and the ledger (GET
  /rewards/history) with + / − colouring and paging.
- user/redeem.html — balance, active rule ("1 point = X BDT, minimum Y points"), form (points,
  method, account) with a live "you will receive Z BDT" preview, disabled when balance < min;
  below it "My redemptions" with status badges, TrxID when Paid, admin note when Rejected.

Done when: a successful redemption lowers the balance immediately and shows as Pending; 422
messages appear clearly.
```

### C7 — Collector: dashboard + job actions  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.2 steps 1–3, FR-08, api-spec.md
§4.1–§4.4.

Build: collector/dashboard.html (counts of Assigned / Accepted / Collected jobs, today's
completed, latest notifications) and collector/requests.html — job cards (name, phone as a
tel: link, address, category, estimated kg, preferred time, status) with status and zone filters.
Buttons by status: Assigned → Accept / Reject (reason modal); Accepted → Record weight (link to
C8 page) / Abort (reason modal); Collected → Mark as completed. Reason must be 5–200 chars.

Done when: accept, reject and abort work on mobile width and the job list refreshes.
```

### C8 — Collector: weigh, complete, history  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.2 steps 4–6, FR-09, FR-10, FR-12,
api-spec.md §4.5–§4.7, requirement-validation.md E-04, E-05.

Build: collector/record-weight.html?id= — job summary, actual weight (step 0.01) and remarks;
keep unsent input in localStorage until the server answers 201 (E-04); after saving show
"X kg × rate = points" and a "Mark as completed" button (confirm dialog) that shows the credited
points. collector/records.html — history with from/to and category filters and the summary totals.

Done when: a job goes Accepted → Collected → Completed from the UI and the user's balance grows by
the shown points.
```

### C9 — Admin: dashboard  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.3 step 1.

Build: admin/dashboard.html with KPI cards using existing endpoints only (no new API):
Pending requests and Rejected queue (admin/pickup-requests?status=…&limit=1 → total), active
collectors (admin/users?role=collector&status=active&limit=1), total kg collected this month and
points liability (reports weight-by-category and point-liability), Pending and Approved
redemptions (admin/redemptions?status=…&limit=1). Each card links to its page.

Done when: the numbers match the seed data.
```

### C10 — Admin: request queue + assignment  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.3 step 3, FR-07, api-spec.md §8.1, §8.2.

Build: admin/requests.html — filters (status, zone), paging, rows with user, phone, category,
zone, kg, preferred time, status, collector. For Pending/Rejected rows an "Assign" button opens a
modal listing active collectors (GET /admin/users?role=collector&status=active) with the
request's zone first and each collector's open_jobs count; show the last rejection reason for
Rejected rows (from GET /pickup-requests/:id timeline). Row click shows full details + timeline.

Done when: assigning and reassigning work and the row updates.
```

### C11 — Admin: redemptions  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.3 step 5, FR-21, api-spec.md §8.3, §8.4.

Build: admin/redemptions.html — tabs Pending / Approved / Paid / Rejected; rows show user, phone,
points, BDT, method, account, requested time. Pending: Approve / Reject. Approved: Mark paid
(modal asking TrxID) / Reject. Reject always asks for a note. Show 409/400 messages.

Done when: the full approve → paid and reject flows work and the user's balance reflects refunds.
```

### C12 — Admin: governance pages  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.3 steps 2 and 4, FR-16, FR-19, FR-20,
api-spec.md §8.6–§8.9.

Build:
- admin/users.html — filter by role/status/zone, activate/deactivate (warn when a collector has
  open jobs: "Reassign their N open jobs first"), cannot deactivate yourself (button hidden).
- admin/collectors.html — create collector form + list with zone change.
- admin/zones.html, admin/categories.html — list (incl. inactive), add, edit inline, toggle active.
  Category form explains that rate changes do not affect past rewards.
- admin/rules.html — current rule, history, form to set a new rule with a confirm dialog.

Done when: each create/edit/toggle works and duplicate names show the 409 message.
```

### C13 — Admin: collection records + weight correction  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md §4.3 step 6, FR-18, api-spec.md §8.5.

Build: admin/records.html — filters (date range, zone), table of records; "Correct weight" opens a
modal with the current weight, the new weight, remarks, and a preview of the point change
(ROUND(new kg × rate, 2) − points already posted). Show the 422 balance message clearly.

Done when: a correction updates the table and the request timeline shows "Weight corrected from X kg
to Y kg".
```

### C14 — Admin: reports  `[ ]`

```
Follow the Common Rules in prompt.md. Read WRR_PRD.md FR-17, api-spec.md §8.10, database.md §6.

Build: admin/reports.html — report type selector (5), date range (default this month), zone and
category filters (category only for weight-by-category), result table with totals row, "Print"
(window.print with a print stylesheet that hides nav and buttons) and "Export CSV" (built in the
browser from the JSON; quote fields that contain commas).

Done when: all 5 reports render, print cleanly on A4, and the CSV opens correctly in Excel.
```

---

## Phase D — Testing & lab report

### D1 — End-to-end walkthrough + NFR checks  `[ ]`

```
Follow the Common Rules in prompt.md. Do not add features.

Start the server against a fresh copy of the seed data in wrr_db (ask me before resetting wrr_db).
Walk through, and write down the result of each step in docs/e2e-walkthrough.md:
1. Register a new user → submit a request (≤ 3 screens, NFR-01).
2. Admin assigns → collector rejects → admin reassigns → collector accepts → weighs → completes.
3. User sees points and notifications → redeems → admin approves → marks paid.
4. Second redemption → admin rejects → points refunded.
5. Admin corrects a weight up and down; a correction that would go negative is refused.
6. Admin changes a category rate and a redemption rule; old records unchanged.
7. Each of the 5 reports; print and CSV.
8. Deactivate a user while logged in → next action 403.
NFR checks: 360 px layout on every page (NFR-06), Chrome/Firefox/Edge, timings (NFR-02),
5 failed logins → 429 (NFR-03).
Report every problem found before fixing.
```

### D2 — Test-case table  `[ ]`

```
Follow the Common Rules in prompt.md.

Create docs/test-cases.md for the lab report: one table with columns
ID | FR/NFR | Title | Preconditions | Steps | Expected result | Actual result | Pass/Fail.
Cover every FR-01..FR-21 at least once and every edge case EC-01..EC-06 of
requirement-validation.md. Fill "Actual" and "Pass/Fail" from the automated tests and the D1
walkthrough; mark anything not yet verified as "Not run". Add a summary: automated test count
(unit + API) and pass rate.
```

### D3 — Documentation sync + viva preparation  `[ ]`

```
Follow the Common Rules in prompt.md.

1. Compare the code with WRR_PRD.md, api-spec.md, database.md, architecture.md, dfd.md and list
   every difference. After I approve, update the documents (not the code) where the code is right.
2. The ER diagram images from the original report are outdated (see WRR_PRD.md §9 note): produce
   an up-to-date Mermaid ER diagram in docs/er-diagram.md from database/schema.sql.
3. Write docs/viva-notes.md: architecture in one paragraph; how a request moves through the 8
   transitions; how double-spending is prevented (row lock + REDEEM hold + unique EARN);
   why rates are snapshotted; why the JWT is in an HttpOnly cookie; 20 likely examiner questions
   with short answers.
4. Update AGENTS.md "Current code status" to "complete".
```

---

## 3. Small reusable prompts

**Review a change**
```
Follow the Common Rules in prompt.md. Review the code I just changed against WRR_PRD.md and
api-spec.md. List bugs, missing validation, wrong status codes, missing transactions or ownership
checks, with file:line. Do not edit yet.
```

**Fix a failing test**
```
Follow the Common Rules in prompt.md. This test fails: <paste output>. Find the cause. If the
code is wrong, fix the code; if the test contradicts the docs, show me before changing it.
```

**Explain for the viva**
```
Follow the Common Rules in prompt.md. Explain <file or feature> in simple words for a viva: what it
does, why it is built this way, which FR/NFR it satisfies. Add 3 likely examiner questions with
answers.
```

**Change a rule everywhere**
```
Follow the Common Rules in prompt.md. I want to change <rule>. List every document and file that
mentions it (WRR_PRD.md, api-spec.md, database.md, architecture.md, dfd.md,
requirement-validation.md, AGENTS.md, code, tests). Show the plan; after I approve, update all of
them in one go and run the tests.
```
