# Test Cases — Waste Resource Recycle (WRR)

**Course:** CSE-3112 Software Engineering Lab, Faridpur Engineering College
**Requirements:** `WRR_PRD.md` v1.3.0 (FR-01 – FR-21, NFR-01 – NFR-08), edge cases EC-01 – EC-06 from `requirement-validation.md`
**Run on:** 11 November 2026 (Windows 11, Node.js 22, MariaDB 10.4, Google Chrome 157)

---

## 1. Summary

| Suite | Command | Tests | Passed | Failed | Pass rate |
|---|---|:---:|:---:|:---:|:---:|
| Unit tests (no database) | `npm test` | 20 | 20 | 0 | 100 % |
| API tests (`wrr_test` database) | `npm run test:api` | 103 | 103 | 0 | 100 % |
| **Automated total (unit + API)** | | **123** | **123** | **0** | **100 %** |
| End-to-end story through the API | `npm run e2e` | 45 checks | 45 | 0 | 100 % |
| Static page checks (23 pages, 28 scripts) | `npm run check:frontend` | 352 checks | 352 | 0 | 100 % |
| Browser story in Chrome (D1) | `docs/e2e-walkthrough.md` §2 | 18 checks | 18 | 0 | 100 % |
| Page views in Chrome at 360 px and 1280 px (D1) | `docs/e2e-walkthrough.md` §2 | 50 | 50 | 0 | 100 % |
| Performance (NFR-02) | `npm run perf` | 3 limits | 3 | 0 | 100 % |

**Test cases in this document:** 50 (21 FR, 6 EC, 23 NFR/security).
**Result:** 47 Pass, 0 Fail, 3 Not run (TC-37 HTTPS in deployment, TC-47 uptime, TC-49 Firefox/Edge).

**How to read the "Actual result" column:** each row names where the evidence comes from:
- `unit:` = a unit test in `backend/test/unit/`.
- `api:` = an API test in `backend/test/api/` (the file name is given).
- `e2e:` = a step of `npm run e2e`.
- `browser:` = a row of the Chrome checklist in `docs/e2e-walkthrough.md`.

**Test data:** the seed data from `database/seed.sql`, password `password123` for every account:
- `admin@wrr.com` — admin.
- `collector1@wrr.com` — Rafiqul, Zone 1.
- `collector2@wrr.com` — Kamal, Zone 2.
- `tanvir@gmail.com` — user, Zone 1, 55.00 points.
- `sadia@gmail.com` — user, Zone 3.

Plastic is 10.00 points/kg; the active rule is ৳0.50 per point with a minimum of 100 points.

---

## 2. Functional requirements (FR-01 – FR-21)

