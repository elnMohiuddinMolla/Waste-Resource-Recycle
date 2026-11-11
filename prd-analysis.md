# Product & Business Requirements Analysis Report
## Project: Waste Resource Recycle (WRR) Management System
**Prepared by:** Senior Product Analyst & Business Analyst  
**Document Version:** 1.1.0  
**Date:** November 11, 2026  
**Context:** CSE-3112 Software Engineering Lab, Faridpur Engineering College  
**Reference Documents:** `WRR_PRD.md` (v1.3.0), `api-spec.md`, `database.md`, `WRR_Project_Idea.md`  
**Note:** This analysis was written against PRD v1.1.0. §10 records which recommendations were adopted in v1.3.0 and which are future work.

---

## 1. Executive Summary & Overview of the PRD

The **Waste Resource Recycle (WRR)** platform addresses a critical urban environmental and socio-economic challenge in Bangladesh: informal, trackless, and un-incentivized domestic recyclable waste disposal. 

The current PRD (`WRR_PRD.md`) is exceptionally well-structured for an academic engineering project. It clearly aligns with:
- **Waterfall SDLC** constraints.
- **Three-Tier Architecture** (Vanilla HTML/CSS/JS $\to$ Node.js/Express.js $\to$ MySQL).
- **Relational Ledger Integrity** (ACID transactional guarantees for points and anti-double-spend locks on cash redemptions).

### Key Strengths of Current PRD:
1. **Financial & Reward Precision:** The signed points ledger (`reward_transactions` with `EARN`, `REDEEM`, `REFUND`, `ADJUST`) and snapshot valuation (`points_per_kg_applied`) prevent historical data corruption and retroactive accounting bugs.
2. **Defensive State Machine:** The strict request lifecycle (`Pending` $\to$ `Assigned` $\to$ `Accepted` $\to$ `Collected` $\to$ `Completed`) with immutable transition logging (`request_status_logs`) provides complete operational auditability.
3. **Traceability:** Direct tracing back to client survey gap-fixes (G1–G13) ensures academic rigor for viva defense.

---

## 2. Product Goals, KPIs & Business Objectives Analysis

### 2.1 Strategic Alignment
| Objective Dimension | PRD Goal | Business / Product Analysis Assessment |
|---|---|---|
| **Social / Environmental** | Divert recyclables from open dumps into circular economy | **Strong:** Focus on 6 core municipal categories (Plastic, Paper, E-waste, Metal, Glass, Other) covers $>80\%$ of household solid recyclable bulk. |
| **User Incentive** | Reward points redeemable for mobile cash (bKash/Nagad/Bank) | **High Viability:** Direct monetary return is the primary driver for household waste segregation in emerging markets. |
| **Operational Efficiency** | Digitize collector routing by municipal zones | **Feasible:** Zone-based grouping reduces collector travel overhead without requiring complex GPS routing algorithms. |
| **Academic / Viva Defense** | Clean, explainable, zero-framework architecture | **Excellent:** Vanilla JS + Express + MySQL allows complete code transparency during project defense without framework bloat. |

### 2.2 KPI Realism & Measurement Audit
- **Turnaround Time ($< 48$ hours, suggested KPI — not a PRD requirement):** Realistic only if collector assignment and acceptance are actively monitored by the Administrator. If an Admin delays assignment, the 48-hour SLA will breach.
- **Ledger Zero-Discrepancy ($100\%$):** Achievable via atomic database transactions (`START TRANSACTION ... COMMIT`) and row-locking (`SELECT ... FOR UPDATE`).
- **Response Time ($\le 2$s for 50 concurrent users):** Fully attainable with `mysql2` connection pooling and indexed foreign keys (`INDEX idx_req_status`, `INDEX idx_rt_user`).

---

## 3. User Personas & Role Analysis

