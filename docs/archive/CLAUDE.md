# CLAUDE.md — Waste Resource Recycle (WRR) Management System

This file gives Claude Code the full context of this project. Read it before doing any work here.
The detailed specification is in `WRR_Revised_Requirements_and_Design.md`. **That file is the single source of truth.**
`WRR_PRD.md` (v1.2.0) restates it as a product requirements document and has the full API table.
If anything in the older PDFs disagrees with it, follow the revised `.md`.

---

## 1. Project at a glance

- **What:** a web app that connects households (General Users) with waste collectors for recyclable waste pickup. Users earn reward points by actual weight × waste category and can redeem the points for cash.
- **Course:** CSE-3112 Software Engineering Lab, Faridpur Engineering College
- **Supervisor:** Mohammad Shamsul Islam, Associate Professor & Head, Dept. of CSE
- **Team:** MD Mohiuddin Molla (2022254878), Abdul Al Noman (935). The spelling "Noman" is not yet confirmed; older docs also say "Roman".
- **SDLC:** Waterfall. Requirements and design are **done**. The next phase is **implementation**, then testing, then the final lab report.
- **Architecture:** three-tier (Presentation → Application → Data).
- **Tech stack (fixed by the proposal, do not change):**
  - Frontend: plain **HTML, CSS, JavaScript** (no React or other framework unless the user asks)
  - Backend: **Node.js + Express.js** REST API
  - Database: **MySQL**
  - Auth: bcrypt password hashing and JWT sessions

## 2. Roles

| Role | Can do |
|---|---|
| General User (`user`) | Register and log in; submit a pickup request (category, estimated kg, address, contact phone, zone, preferred date/time, description if "Other"); track status and history; cancel while Pending; view notifications; view point balance; request cash redemption and track its status |
| Waste Collector (`collector`) | Log in; view assigned requests filtered by zone; accept, or reject with a reason; mark Collected with the actual weight; mark Completed; view past records. The admin creates collector accounts. |
| Administrator (`admin`) | Manage users and collectors, zones, waste categories and points/kg rates, and redemption rules; view all pickup requests; assign or reassign collectors; approve, reject or mark redemptions Paid; correct collection records; generate reports |

## 3. Core business rules (must be enforced on the server)

**Pickup request status lifecycle.** Any other transition must be refused.
```
Pending → Assigned → Accepted → Collected → Completed
Assigned → Rejected → (admin reassigns) → Assigned
Pending → Cancelled   (user only)
```
- Every status change writes a row to `request_status_logs` (old_status, new_status, changed_by_id, note). The reject reason goes in `note`.
- Only the **assigned** collector can act on a request. Only an admin can assign.
- `preferred_at` must be in the future. `other_description` is required when the category has `is_other = true`.

**Rewards (signed points ledger):**
- `points = actual_weight_kg × points_per_kg_applied`, rounded to 2 decimals.
- Copy the category's `points_per_kg` into `collection_records.points_per_kg_applied` when recording the weight, so later rate changes never alter past rewards.
- On **Completed**, insert one `EARN` row into `reward_transactions`. Do this in the **same DB transaction** as the status change.
- **Balance** = `SUM(points)` from `reward_transactions` for the user. Credits are positive and debits negative. The balance can never go negative.
- Only one `EARN` row is allowed per record (enforce this in code).

**Admin weight correction (FR-18):** in one transaction:
1. Update `collection_records.actual_weight_kg` (and `remarks`).
2. Insert an `ADJUST` row for the point difference (signed).
3. Insert a `request_status_logs` row with `old_status = new_status = 'Completed'`, `changed_by_id` = the admin, and `note = 'Weight corrected from X kg to Y kg'`. This is the audit trail for who corrected the weight and when (no schema change needed).
- **Refuse** a downward correction if the `ADJUST` entry would make the user's balance negative (e.g. the points were already redeemed). The admin then resolves it manually.

**Cash redemption:**
- Requires `min_points ≤ points ≤ balance`. `cash_amount = points × taka_per_point` from the **active** `redemption_rules` row (only one is active at a time).
- On submit, in **one transaction**:
  1. Lock the user's row: `SELECT user_id FROM users WHERE user_id = ? FOR UPDATE`.
  2. Compute the balance and validate.
  3. Insert `cash_redemptions` (Pending) **and** a `REDEEM` ledger row with negative points.
  The row lock makes two concurrent redemptions by the same user run one after another, so the second sees the reduced balance. The `REDEEM` row holds the points so they can't be spent twice.
