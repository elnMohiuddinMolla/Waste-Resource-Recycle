# AGENTS.md — Waste Resource Recycle (WRR) Management System

Instructions for any AI coding agent (Claude Code, Codex, Cursor, Copilot, ...) and for new teammates. Read this before doing any work in this project. Ready-made task prompts are in `prompt.md`.

## 1. Where the truth lives

| Topic | File |
|---|---|
| Requirements (FR-01–FR-21, NFR-01–NFR-08, business rules, state machine) | `WRR_PRD.md` (v1.3.0) |
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
- **Team:** MD Mohiuddin Molla (Reg: 2022254878), Abdul Al Noman (Reg: 935). The spelling "Noman" is not yet confirmed (older docs say "Roman").
- **SDLC:** Waterfall. Requirements and design are done; implementation is next.

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
- **Notifications:** the 11 types in FR-14, all to users/collectors. Admins get queue counts on the dashboard, not notification rows.
- **Validation:** password ≥ 8 chars; `preferred_at` strictly in the future; login limit 5 failed / 15 min.
- **Security:** parameterized SQL only; insert user text with `textContent`; check ownership on every request.

## 5. Current code status

Done and matching `api-spec.md`:
- `src/app.js` (API under `/api/v1`, serves `../frontend` statically, JSON 404 and error handler).
- Auth module: `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me` — cookie-based JWT, validation, 409 duplicate email, 403 inactive, login limiter 5 failed / 15 min.
- Middleware: `auth.js` (cookie), `role.js` (`requireRole(...)`), `rateLimiter.js`, `error.js`. `utils/AppError.js` for throwing `(statusCode, message, errors)`.
- `services/notification.service.js` with the 11 `NOTIFICATION_TYPES`.
- Catalog: `GET /categories`, `GET /zones` (public).
- Pickup requests (user side): `POST /pickup-requests`, `GET /pickup-requests/mine`, `GET /pickup-requests/:id`, `PUT /pickup-requests/:id/cancel`.
- Shared pieces to reuse: `services/requestStateMachine.js` (T1–T8, `assertTransition`), `utils/transaction.js` (`withTransaction`), `utils/validators.js`, `models/statusLog.model.js` (`insert` must get the transaction connection), `pickup.model.findByIdForUpdate` (row lock).

- Admin assignment: `GET /admin/pickup-requests`, `PUT /admin/pickup-requests/:id/assign` (T1/T2, notifies the collector).
- Collector workflow: `GET /collector/requests`, `PUT /collector/requests/:id/accept|reject|abort|complete`, `POST /collector/collection-records`, `GET /collector/history`. Rate snapshot and EARN points are computed in SQL (`ROUND(... , 2)`); a job of another collector returns 404.
- More shared pieces: `controllers/common.js` (id, paging, status list, date, reason parsing), `models/collection.model.js`, `models/ledger.model.js` (`insertEarn`).

- Rewards: `GET /rewards/balance`, `GET /rewards/history`.
- Redemptions: `GET /redemptions/rules/active`, `POST /redemptions` (user row locked `FOR UPDATE`, REDEEM row holds points), `GET /redemptions/mine`; admin `GET /admin/redemptions`, `PATCH /admin/redemptions/:id` (approve / paid / reject + REFUND).
- More shared pieces: `services/redemptionStateMachine.js` (`nextStatus`, `PAYOUT_METHODS`), `utils/money.js` (compare DECIMAL strings as integer cents), `models/rule.model.js`, `models/redemption.model.js`, `ledger.model.getBalance(userId, connection)`.

Not built yet: notifications (prompt.md B14), admin governance + weight correction + reports (B15–B20), backend audit (B21), `frontend/` (C1–C14), testing and lab-report docs (D1–D3).

**Tests:** `npm test` = unit tests (no database). `npm run test:api` = API tests; they rebuild a separate database `wrr_test` (override with `TEST_DB_NAME`) from `database/*.sql` and refuse to run on `wrr_db`. Add tests for each new module.

## 6. Working conventions

- Keep code simple and readable; it must be explained in a viva.
- Don't add features outside the FRs without asking (see "future work" in `requirement-validation.md`).
- When you change a rule, update every document that mentions it.
- The user writes in English and Banglish (romanized Bengali). Reply in the language they use.
