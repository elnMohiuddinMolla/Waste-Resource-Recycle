# AGENTS.md — Waste Resource Recycle (WRR) Management System

Instructions for any AI coding agent (Claude Code, Codex, Cursor, Copilot, ...) and for new teammates. Read this before doing any work in this project. Ready-made task prompts are in `prompt.md`.

## 1. Where the truth lives

| Topic | File |
|---|---|
| Requirements (FR-01–FR-22, NFR-01–NFR-08, business rules, state machine) | `WRR_PRD.md` (v1.5.0) |
| Every endpoint, payload, validation rule and status code | `api-spec.md` |
| Tables, constraints, report SQL, transactions, seed data | `database.md` (= `database/schema.sql` + `database/seed.sql`) |
| Architecture and folder structure | `architecture.md` |
| Data flow diagrams | `dfd.md` |
| Analysis / validation reports | `prd-analysis.md`, `requirement-validation.md` |
| Superseded documents (history only, do not follow) | `docs/archive/` |

If two files disagree, `WRR_PRD.md` wins for requirements and `api-spec.md` wins for API details. Fix the other file.

## 2. Project at a glance

- **What:** households (General Users) request pickup of recyclable waste; collectors weigh it; users earn points (actual kg × category rate) and can redeem them for cash (bKash, Nagad, Bank).
- **Course:** CSE-3112 Software Engineering Lab, Faridpur Engineering College. Supervisor: Mohammad Shamsul Islam.
- **Team:** MD Mohiuddin Molla (Reg: 2022254878), Abdul Al Noman (Reg: 935) — the spelling used in every document (PRD G12; older drafts said "Roman").
- **SDLC:** Waterfall. Requirements and design are done; implementation is in progress (see §5 and `prompt.md`).

## 3. Tech stack (fixed by the proposal — do not change)

- **Frontend:** plain HTML, CSS, JavaScript. No React, Next.js or other framework.
- **Backend:** Node.js + Express.js. The same server serves `frontend/` with `express.static` and the API under `/api/v1` (same origin, no CORS).
- **Database:** XAMPP's MariaDB 10.4 locally (schema also runs on MySQL 8.0+).
- **Auth:** bcryptjs (cost 10) + JWT in an `HttpOnly`, `SameSite=Lax` cookie named `token` (7 days). Never return the token in a response body; never use `localStorage` for it.

## 4. Rules that are easy to get wrong

- **State machine:** only the 8 transitions in PRD §5.1 (T1–T8). Anything else → 409. Every change writes `request_status_logs`. Reject clears `collector_id`.
- **Status codes:** 400 validation · 401 not logged in · 403 role/inactive · 404 · 409 state conflict or duplicate · 422 business rule (balance, min_points, negative correction) · 429 rate limit · 500.
- **Ledger:** balance = `SUM(points)`; never negative. One `EARN` per record (DB unique index). Completion, redemption, rejection and weight correction each run in one transaction.
- **Redemptions:** `approve` Pending→Approved, `paid` Approved→Paid (needs `payout_trx_id`), `reject` Pending/Approved→Rejected (+REFUND). Lock the user row with `SELECT ... FOR UPDATE` when submitting.
- **Notifications:** the 12 types in FR-14, all to users/collectors. Admins get queue counts on the dashboard, not notification rows.
- **Validation:** password ≥ 8 chars; `preferred_at` strictly in the future; login limit 5 failed / 15 min.
- **Security:** parameterized SQL only; insert user text with `textContent`; check ownership on every request. `JWT_SECRET` must be ≥ 32 characters (the server refuses the example value).
- **Frontend and CSP:** the Content-Security-Policy blocks inline code. Use separate `.js`/`.css` files, `addEventListener` and CSS classes — never inline `<script>`, `onclick="..."` or `style="..."`.
- **Layers:** controllers call services only; services never contain SQL; all SQL (including row locks such as `userModel.lockById`) lives in models.

## 5. Current code status — complete

**Built, tested and audited** (`prompt.md` A1–A3, B1–B21) — all 50 endpoints of `api-spec.md` §2 (the photo endpoint came with PRD v1.4.0, the five support endpoints with v1.5.0). `npm run perf` checks NFR-02 (latest: slowest core call ~150 ms, slowest report ~110 ms with 50 concurrent users), matching `api-spec.md`:

| Area | Endpoints (prefix `/api/v1`) |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` (no login needed), `GET /auth/me` |
| Catalog (public) | `GET /categories`, `GET /zones` |
| Pickup (user) | `POST /pickup-requests`, `GET /pickup-requests/mine` (status, from, to, category_id), `GET /pickup-requests/:id`, `GET /pickup-requests/:id/photo`, `PUT /pickup-requests/:id/cancel` |
| Admin requests | `GET /admin/pickup-requests`, `PUT /admin/pickup-requests/:id/assign` |
| Collector | `GET /collector/requests`, `PUT /collector/requests/:id/accept\|reject\|abort\|complete`, `POST /collector/collection-records`, `GET /collector/history` (from, to, category_id) |
| Rewards | `GET /rewards/balance`, `GET /rewards/history` |
| Redemptions | `GET /redemptions/rules/active`, `POST /redemptions`, `GET /redemptions/mine`, `GET /admin/redemptions`, `PATCH /admin/redemptions/:id` |
| Notifications | `GET /notifications` (unread_only, limit), `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |
| Admin categories | `GET /admin/categories`, `POST /admin/categories`, `PUT /admin/categories/:id` (partial update) |
| Admin zones | `GET /admin/zones`, `POST /admin/zones`, `PUT /admin/zones/:id` (partial update) |
| Admin rules | `GET /admin/redemption-rules` (active + archived), `POST /admin/redemption-rules` (lock, deactivate all, insert) |
| Admin accounts | `GET /admin/users` (role, status, zone_id), `POST /admin/collectors`, `PATCH /admin/users/:id/status`, `PATCH /admin/users/:id/zone` |
| Admin records | `GET /admin/collection-records` (from, to, zone_id), `PUT /admin/collection-records/:id` (weight correction + ADJUST, balance guard) |
| Support (v1.5.0) | `POST /support-tickets`, `GET /support-tickets/mine`, `PATCH /support-tickets/:id/close` (owner or admin), `GET /admin/support-tickets` (status), `PUT /admin/support-tickets/:id/reply` (+ `SUPPORT_ANSWERED`) |
| Admin reports | `GET /admin/reports/:type` — `weight-by-category`, `request-volume-by-status`, `collector-performance`, `point-liability`, `redemption-summary` (SQL = database.md §6) |

**Shared pieces — reuse them, never write a second version:**
- `utils/AppError.js` (throw `new AppError(status, message, errors)`), `utils/transaction.js` (`withTransaction`), `utils/validators.js` (incl. `toNonNegativeAmount`, `toBoolean`), `utils/money.js` (compare DECIMAL strings as integer cents), `utils/image.js` (`parsePhoto`: data URL → checked JPG/PNG/WebP ≤ 2 MB), `utils/photoStore.js` (`save`, `fullPath`, `remove`; files in `backend/uploads/pickups/`, `UPLOAD_DIR` in tests).
- `controllers/accountInput.js` (`parseAccountInput`, shared by register and collector creation) and `services/account.service.js` (`createAccount`, `setStatus`, `setCollectorZone`).
- `controllers/common.js`: `parseRequestId`, `parsePaging`, `parseStatusList`, `isRealDate`, `parseDate`, `parseDateRange`, `parseOptionalId`, `parseReason`.
- `services/requestStateMachine.js` (T1–T8, `assertTransition`), `services/redemptionStateMachine.js` (`nextStatus`, `PAYOUT_METHODS`), `services/notification.service.js` (`NOTIFICATION_TYPES`, `createNotification`, `listForUser`, `markOneRead`, `markAllRead`).
- Models: `statusLog.model.insert(connection, ...)` (always inside the transaction), `pickup.model.findByIdForUpdate` (row lock), `ledger.model.insertEarn` / `insertRedemptionRow` / `insertAdjust` / `getBalance(userId, connection)`, `collection.model.adjustmentFor` (ADJUST = target − points posted, in SQL), `rule.model.findActive` / `deactivateAll` (locks all rules first) / `insert`.
- Points and money are computed in SQL with `ROUND(..., 2)`. A job or request that is not yours returns 404.