- On admin reject: status becomes Rejected and a `REFUND` row with positive points is added. On approve: Approved, then Paid.
- Payout methods: bKash, Nagad, bank.
- Note: the sequence diagram for redemption (`WRR_Sequence_Diagrams_Source.py`, diagram 3) does not show the REDEEM and REFUND ledger rows. **Follow the rule above (FR-15 and FR-21), not the diagram.**

**Notifications (in-website only):** create a `notifications` row on Assigned (for the collector), Accepted, Rejected, Collected and Completed (with points earned), and on redemption Approved, Rejected or Paid. The UI shows an unread count and lets users mark notifications read.

**Waste categories (seed):** Plastic, Paper & Cardboard, E-waste, Metal, Glass, Other Recyclable Waste (`is_other = true`).
Example rates for test data only: 10, 6, 25, 15, 4, 5 points/kg. Example rule: `taka_per_point = 0.50`, `min_points = 100`.

## 4. Database (MySQL, 10 tables)

The full `CREATE TABLE` script is in `WRR_Revised_Requirements_and_Design.md` §6.1. Use it as-is for `database/schema.sql`. It has not been run on a real MySQL server yet, so run it first and fix any errors.

| Table | Key columns |
|---|---|
| `zones` | zone_id PK, name UK, description, is_active |
| `users` | user_id PK, full_name, email UK, phone, password_hash, role ENUM(user, collector, admin), address, zone_id FK, status ENUM(active, inactive), created_at |
| `waste_categories` | category_id PK, name UK, points_per_kg, is_other, is_active |
| `pickup_requests` | request_id PK, user_id FK, category_id FK, zone_id FK, collector_id FK NULL, pickup_address, contact_phone, other_description, estimated_weight_kg, preferred_at, status ENUM(7 statuses), created_at, updated_at |
| `request_status_logs` | log_id PK, request_id FK, changed_by_id FK, old_status, new_status, note, changed_at |
| `collection_records` | record_id PK, request_id FK UK, collector_id FK, actual_weight_kg, points_per_kg_applied, collected_at, completed_at, remarks |
| `reward_transactions` | transaction_id PK, user_id FK, txn_type ENUM(EARN, REDEEM, REFUND, ADJUST), record_id FK NULL, redemption_id FK NULL, points (signed), created_at |
| `redemption_rules` | rule_id PK, taka_per_point, min_points, is_active, updated_by FK, effective_from |
| `cash_redemptions` | redemption_id PK, user_id FK, rule_id FK, points_redeemed, cash_amount, payout_method, payout_account, status ENUM(Pending, Approved, Rejected, Paid), admin_id FK NULL, admin_note, requested_at, processed_at |
| `notifications` | notification_id PK, user_id FK, request_id FK NULL, redemption_id FK NULL, type, message, is_read, created_at |

## 5. REST API (endpoints already used in the sequence diagrams; keep these names)

```
POST   /api/auth/register            POST /api/auth/login
GET    /api/categories               (active only, for users)

# User
POST   /api/pickup-requests          GET /api/pickup-requests/mine
PUT    /api/pickup-requests/:id/cancel   (Pending only)
GET    /api/rewards/balance          GET /api/rewards/history
POST   /api/redemptions              GET /api/redemptions/mine

# Collector
GET    /api/collector/requests?zone=&status=
PUT    /api/pickup-requests/:id/accept
PUT    /api/pickup-requests/:id/reject   (body: reason)
POST   /api/collection-records           (request_id, actual_weight_kg → status Collected)
PUT    /api/pickup-requests/:id/complete (→ Completed + EARN + notification)
GET    /api/collector/history?from=&to=&category=

# Any logged-in role
GET    /api/notifications            PUT /api/notifications/:id/read

# Admin
GET    /api/admin/pickup-requests?status=&zone=     (assignment queue)
PUT    /api/pickup-requests/:id/assign              (body: collector_id)
GET    /api/admin/users?role=&status=               PUT /api/admin/users/:id   (status, zone_id)
POST   /api/admin/collectors
GET    /api/admin/zones      POST /api/admin/zones      PUT /api/admin/zones/:id
GET    /api/admin/categories POST /api/admin/categories PUT /api/admin/categories/:id
GET    /api/admin/redemption-rules  POST /api/admin/redemption-rules (deactivates the old rule)
GET    /api/admin/redemptions?status=               PUT /api/redemptions/:id  (approve | reject | paid)
GET    /api/admin/collection-records                PUT /api/admin/collection-records/:id (weight correction)
GET    /api/admin/reports/:type?from=&to=&zone=&category=
```
Reports (FR-17): kg collected by category, zone and date; requests by status; collector performance (completed, kg, rejection rate); points issued vs redeemed; redemptions by status. Reports can be printed or exported.