| User Role | Current PRD Definition | Business Analyst Insights & Edge-Case Vulnerabilities |
|---|---|---|
| **General User** (Household Resident) | Submits requests, tracks status, views point balance, redeems cash. | • **Single-request limitation:** Households often accumulate mixed recyclables (e.g., 5 kg plastic + 10 kg old newspapers). Under current design, they must make multiple separate requests.<br>• **Account Recovery:** No self-service password reset flow is defined if a resident forgets their password. |
| **Waste Collector** (Field Agent) | Views assigned queue, accepts/rejects, weighs on-site, marks completed. | • **Absence of On-Site Failure Flow:** What if the collector arrives and the resident is not home, the phone is unreachable, or waste is contaminated? There is currently no `Failed` / `Cancelled by Collector` state.<br>• **Capacity Breach:** If a resident drastically underestimated weight (e.g., estimated 5 kg, actual 120 kg), can the collector perform a partial pickup? |
| **Administrator** (Operations Manager) | Assigns collectors, sets point rates, processes cash redemptions, audits records. | • **Bottleneck Risk:** Admin is the sole bridge between `Pending` and `Assigned`. If the admin is offline, pickups stall.<br>• **Financial Reconciliation:** Cash disbursement is marked manually (`Paid`). The admin needs clear payout account details and transaction IDs to avoid manual accounting errors. |

---

## 4. Deep-Dive Gap Analysis & Missing Requirements

As a Senior Product & Business Analyst, I have identified **7 critical functional and operational gaps** that should be resolved or clarified:

### 4.1 Gap 1: Missing "On-Site Collection Failure" State (Critical Operational Gap)
- **Current Flow:** `Accepted` $\to$ `Collected` (requires `actual_weight_kg > 0`) $\to$ `Completed`.
- **The Real-World Problem:** What happens if the collector arrives at the house and:
  1. The resident is unavailable / unreachable after multiple calls.
  2. The resident refuses to hand over the waste.
  3. The waste is severely contaminated with organic/hazardous refuse and cannot be recycled.
- **Current System Limitation:** The collector is trapped in `Accepted` state or forced to enter dummy weight.
- **Recommended Solution:** Introduce an exception outcome from `Accepted`:
  - Either allow collector to cancel with a mandatory reason note: `Accepted` $\to$ `Cancelled` (with `note = 'Resident unreachable at scheduled time'`).
  - Or add a dedicated status: `Failed` / `Unsuccessful`.

### 4.2 Gap 2: Single Category per Request vs. Mixed Household Waste (Usability Gap)
- **Current Flow:** `pickup_requests` has a single `category_id INT NOT NULL`.
- **The Real-World Problem:** Domestic households typically clean their storeroom or kitchen and have *both* plastic bottles and paper/cardboard boxes at the same time. Requiring a resident to fill out two distinct forms with separate pickup times causes user friction and multiple trips for the collector.
- **Recommendation for CSE-3112 Scope:**
  - *Option A (Keep Simple for Lab):* Keep single-category requests, but allow the user to select the "Other Recyclable Waste" category and describe mixed items in `other_description`.
  - *Option B (Recommended for Presentation):* Allow multiple requests to be scheduled at the same `preferred_at` timestamp and allow Admin to assign them as a batch to the same collector.

### 4.3 Gap 3: Rescheduling & Cancellation Boundaries (Lifecycle Gap)
- **Current Flow:** User can cancel only while status is `Pending` (`FR-06`).
- **The Problem:** What if the resident has an emergency after the collector has `Accepted` the job? Currently, the user has zero options in the UI to cancel or reschedule.
- **Recommendation:** 
  - User can cancel freely while `Pending`.
  - If status is `Assigned` or `Accepted`, allow user to request cancellation or rescheduling, which triggers a notification to Admin/Collector with a note.

### 4.4 Gap 4: Collector Response Timeout / Stale Assignment (Operational Gap)
- **Current Flow:** Admin assigns request $\to$ status becomes `Assigned`. Collector decides to Accept or Reject.
- **The Problem:** What if the assigned collector ignores the request or has an inactive phone? The request remains stuck in `Assigned` indefinitely, leaving the resident waiting past their `preferred_at` time.
- **Recommendation:** Admin dashboard must highlight `Assigned` requests that have remained unaccepted for $> 12$ hours or whose `preferred_at` is approaching, allowing one-click reassignment.

### 4.5 Gap 5: Payout Transaction ID & Audit Trail (Financial Compliance Gap)
- **Current Flow:** Admin reviews redemption $\to$ marks status as `Paid`.
- **The Problem:** When an admin pays 500 BDT via bKash or Nagad, how does the user or auditor verify that the money was actually sent?
- **Recommendation:** Add a `payout_reference_id` (or `transaction_trx_id`) column/input when the Admin marks a redemption as `Paid`. The user can then cross-reference this TrxID in their bKash/Nagad SMS!