| ID | FR/NFR | Title | Preconditions | Steps | Expected result | Actual result | Pass/Fail |
|---|---|---|---|---|---|---|:---:|
| TC-01 | FR-01 | Register a General User | Email not used yet | `POST /auth/register` with name, email, BD phone, password ≥ 8, address, zone | 201, role `user`, password hash never returned | api `auth`: 201, role user, no `password_hash` in body; browser M2: "Account created" and email pre-filled | Pass |
| TC-02 | FR-01 | Registration validation | — | Register with phone `123`, short password, bad email, duplicate email | 400 with the field named; duplicate email → 409 (case-insensitive) | api `auth`: 400 per field, 409 for `TANVIR@GMAIL.COM`; browser M1: red message under the phone field | Pass |
| TC-03 | FR-01 | Login, session cookie, logout | Seed accounts | Log in; call `/auth/me`; log out | `token` cookie is `HttpOnly`, `SameSite=Lax`, 7 days; token not in the body; logout clears the cookie | api `auth`: cookie flags checked, body has no token, `/auth/me` 401 after logout | Pass |
| TC-04 | FR-02 | Role-based access | Logged in as user, collector and admin | Call admin, collector and user endpoints with the wrong role | 401 without a cookie, 403 with the wrong role | api (all 11 files): every "only admins…" / "other roles are refused" test returns 403; no cookie → 401 | Pass |
| TC-05 | FR-02 | Deactivated account is stopped | User logged in | Admin deactivates the user; the user calls any endpoint; then tries to log in | Next call 403; login refused | api `user`: session and login blocked; e2e step 8: 403, works again after reactivation; browser M12: login page shows "Your account has been deactivated" | Pass |
| TC-06 | FR-03 | Submit a pickup request | Logged in as Tanvir | `POST /pickup-requests` with category, 12 kg, address, phone, zone, time tomorrow | 201, status `Pending`, status log and `PICKUP_SUBMITTED` written | api `pickup`: 201 Pending, log + notification; browser M3: success panel with request number | Pass |
| TC-07 | FR-03 | Request validation | Logged in as user | Weight 0, missing phone, `preferred_at` in the past, "Other" without description, inactive category/zone, collector submits | 400 per field (`other_description` named); inactive → 400; wrong role → 403 | api `pickup`: all refused with the expected code and field | Pass |
| TC-08 | FR-04 | Only active categories shown | One category deactivated | `GET /categories`; open the new-request form | Inactive category not listed; submitting with it → 400 | api `pickup` ("GET /categories is public…", "inactive category or zone is refused"), `category`: hidden from the public list and refused on submit | Pass |
| TC-09 | FR-05 | Track status and timeline | Seed request #1 (Completed) | `GET /pickup-requests/1` as Tanvir | Current status, points, and every status change in time order | api `pickup`: full timeline; e2e step 2: `Pending > Assigned > Rejected > Assigned > Accepted > Collected > Completed`; browser M4 | Pass |
| TC-10 | FR-06 | Cancel only while Pending | Own request in `Pending`, another in `Accepted` | `PUT /pickup-requests/:id/cancel` on each | Pending → `Cancelled` and logged; other → 409; someone else's → 404 | api `pickup`: 200 + log, 409 when not Pending | Pass |
| TC-11 | FR-07 | Assign / reassign a collector | Request Pending (then Rejected) | Admin `PUT /admin/pickup-requests/:id/assign` | `Assigned`, `PICKUP_ASSIGNED` to the collector; inactive collector or wrong status → error | api `collector`: assignment checks; e2e step 2: assign, reassign after reject; browser M5: same-zone collector listed first | Pass |
| TC-12 | FR-08 | Accept, reject with reason, on-site abort | Request Assigned to Rafiqul | Accept; on another, reject with a reason; on an accepted one, abort | Accept → `Accepted`; reject needs 5–200 chars and clears `collector_id`; abort only from `Accepted` | api `collector`: reject clears the collector, abort only from Accepted; unit `common`: reason length | Pass |
| TC-13 | FR-09 | Record actual weight (rate snapshot) | Request Accepted | `POST /collector/collection-records` with 15 kg | Status `Collected`; `points_per_kg_applied` = current rate; weight ≤ 0 refused | api `collector`: weight validation; browser M6: live preview 15 kg × 10 = 150 points | Pass |
| TC-14 | FR-10 | Complete and credit points in one transaction | Request Collected | `PUT /collector/requests/:id/complete` | `Completed`, one `EARN` row, log and `PICKUP_COMPLETED` in one transaction | api `collector`: correct EARN; two parallel completes credit once; browser M6: "150.00 points credited" | Pass |
| TC-15 | FR-11 | Points = ROUND(kg × rate, 2) | Rate 10.00 | Weigh 30 kg; weigh a weight with 3 decimals | 300.00; rounding done by the database to 2 decimals | api `collector`: "points are rounded to 2 decimals by the database"; e2e step 2: 300.00 | Pass |
| TC-16 | FR-12 | History with filters and paging | Several requests and records | `GET /pickup-requests/mine?status=&category_id=&from=&to=`; `GET /collector/history`; `GET /rewards/history` | Only own rows, newest first, filters and paging work; ledger signed | api `pickup`, `collector`, `redemption`: filters, paging, signed ledger | Pass |
| TC-17 | FR-13 | Every status change is logged | — | Run assign → reject → reassign → accept → collect → complete | One `request_status_logs` row per change with old/new status, who, note, time | api `pickup` / `collector`: log rows checked; e2e step 2: 7-step timeline | Pass |
| TC-18 | FR-14 | Notifications (11 types), badge, mark read | — | Run the pickup and redemption flows; open notifications; mark one / all read | All 11 types created for the right person; admin gets none; unread count drops | api `collector` (7 pickup types), `redemption` (4 redemption types), `notification` (read one / all, owner only); browser M7: badge 4 → cleared | Pass |
| TC-19 | FR-15 | Request a cash redemption | Balance ≥ 100 | `POST /redemptions` with 150 points, bKash | 201 Pending, ৳75.00, points held at once with a `REDEEM` row; below minimum or above balance → 422 | api `redemption`: 422 cases, REDEEM row; e2e step 3; browser M8: balance 150 → 50 | Pass |
| TC-20 | FR-16 | One active redemption rule | Active rule ৳0.50 | Admin `POST /admin/redemption-rules` ৳0.60, min 100 | New rule active, old one archived; two admins at the same moment still leave one active | api `rule`: archive, concurrency test | Pass |
| TC-21 | FR-17 | Five reports, print and CSV | Some completed pickups and redemptions | Run each report with filters; print; export CSV | Correct SQL totals, default dates = this month (BD time), only the filters each report uses; clean A4 print; CSV with BOM and Total row | api `report`: 7 tests; e2e step 7; browser M11, P1, P2 | Pass |
| TC-22 | FR-18 | Weight correction with ADJUST | Completed record 15.50 kg (155.00 points) | Admin corrects to 12.00 kg, then up again | One `ADJUST` of −35.00 and an audit row "Weight corrected from…"; total always = ROUND(final kg × rate, 2) | api `record`: −35.00, upward correction, audit row; browser M10: preview −10.00 and ADJUST row | Pass |
| TC-23 | FR-19 | Zone management | Admin | Create, rename, deactivate a zone | Duplicate name → 409; inactive zone not offered for new users/requests; old rows keep it | api `zone`: 7 tests | Pass |
| TC-24 | FR-20 | User and collector management | Admin | Create a collector; change their zone; deactivate/activate accounts; try to deactivate self and a collector with open jobs | Collector can log in; a collector with open jobs → 409 (MF-02); self-deactivation refused | api `user`: 10 tests | Pass |
| TC-25 | FR-21 | Process redemptions | Redemption Pending | Approve → mark paid with TrxID; on another, reject with a note | Pending → Approved → Paid (TrxID needed); reject from Pending/Approved refunds with `REFUND`; Paid is final | api `redemption`: approve/paid/reject/refund tests; e2e steps 3–4; browser M9 | Pass |