## 6. Non-functional targets

- Responses ≤ 2 s and reports ≤ 5 s, with 50 concurrent users.
- HTTPS. Parameterized SQL only (no string-built queries). Escape all output (XSS). Role checks on the server. Rate-limit login.
- Responsive from 360 px wide. Works in Chrome, Firefox and Edge.
- Layered code: `routes → controllers → services → models`. Configuration in `.env` (never commit it; provide `.env.example`). Document the APIs.

## 7. Suggested folder structure

```
backend/
  src/ app.js, config/db.js, middleware/(auth.js, role.js, error.js),
       routes/, controllers/, services/, models/
  package.json, .env.example
database/
  schema.sql, seed.sql
frontend/
  index.html, login.html, register.html
  user/ (dashboard, new-request, requests, history, redeem, notifications)
  collector/ (dashboard, requests, record-weight, records)
  admin/ (dashboard, users, collectors, requests, zones, categories, rules, redemptions, records, reports)
  css/, js/ (api.js wraps fetch + JWT)
docs/   (requirements, design, diagrams, test cases, report)
```

## 8. Design artifacts already finished (in the claude.ai project; some may be in `docs/`)

- `WRR_Revised_Requirements_and_Design.md`: FR-01 to FR-21, NFR-01 to NFR-08, domain rules, status lifecycle, the DDL, and survey traceability
- `WRR_PRD.md` (v1.2.0): product requirements document with the full API table, timeline and test plan
- Architecture diagram (`WRR_Architecture_Revised.svg` / `.dot`)
- ER diagram (`WRR_ER_Diagram_A4.svg`, Mermaid source `WRR_ER_Diagram_Revised.mmd`). **Outdated:** it still shows the original columns and must be redrawn to the 10-table schema in §4.
- Class diagram (`WRR_Class_Diagram_A4.svg` / `.dot`): abstract `User` with subclasses GeneralUser, WasteCollector and Administrator, plus enums RequestStatus, RedemptionStatus, AccountStatus and TxnType
- Use case diagram (`WRR_Use_Case_Diagram.svg`)
- DFD Level 0 and Level 1 (`WRR_DFD_Source.py`): processes 1.0 to 8.0 and data stores D1 to D10, matching the 10 tables. Not used in the report's System Design section.
- Sequence diagrams ×3 (`WRR_Sequence_Diagrams_Source.py`): submit and assign; collect and reward; cash redemption
- Activity diagrams ×2 (`WRR_Activity_Diagrams_Source.py`): pickup to reward; cash redemption
- Original PDFs: proposal, survey questionnaire, filled client survey, requirement analysis, requirements & design

## 9. Remaining work (Waterfall order)

1. **Design fix:** redraw the ER diagram to the revised 10-table schema.
2. **Implementation:** set up the database (schema and seed), then the backend (auth → requests → collection and rewards → redemptions → notifications → admin and reports), then the frontend per role.
3. **Testing:** unit tests for the status transitions, points formula, redemption validation (including two concurrent redemptions) and weight correction (ADJUST + audit row, negative-balance refusal); API integration tests; a manual test-case table (ID, FR, steps, expected, actual, pass/fail) for the lab report.
4. **Documentation:** the final Software Engineering Lab Report (intro, SDLC, requirements, design with all diagrams, implementation with screenshots, testing, conclusion).

## 10. Working conventions for Claude

- Keep the code simple and readable. This is a student lab project that has to be explained in a viva.
- Don't add features outside the FRs without asking. Don't change the tech stack.
- When a rule here conflicts with an older PDF, this file and the revised `.md` win.
- The user writes in English and sometimes in Banglish (romanized Bengali). Reply in the language they use.