### 4.6 Gap 6: Password Reset & Account Recovery (Security/Usability Gap)
- **Current Flow:** Registration stores bcrypt hash; login validates credentials.
- **The Problem:** No password reset mechanism exists.
- **Recommendation for Student Lab Scope:** Rather than implementing an external SMTP email server or SMS OTP gateway, add an Admin action: **"Reset User Password"** (Admin sets a temporary password or resets it to a default like `pass1234` on user request).

### 4.7 Gap 7: Minimum / Maximum Weight Thresholds
- **Current Flow:** `estimated_weight_kg > 0` and `actual_weight_kg > 0`.
- **The Problem:** What if a user requests a pickup for 0.1 kg (100 grams) of plastic? The transportation cost and collector time vastly exceed the material value.
- **Recommendation:** Establish a reasonable minimum collection weight guideline (e.g. minimum 2 kg or 3 kg) in the UI guidelines.

---

## 5. Non-Functional Requirements (NFR) Validation

| NFR Attribute | PRD Target | Senior Analyst Feasibility & Risk Assessment |
|---|---|---|
| **NFR-01: Usability** | $\le 3$ screens to submit request | **Compliant:** Step 1: Login/Dashboard $\to$ Step 2: Click "New Request" $\to$ Step 3: Fill form & confirm. |
| **NFR-02: Performance** | $\le 2$s normal, $\le 5$s reports (50 users) | **Compliant:** Indexing on `status`, `user_id`, `collector_id`, `zone_id` ensures query execution $< 50\text{ms}$ on MySQL 8. |
| **NFR-03: Security** | bcrypt (cost 10), parameterized SQL, rate limiting | **Compliant:** Using `bcryptjs`, prepared statements in `mysql2`, and `express-rate-limit` satisfies this standard completely. |
| **NFR-04: Reliability** | ACID transactions, balance $\ge 0$ | **Compliant:** Explicit MySQL transactions with rollback handlers guarantee zero orphan reward records. |
| **NFR-05: Availability** | 8 AM – 10 PM BST, 99% uptime | **Realistic:** Aligns with municipal daylight working hours in Bangladesh. |
| **NFR-06: Compatibility** | Mobile & Desktop $\ge 360$px | **Compliant:** Pure CSS Flexbox/Grid ensures clean rendering on smartphones and desktops without external heavy UI kits. |
| **NFR-07: Maintainability**| Layered code (`routes -> controllers -> services -> models`) | **Compliant:** Directly facilitates viva explanation and modular feature testing. |
| **NFR-08: Auditability** | Status and weight correction logging | **Compliant:** `request_status_logs` and `reward_transactions` provide an unalterable chronological timeline. |

---

## 6. Actionable Recommendations for Implementation

1. **Add `payout_trx_id` to Cash Redemptions:** Provide a field for Admin to record the bKash/Nagad Transaction ID when marking a redemption as `Paid`.
2. **Handle On-Site Collector Abort (`Accepted -> Cancelled` with reason):** Allow collector to abort if the household is unreachable, setting status to `Cancelled` with mandatory explanatory note.
3. **Admin Quick-Filter for Delayed Requests:** Add a tab in Admin dashboard: *"Overdue / Stale Assignments"* (requests in `Assigned` state $> 12$ hours).
4. **Admin-Assisted Password Reset:** Add an endpoint such as `PUT /api/v1/admin/users/:id/reset-password` for academic simplicity instead of an external email server.
5. **UI Minimum Weight Helper:** In the request submission form, suggest a minimum recommendation of 2 kg to ensure practical field operations.

---

## 7. Strategic Decisions Resolved with Stakeholder

The key operational decisions were reviewed and confirmed by the project owner:

| Decision Area | Selected Strategy | Rationale & Implementation Impact |
|---|---|---|
| **1. On-Site Collection Abort** | **Option A (Approved):** Collector can mark the request as `Cancelled` with a mandatory reason note. | If resident is unreachable, absent, or waste is uncollectable/contaminated, the collector sets status $\to$ `Cancelled` with an explicit reason logged in `request_status_logs`. This prevents collector queue lockup without corrupting the reward ledger. |
| **2. Cash Payout Verification** | **Option A (Approved):** Include a `payout_trx_id` field. | When the Admin executes cash disbursement via bKash/Nagad/Bank and marks status $\to$ `Paid`, they record the MFS/Bank Transaction ID. The user can view this TrxID in their portal to verify receipt in their mobile wallet. |
| **3. Multi-Category Household Waste** | **Option A (Approved):** Keep 1 category per pickup request (CSE-3112 scope). | Keeps the database schema and UI clean and robust for lab evaluation. If a household has multiple waste types, they submit separate requests for the same schedule or select "Other Recyclable Waste" with details in `other_description`. |