---

## 3. Edge cases (EC-01 – EC-06)

| ID | FR/NFR | Title | Preconditions | Steps | Expected result | Actual result | Pass/Fail |
|---|---|---|---|---|---|---|:---:|
| TC-26 | EC-01 (FR-18) | Downward correction would make the balance negative | User has spent most points | Admin corrects the weight so far down that ADJUST > balance | 422 "Weight correction denied…", nothing changed | api `record`: refused and nothing changed; e2e step 5: 25 → 1 kg refused with 422 | Pass |
| TC-27 | EC-02 (FR-15) | Two redemptions at the same moment | Balance enough for only one | Send two `POST /redemptions` in parallel | One succeeds, the other 422; balance never negative | api `redemption`: "two redemptions at the same moment cannot spend the same points" | Pass |
| TC-28 | EC-03 (FR-04) | Category deactivated while a job is in progress | Job Accepted for that category | Admin deactivates the category; collector weighs and completes | Hidden from new requests; the job still finishes with the snapshotted rate | api `category`: "deactivating hides the category … jobs in progress can finish (EC-03)" | Pass |
| TC-29 | EC-04 (FR-09) | Large difference between estimate and actual weight | Estimated 25 kg | Collector records 30 kg | Accepted; points use the actual weight | e2e step 1–2: estimate 25 kg, actual 30 kg → 300.00 points | Pass |
| TC-30 | EC-05 (FR-09/18) | Zero or negative weight | Request Accepted / record Completed | Record or correct with 0 and −5 | 400 from the API; database `CHECK (actual_weight_kg > 0)` | api `collector` "weight validation", `record` "validation"; unit `validators`: positive amounts | Pass |
| TC-31 | EC-06 (FR-16) | Rule changes while a redemption is pending | Pending redemption of 100 points at ৳0.50 | Admin activates ৳0.60 | Pending redemption keeps ৳50.00 and its `rule_id` | api `rule`: "a redemption made under the old rule keeps its amount"; e2e step 6 | Pass |

---

## 4. Non-functional requirements and security

