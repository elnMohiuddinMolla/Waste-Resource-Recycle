# End-to-End Walkthrough & NFR Checks (prompt.md ✅ "Enter a valid Bangladeshi mobile number" ✅ ✅ 3 screens, request #4, 120 points estimate ✅ ✅ Rafiqul (same zone) first ✅ "Completed — 150.00 points credited" ✅ badge 4 → cleared ✅ ৳50.00, balance 150 → 50 ✅ TrxID BKBROWSER01 ✅ preview −10.00, ledger ADJUST −10.00 ✅ 5/5 ✅ (after fix 2, see §3) ✅ ✅ ✅ ✅ ✅ (after fix 1) ✅ dialog 16–344 px of 360 ✅ (PDF, A4) ✅ BOM + Total row; Excel *to do* |
|
|
|
|
|
|
|
|
|
|
|
|
|
|
|
|
|
|
|
D1)

**Project:** Waste Resource Recycle (WRR) — CSE-3112 Software Engineering Lab
**Date:** 11 November 2026
**Build:** commit after `5e339b8` (all 44 endpoints, 23 pages). *Sections 1–3 record that run. Features added later (waste photo, help & support: 50 endpoints, 26 pages) are covered in `docs/test-cases.md` TC-51–TC-56.*

This document has two parts:

1. **Automated walkthrough** — the full story run through the same API calls the web pages make (`npm run e2e`), plus a static check of every page (`npm run check:frontend`). Both were run and passed.
2. **Browser checklist** — run on 11 Nov 2026 in real Google Chrome 157 (headless, driven through the Chrome DevTools Protocol) against a freshly seeded `wrr_test` on a separate server: every form was filled and every button clicked in the page. Firefox and Edge, and opening the CSV in Excel, are still to be done by hand (marked *to do*).

---

## 1. Automated results

### 1.1 Story walkthrough — `npm run e2e` (45 / 45 passed)

Run against a freshly rebuilt `wrr_test` database (seed data), never `wrr_db`.

| # | Step | Checks | Result |
|:---:|---|---|:---:|
| 1 | Register a new user (Nusrat Jahan, Zone 1), log in, load categories, submit a 25 kg Plastic request | 201 + role user; `/auth/me`; 6 categories; request Pending; ≤ 3 screens (NFR-01) | ✅ 5/5 |
| 2 | Admin assigns Kamal → Kamal rejects ("Outside my zone today.") → appears in Rejected queue → admin reassigns Rafiqul → he accepts → weighs 30 kg → completes | queues, each status change, 30 × 10.00 = 300.00 points, full timeline `Pending > Assigned > Rejected > Assigned > Accepted > Collected > Completed` | ✅ 10/10 |
| 3 | User sees 300.00 points (≈ ৳150) and the notifications → redeems 150 points (bKash) → admin approves → marks paid with TrxID `BKE2E0001` | balance; 5 notification types; ৳75.00; points held at once (150.00 left); Approved → Paid; TrxID visible to the user | ✅ 7/7 |
| 4 | Second redemption (100 points, Nagad) → admin rejects with a reason | Rejected; points refunded (balance 150.00) | ✅ 3/3 |
| 5 | Admin corrects the weight 30 → 32 kg, then 32 → 25 kg, then tries 25 → 1 kg | +20.00; −70.00; balance 100.00; last one refused with 422; both corrections in the audit timeline | ✅ 5/5 |
| 6 | Pending redemption of 100 points at ৳0.50 → admin raises Plastic to 12.00 points/kg and activates ৳0.60/point | old collection keeps 10.00 points/kg; pending redemption keeps ৳50.00 | ✅ 5/5 |
| 7 | Run all five reports | each returns data; Kamal shows 1 rejection (100 %) | ✅ 6/6 |
| 8 | Admin deactivates the logged-in user, then reactivates | next action 403; same session works again after reactivation | ✅ 3/3 |
| NFR-03 | Six wrong passwords in a row | `401 ×5`, then `429` | ✅ 1/1 |

### 1.2 Static frontend check — `npm run check:frontend` (352 checks passed)

For all 23 pages and 28 scripts:

| Check | Result |
|---|:---:|
| Viewport meta tag on every page (mobile layout, NFR-06) | ✅ |
| No inline `<script>`, `<style>`, `style=""` or `onclick=""` (would be blocked by the CSP) | ✅ |
| Every script, stylesheet and local link points to a file that exists | ✅ |
| Every JS `import` resolves; every page linked from JS exists | ✅ |
| No `innerHTML` / `insertAdjacentHTML` / `document.write` (XSS, NFR-03) | ✅ |

### 1.3 Other automated evidence

| NFR | Evidence | Result |
|---|---|:---:|
| NFR-02 Performance | `npm run perf`: 50 users, 1,000 requests; slowest core call ~150 ms (limit 2 s), slowest report ~110 ms (limit 5 s), 50 simultaneous submissions ~110 ms | ✅ |
| NFR-03 Security | 103 API tests incl. 401/403/404 ownership checks, security headers, same 401 answer for unknown email and wrong password, server refuses weak JWT secrets | ✅ |
| NFR-04 ACID | Concurrent "complete" credits once; concurrent redemptions cannot overspend; concurrent rule switches leave one active rule (API tests) | ✅ |

---

## 2. Browser checklist