---

## 8. Critical Review & Audit Findings (Business Logic & Missing Requirements)

A comprehensive architectural and business audit identified the following operational findings and potential friction points:

### 8.1 Business Logic Loopholes
1. **Pre-Collection Rescheduling / Emergency Cancellation:**
   - *Current State:* User can only cancel while `Pending`. Once `Assigned` or `Accepted`, the user cannot cancel or change `preferred_at`.
   - *Finding:* If a household experiences an emergency before collection, they cannot adjust the pickup time in-app. The collector will travel to the premises unnecessarily.
   - *System Recommendation:* Introduce a "Request Reschedule" option while in `Accepted` status that notifies the collector and updates the schedule upon mutual agreement.
2. **Weight Correction Dispute Window:**
   - *Current State:* Admin can modify `actual_weight_kg` at any arbitrary time via `FR-18`.
   - *Finding:* Making downward adjustments months after a collection damages user trust and complicates ledger tracking.
   - *System Recommendation:* Establish a formal dispute window (e.g., maximum 7 days post-completion) for weight modifications.
3. **Points Expiration & Balance Sheet Liability:**
   - *Current State:* Unredeemed points remain in `reward_transactions` indefinitely.
   - *Finding:* In commercial loyalty/recycling models, unredeemed points represent ongoing financial liabilities. For an academic scope, lifetime points are acceptable, but a formal policy should be noted in documentation.
4. **Lightweight Recyclable Volume vs. Weight Misalignment:**
   - *Current State:* Rewards are strictly calculated by scale weight ($\text{kg} \times \text{rate}$).
   - *Finding:* Materials like empty PET bottles occupy massive vehicle space with negligible weight (e.g. 1.5 kg for an entire van-load). Collectors may experience disincentives to collect bulky, low-weight items.

### 8.2 Operational & Functional Gaps
1. **Collector Workload & Assignment Capacity:**
   - *Current State:* Admin manually assigns requests without system-enforced workload caps.
   - *Finding:* An active collector could inadvertently be assigned 25+ requests in a single morning, resulting in missed schedules and SLA breaches.
   - *System Recommendation:* Display active workload count (e.g. *"Rafiqul: 4 Active Jobs"*) in the Admin assignment modal.
2. **Cross-Zone Emergency Assignment Guidelines:**
   - *Current State:* `pickup_requests.zone_id` defaults to preferred collector matching.
   - *Finding:* In the event of sick leave or zero collector availability in a zone, clear cross-zone assignment priority indicators should assist the Admin.
3. **User Profile Self-Management:**
   - *Current State:* User registers address and phone, but lacks an explicit profile update route (a future `PUT /api/v1/auth/me`).
   - *System Recommendation:* Provide basic profile update capabilities for contact phone and primary address.

---

## 9. Summary Conclusion

With the resolution of core architectural decisions and the formal documentation of these audit findings, the specification provides a complete, battle-tested blueprint balancing academic simplicity for CSE-3112 with production-grade business logic.

---

## 10. Adoption Status (PRD v1.3.0)

| Item | Status | Where |
|---|---|---|
| Gap 1 / Rec. 2 — Collector on-site abort | **Adopted** | PRD §5.1 (T7), FR-08; `PUT /api/v1/collector/requests/:id/abort` |
| Gap 5 / Rec. 1 — Payout transaction ID | **Adopted** | `cash_redemptions.payout_trx_id`, required for `Paid` (FR-21) |
| Gap 2 — Multi-category requests | **Decided: keep one category** (Decision 3) | PRD FR-03 |
| Gap 3 / §8.1.1 — User cancel or reschedule after assignment | Future work | — |
| Gap 4 / Rec. 3 — Stale assignment highlight | Future work (UI only) | — |
| Gap 6 / Rec. 4 — Admin password reset | Future work | — |
| Gap 7 / Rec. 5 — Minimum weight hint | Future work (UI hint only, no rule) | — |
| §8.1.2 — Weight correction window | Future work | — |
| §8.1.3 — Points expiry | Not planned; points never expire | — |
| §8.2.1 — Collector workload count | Future work (UI only) | — |
| §8.2.3 — Profile self-update | Future work | — |
| 48-hour turnaround KPI | Not a requirement | — |