**Frontend built** (C1–C14, all three portals complete): shared `css/style.css`, `js/api.js`, `js/ui.js`, `js/auth.js`, `js/notifications.js` (see architecture.md §2.1); `index.html`, `login.html`, `register.html`; a dashboard per role (`user/`, `collector/`, `admin/` `dashboard.html`, shared `js/pages/dashboard-shell.js` with greeting, date and icon tiles; icons from `js/icons.js`, built with `createElementNS`); the user dashboard has a balance card with progress to the redemption minimum, active/completed counts, next pickup, a step tracker for the current pickup, unread count and the latest 5 requests; `user/notifications.html` (all/unread, mark one or all as read, links to the request or redemption); `user/new-request.html` (categories with rate, "Other" description, zone defaulting to the user's, address/phone pre-filled, future-only time, live points estimate, success panel); `user/requests.html` (status/category/date filters, paging, details with collector and points, status timeline, cancel while Pending; `?id=`, `?status=` and filters kept in the URL); `user/history.html` (balance, completed pickups with weight × rate = points, signed ledger, both paged); `user/redeem.html` (rate and minimum, form disabled with a reason when below the minimum or no rule, "Use all", live taka preview, confirm dialog, my redemptions with TrxID / rejection reason); `collector/dashboard.html` (jobs by stage, next job with tap-to-call, kg and pickups completed today, latest notifications); `collector/requests.html` (job cards with tap-to-call, tabs by status, zone filter, Accept / Reject / Cancel on site with `reasonDialog`, Mark as completed). `ui.reasonDialog` asks for a 5–200 character reason; `collector/record-weight.html?id=` (job summary, weight + remarks with live points, draft kept in localStorage until saved, then Mark as completed); `collector/records.html` (completed collections with date and category filters, totals, paging); in all three portals the menu is a left sidebar with icons on wide screens and a Menu button on phones; `admin/dashboard.html` (queues marked with an amber edge when busy, this month's kg / cash paid / liability / collectors, request-status and kg-by-category bars drawn with `<progress>`, all from existing endpoints); `admin/requests.html` (status tabs, zone filter, details with timeline and last rejection reason, assign / reassign dialog with same-zone collectors first and their open jobs); `admin/redemptions.html` (status tabs, Approve, Mark paid with a TrxID dialog, Reject with a reason that refunds the points); `admin/users.html` (role/status/zone filters, activate/deactivate; a collector with open jobs cannot be deactivated, no self-deactivation); `admin/collectors.html` (create collector, change zone); `admin/zones.html` and `admin/categories.html` (add, edit, activate/deactivate); `admin/rules.html` (active rule, history, activate a new rule). `admin/records.html` (date and zone filters, points posted per record, Correct weight dialog with a live preview of the ledger change, 422 balance message shown in the dialog). `admin/reports.html` (5 reports, only the filters each report uses, totals row, A4 print stylesheet, CSV export with UTF-8 BOM and formula-injection guard). `ui.formDialog` shows a small form in a dialog and keeps it open with the server's errors on failure.

**Testing tools:** `npm run e2e` (full story through the API, 45 checks, `wrr_test`), `npm run check:frontend` (static page checks, no database). Results and the manual browser checklist: `docs/e2e-walkthrough.md`.

D1 done: browser checklist run in Chrome (18/18; two layout/UX fixes). Edge responsive check: 200/200 page views at 8 sizes (320–1920 px). Firefox and CSV-in-Excel are left to check by hand.

D2 done: `docs/test-cases.md` (50 test cases covering FR-01–FR-22, EC-01–EC-06 and NFRs; 47 pass, 3 not run).

D3 done: `docs/er-diagram.md` (Mermaid ER from `database/schema.sql`), `docs/viva-notes.md` (architecture, transitions, double-spending, snapshots, cookie, 20 questions).

**The project is complete** (prompt.md A1–D3). Left to do by hand: open the site in Firefox, open an exported CSV in Excel (`docs/e2e-walkthrough.md`).

**Waste photo (PRD v1.4.0):** every new pickup request needs a photo (`photo` data URL in `POST /pickup-requests`); `user/new-request.html` shrinks it in the browser (canvas, ≤ 1280 px JPEG); details, job cards, the collector's next job and the admin view show it with `ui.requestPhoto()`. An existing database needs `database/migrations/001_add_pickup_photo.sql` once.

**Help & support (PRD v1.5.0, FR-22):** public `help.html` (FAQ in `<details>`, admin contact); `support.html` for users and collectors (new ticket with optional related request / cash-out, `?request_id=` pre-selects; my tickets with answers; close); `admin/support.html` (tabs, reply via `ui.formDialog`, close); "Support" in every sidebar; open tickets are a queue on the admin dashboard. Max 5 open tickets per person. An existing database needs `database/migrations/002_add_support_tickets.sql` once.

**Deployment:** Railway, see `docs/deploy-railway.md` (root `package.json` build/start scripts, no `railway.json`; env `TRUST_PROXY=1`, `UPLOAD_DIR=/data`; `npm run db:setup` loads the schema once and refuses if tables exist).

**Tests:** `npm test` = unit tests (no database). `npm run test:api` = API tests; they rebuild a separate database `wrr_test` (override with `TEST_DB_NAME`) from `database/*.sql` and refuse to run on `wrr_db`. Add tests for each new module.

## 6. Working conventions

- Keep code simple and readable; it must be explained in a viva.
- Don't add features outside the FRs without asking (see "future work" in `requirement-validation.md`).
- When you change a rule, update every document that mentions it.
- The user writes in English and Banglish (romanized Bengali). Reply in the language they use.