| ID | FR/NFR | Title | Preconditions | Steps | Expected result | Actual result | Pass/Fail |
|---|---|---|---|---|---|---|:---:|
| TC-32 | NFR-01 | Submit in ≤ 3 screens | Logged out | Log in → dashboard → New pickup request → Submit | ≤ 3 screens; labels and inline errors | browser M3: 3 screens (login → dashboard → new request) | Pass |
| TC-33 | NFR-01 | Same layout in all three portals | — | Open every page | Shared header, menu, cards and colours | browser: 25 page views per size all use `css/style.css` and the shared header | Pass |
| TC-34 | NFR-02 | Core calls ≤ 2 s with 50 users | `wrr_test` seeded | `npm run perf` (50 concurrent users, 1,000 requests) | Slowest core call ≤ 2.0 s | ~150 ms | Pass |
| TC-35 | NFR-02 | Reports ≤ 5 s with 50 users | As above | `npm run perf` | Slowest report ≤ 5.0 s | ~110 ms | Pass |
| TC-36 | NFR-03.1 | Password hashing | — | Register; read `users.password_hash` | bcrypt hash, cost 10; password ≥ 8 chars | `account.service.js`: `bcrypt.hash(password, 10)`; api `auth`: hash never returned, short password 400 | Pass |
| TC-37 | NFR-03.2 | HTTPS in deployment | Deployed server | Open the site over HTTPS | All traffic encrypted | Local development only (plain HTTP on localhost) | Not run |
| TC-38 | NFR-03.3 | SQL injection | — | Send `' OR 1=1 --` in login email and in text fields | Treated as text; no SQL error | Code review: every query passes user values as `?` placeholders through `mysql2`; dynamic parts of SQL are only fixed column names written in the models (e.g. `category.model.update`, `user.model` filters) | Pass |
| TC-39 | NFR-03.4 | XSS | — | Save `<script>` in an address or remark; open the page | Shown as text, not run | check:frontend: no `innerHTML` / `document.write` in any script; CSP blocks inline scripts | Pass |
| TC-40 | NFR-03.5 | Login rate limit | — | 6 wrong passwords in a row | `401 ×5`, then 429 | api `auth`; e2e: `401,401,401,401,401,429` | Pass |
| TC-41 | NFR-03.6 | Token only in an HttpOnly cookie | — | Log in; inspect body and cookie | No token in the body; cookie `HttpOnly`, `SameSite=Lax` | api `auth` | Pass |
| TC-42 | NFR-03.7 | Ownership checks | Two users | Tanvir opens or cancels Sadia's request; reads her notifications | 404, nothing changed | api `pickup`, `notification`: "a user never sees or changes another user's…" | Pass |
| TC-43 | NFR-03.8 | Weak JWT secret refused | — | Start with the example or a 20-character secret | Server refuses to start | unit `security`: 2 tests | Pass |
| TC-44 | NFR-03.9 | Security headers | — | Any request | CSP, nosniff, `X-Frame-Options: DENY`, `Referrer-Policy`, no `X-Powered-By` | api `auth`: "every response carries the security headers" | Pass |
| TC-45 | NFR-03.10 | Same answer for unknown email and wrong password | — | Log in with each | Same 401 message (dummy bcrypt for unknown email) | api `auth` | Pass |
| TC-46 | NFR-04 | ACID and non-negative balance | — | Parallel completes, parallel redemptions, parallel rule switches, refused correction | No double credit, no overspend, one active rule, rollback leaves nothing behind | api `collector`, `redemption`, `rule`, `record` (concurrency and rollback tests) | Pass |
| TC-47 | NFR-05 | ≥ 99 % uptime 8 am – 10 pm | Deployed server and monitoring | Measure over a period | ≥ 99 % | Not measurable on a local lab machine | Not run |
| TC-48 | NFR-06 | Chrome desktop and 360 px phone | — | Open all 25 page views at 360 px and 1280 px; run the story | No sideways page scroll, Menu button works, dialogs fit, no console errors | browser (Chrome 157): all pass after fix 1 in `docs/e2e-walkthrough.md` §3 | Pass |
| TC-49 | NFR-06 | Firefox and Edge | — | Repeat browser M3, M6, M8, R2 | Same as Chrome | — | Not run |
| TC-50 | NFR-07 / NFR-08 | Layers, config and audit trail | — | Code review; check logs and redemption rows | routes → controllers → services → models, secrets in `.env`; every change records who and when (`changed_by_id`, `admin_id`, `processed_at`) | api `record`, `redemption`: audit rows with admin id and time; layer rule followed in every module | Pass |

---

## 5. Not run — what is left

| Test case | Why not run | How to run it |
|---|---|---|
| TC-37 HTTPS | The project runs only on `localhost` | Put the app behind a web server with a TLS certificate when it is deployed |
| TC-47 Uptime | Needs a deployed server and weeks of monitoring | Use an uptime monitor after deployment |
| TC-49 Firefox / Edge | Only Chrome was driven automatically | Open http://localhost:5000 in each browser and repeat `docs/e2e-walkthrough.md` M3, M6, M8, R2 |
| (P2 part) CSV in Excel | The file was checked as text, not opened in Excel | Reports → Export CSV → open the file in Excel |

---

## 6. How to repeat

From `backend/`, with MySQL running:

```
npm test                # 20 unit tests
npm run test:api        # 103 API tests (separate wrr_test database)
npm run e2e             # 45 end-to-end checks (wrr_test)
npm run check:frontend  # 352 static page checks (no database)
npm run perf            # NFR-02 timings (wrr_test)
```
