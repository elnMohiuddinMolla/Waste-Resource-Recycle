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
- **Notifications:** the 11 types in FR-14, all to users/collectors. Admins get queue counts on the dashboard, not notification rows.
- **Validation:** password ≥ 8 chars; `preferred_at` strictly in the future; login limit 5 failed / 15 min.
- **Security:** parameterized SQL only; insert user text with `textContent`; check ownership on every request.

## 5. Current code status

**Built and tested** (`prompt.md` A1–A3, B1–B14), matching `api-spec.md`:

| Area | Endpoints (prefix `/api/v1`) |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` (no login needed), `GET /auth/me` |
| Catalog (public) | `GET /categories`, `GET /zones` |
| Pickup (user) | `POST /pickup-requests`, `GET /pickup-requests/mine` (status, from, to, category_id), `GET /pickup-requests/:id`, `PUT /pickup-requests/:id/cancel` |
| Admin requests | `GET /admin/pickup-requests`, `PUT /admin/pickup-requests/:id/assign` |
| Collector | `GET /collector/requests`, `PUT /collector/requests/:id/accept\|reject\|abort\|complete`, `POST /collector/collection-records`, `GET /collector/history` (from, to, category_id) |
| Rewards | `GET /rewards/balance`, `GET /rewards/history` |
| Redemptions | `GET /redemptions/rules/active`, `POST /redemptions`, `GET /redemptions/mine`, `GET /admin/redemptions`, `PATCH /admin/redemptions/:id` |
| Notifications | `GET /notifications` (unread_only, limit), `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |

**Shared pieces — reuse them, never write a second version:**
- `utils/AppError.js` (throw `new AppError(status, message, errors)`), `utils/transaction.js` (`withTransaction`), `utils/validators.js`, `utils/money.js` (compare DECIMAL strings as integer cents).
- `controllers/common.js`: `parseRequestId`, `parsePaging`, `parseStatusList`, `isRealDate`, `parseDate`, `parseDateRange`, `parseOptionalId`, `parseReason`.
- `services/requestStateMachine.js` (T1–T8, `assertTransition`), `services/redemptionStateMachine.js` (`nextStatus`, `PAYOUT_METHODS`), `services/notification.service.js` (`NOTIFICATION_TYPES`, `createNotification`, `listForUser`, `markOneRead`, `markAllRead`).
- Models: `statusLog.model.insert(connection, ...)` (always inside the transaction), `pickup.model.findByIdForUpdate` (row lock), `ledger.model.insertEarn` / `insertRedemptionRow` / `getBalance(userId, connection)`, `rule.model.findActive`.
- Points and money are computed in SQL with `ROUND(..., 2)`. A job or request that is not yours returns 404.

Not built yet: admin governance + weight correction + reports (B15–B20), backend audit (B21), `frontend/` (C1–C14), testing and lab-report docs (D1–D3).

**Tests:** `npm test` = unit tests (no database). `npm run test:api` = API tests; they rebuild a separate database `wrr_test` (override with `TEST_DB_NAME`) from `database/*.sql` and refuse to run on `wrr_db`. Add tests for each new module.

## 6. Working conventions

- Keep code simple and readable; it must be explained in a viva.
- Don't add features outside the FRs without asking (see "future work" in `requirement-validation.md`).
- When you change a rule, update every document that mentions it.
- The user writes in English and Banglish (romanized Bengali). Reply in the language they use.