**Before you start**
1. Rebuild a clean `wrr_db` if you want the same numbers as below: in phpMyAdmin import `database/schema.sql`, then `database/seed.sql`. *(This erases what is in `wrr_db` now.)*
2. `cd backend` → `npm run dev` → open http://localhost:5000
3. Accounts (password `password123`): `tanvir@gmail.com` (user), `collector1@wrr.com` (collector), `admin@wrr.com` (admin).
4. Open the browser's developer tools (F12) → **Console**. Any red error during a check is a failure — note it.

Results below are from the Chrome run. To repeat by hand, mark each row ✅ / ❌.

### 2.1 Story in the browser (Chrome)

| # | Do this | Expected | Result |
|:---:|---|---|:---:|
| M1 | Open `/`, click **Create an account**, register with a wrong phone (`123`) | Red message under the phone field; nothing submitted | |
| M2 | Fix the phone and register | Login page opens with "Account created" and the email filled in | |
| M3 | Log in → dashboard → **New pickup request** → fill in → **Submit request** (count the screens) | ≤ 3 screens from login; success panel with request number; estimate shown while typing | |
| M4 | **My requests** → click the new request | Details and a timeline with one "Pending" step; **Cancel request** button visible | |
| M5 | Log out → log in as admin → **Requests** → Pending → open the request → **Assign collector** | Dialog lists collectors, same zone first, with open jobs; after assigning, status Assigned | |
| M6 | Log in as `collector1@wrr.com` → **My jobs** → **Accept** → **Record weight** → type a weight → **Save weight** → **Mark as completed** | Live points preview; after completing, a toast with the credited points | |
| M7 | Back as the user: dashboard and **Notifications** | Balance went up; unread badge in the header; **Mark all as read** clears the badge | |
| M8 | **Redeem** → redeem 100 points (bKash) | Live "You will receive" amount; confirm dialog; redemption shows Pending; balance drops at once | |
| M9 | As admin: **Redemptions** → **Approve** → **Mark paid** with a TrxID | Moves Pending → Approved → Paid; the user sees the TrxID | |
| M10 | As admin: **Records** → **Correct weight** on a completed record (lower it a little) | Live "+/− points" preview; after saving, the user's points ledger shows "Weight correction" | |
| M11 | As admin: **Reports** → each of the 5 reports | Table with a Total row; filters change per report | |
| M12 | As admin: **Users** → deactivate the user; in another browser window logged in as that user, click anything | The user is sent away / sees "Account has been deactivated" | |

### 2.2 Mobile layout (NFR-06) — Chrome DevTools device toolbar (Ctrl+Shift+M), width **360 px**

| # | Page | Expected | Result |
|:---:|---|---|:---:|
| R1 | `/`, `/login.html`, `/register.html` | No sideways scrolling; buttons easy to tap | |
| R2 | Any portal page | Menu folds behind the **Menu** button; it opens and closes | |
| R3 | `user/new-request.html`, `user/redeem.html` | Fields stack in one column | |
| R4 | `collector/requests.html` | Job cards one per row; phone number is a tap-to-call link | |
| R5 | `admin/users.html`, `admin/reports.html` | Tables scroll sideways inside their card, not the whole page | |
| R6 | Any dialog (assign, reject reason, correct weight) | Fits the screen; Cancel and Save visible | |

### 2.3 Browsers (NFR-06)

Repeat M3, M6, M8 and R2 in each browser.

| Browser | Version | Result |
|---|---|:---:|
| Google Chrome | 157 | ✅ all M, R and P checks; all 25 page views at 360 px and 1280 px with no console errors |
| Mozilla Firefox | | *to do* |
| Microsoft Edge | 157 | ✅ responsive check on 12 Nov 2026: all 25 page views at 8 sizes (320, 360, 390, 412, 768, 1024, 1440, 1920 px) = 200 views; no sideways scroll, nothing sticking out, Menu button on phones only, no console errors (after fix 4). Forms were not submitted in Edge. |

### 2.4 Print and export (FR-17)

| # | Do this | Expected | Result |
|:---:|---|---|:---:|
| P1 | Reports → **Print** (A4) | Only the report title, filters and table; no menu, buttons or footer | |
| P2 | Reports → **Export CSV** → open in Excel | Columns line up; the Total row is there; no strange characters | |

---

## 3. Problems found

| # | Where | What happened | Fixed? |
|:---:|---|---|:---:|
| 1 | 6 pages at 360 px (`admin/collectors`, `admin/records`, `admin/reports`, `collector/records`, `user/requests`) | The page was wider than the phone (up to 564 px): date inputs and the table in a grid cell would not shrink | ✅ `min-width: 0` on grid/filter cells and inputs (`css/style.css`) |
| 2 | Any portal page after the admin deactivates the user | User was sent to the login page with no reason given | ✅ login page now says "Your account has been deactivated" (`js/auth.js`, `js/pages/login.js`) |
| 4 | Filter forms at 320 px (Edge) | Two filter columns were too narrow: dates and dropdown text were cut off | ✅ filters use one column below 400 px (`css/style.css`) |
| 3 | `admin/records.html` correction dialog | A deduction (−10.00) is shown in a green box | cosmetic, left as is |

*(Add a row for every ❌ in section 2 and tell the developer/agent.)*

---

## 4. How to repeat the automated part

From `backend/`, with MySQL running:

```
npm test                # 22 unit tests
npm run test:api        # 114 API tests (separate wrr_test database)
npm run e2e             # this walkthrough, 45 checks (wrr_test)
npm run check:frontend  # 453 static checks of the pages (no database)
npm run perf            # NFR-02 timings (wrr_test)
```
