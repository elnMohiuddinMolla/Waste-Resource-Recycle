# Viva Notes — Waste Resource Recycle (WRR)

Short answers for the CSE-3112 viva. Every point here matches the code; the file to open in front of the examiner is given in brackets.

---

## 1. Architecture in one paragraph

WRR is a three-tier web application. The **presentation tier** is plain HTML, CSS and JavaScript (ES modules, no framework). It is served by the same Express server, so the browser and the API share one origin and no CORS is needed. The **application tier** is Node.js + Express under `/api/v1`, built in four layers:
- **routes** pick the URL and the allowed role;
- **controllers** read and validate the input;
- **services** hold the business rules and transactions;
- **models** contain all the SQL.

A controller never touches the database, and a service never contains SQL. The **data tier** is MariaDB (XAMPP) with 10 InnoDB tables, foreign keys, CHECK constraints and two generated-column unique keys. Login uses a JWT in an HttpOnly cookie. Each request checks the role and that the account is still active.

```
Browser (HTML/CSS/JS) ──fetch /api/v1──> routes → controllers → services → models ──SQL──> MariaDB
        ▲                                   (auth + role)  (validate)  (rules, transactions)
        └──────── express.static(frontend/) ── same server, same origin
```

---

## 2. How a request moves through the 8 transitions

There are 7 statuses and exactly 8 allowed moves (`services/requestStateMachine.js`). Anything else is answered with **409 Conflict**.

| # | Move | Who | What else happens |
|:---:|---|---|---|
| T1 | Pending → Assigned | Admin | Collector must be active; `PICKUP_ASSIGNED` to the collector |
| T2 | Rejected → Assigned | Admin | Reassignment, same checks |
| T3 | Pending → Cancelled | User (owner) | Only while Pending |
| T4 | Assigned → Accepted | Assigned collector | User is told the collector is coming |
| T5 | Assigned → Rejected | Assigned collector | Reason 5–200 characters; `collector_id` cleared; back to the admin queue |
| T6 | Accepted → Collected | Assigned collector | Collection record with actual kg and the rate snapshot |
| T7 | Accepted → Cancelled | Assigned collector | On-site abort with a reason (resident absent, not recyclable) |
| T8 | Collected → Completed | Assigned collector | One transaction: status + `completed_at` + `EARN` points + log + notification |

Every move writes one row to `request_status_logs`: old status, new status, who made the change, the note, and the time. The request row is locked first (`pickup.model.findByIdForUpdate`), so two clicks at the same moment cannot both move it.

---

## 3. How double-spending is prevented

Points are never stored as a single number. The **balance = SUM(points)** of a signed ledger (`reward_transactions`):

| Type | Sign | When |
|---|:---:|---|
| EARN | + | Pickup completed |
| REDEEM | − | Redemption submitted (points held at once) |
| REFUND | + | Redemption rejected |
| ADJUST | ± | Admin corrects a weight |

There are three protections:
1. **Row lock.** Submitting a redemption starts a transaction and runs `SELECT user_id FROM users WHERE user_id = ? FOR UPDATE` (`user.model.lockById`). A second redemption from the same user waits until the first one commits. It then sees the lower balance and gets **422**.
2. **REDEEM hold.** The points are taken with a `REDEEM` row when the request is made, not when it is paid. The money can therefore never be promised twice. If the admin rejects it, a `REFUND` row gives the points back.
3. **Unique EARN.** The generated column `earn_record_id` (= `record_id` only for EARN rows) has a UNIQUE index. Even if "complete" ran twice, the database would refuse a second EARN for the same record.

The same idea protects weight corrections. A downward correction that would push the balance below 0 is refused with **422**, and nothing is changed (EC-01).

---

## 4. Why rates are snapshotted

When the collector records the weight, the category's current `points_per_kg` is copied into `collection_records.points_per_kg_applied`. In the same way, a redemption stores its `rule_id` and `cash_amount` when it is requested.

- The admin can change prices at any time without changing points already earned or money already promised. History stays true (FR-11, EC-06).
- Points and cash can always be recomputed from the row itself: `ROUND(actual_weight_kg × points_per_kg_applied, 2)`.
- A category can be deactivated while a job is in progress. The job still finishes at its snapshotted rate (EC-03).

---

## 5. Why the JWT is in an HttpOnly cookie

- **HttpOnly:** JavaScript cannot read the cookie, so an XSS bug cannot steal the session. `localStorage` would be readable by any script.
- **SameSite=Lax:** the browser does not send the cookie on cross-site POST/PUT requests, which blocks CSRF.
- **Same origin:** the frontend and API are on the same server, so the cookie is sent automatically. The token never appears in a response body.
- **7-day expiry**, signed with a `JWT_SECRET` of at least 32 characters. The server refuses to start with a weak or example secret.
- **Status checked on every request:** the middleware reloads the user. A deactivated account gets 403 on its very next request, even with a valid token.

---

## 6. Twenty likely examiner questions

1. **Why Waterfall?** The requirements came from a survey and were fixed early (PRD v1.3.0). Each phase — requirements, design, implementation, testing — has its own documents, which suits a lab course with fixed deliverables.

2. **Why no React or another framework?** The proposal fixed the stack to plain HTML/CSS/JS. The site has ~23 small pages, so a framework would add build tools without real benefit. Every line is easy to explain.

3. **What is the difference between a controller and a service?** A controller reads `req`, validates input and sends the response. A service holds the business rules and the transaction. Example: `redemption.service.submit` checks the balance under a lock.

4. **Why are all queries parameterized?** User input is sent as a `?` value, never joined into SQL text, so it cannot change the query. That blocks SQL injection (NFR-03). The only dynamic SQL pieces are fixed column names written in the models.

5. **How is the password stored?** As a bcrypt hash with cost 10, never as plain text, and the hash is never returned. For an unknown email the server still compares against a dummy hash, so the answer and the timing are the same as for a wrong password.

6. **How does the login rate limit work?** `express-rate-limit` allows 5 failed attempts per IP in 15 minutes. The 6th attempt gets 429. Successful logins are not counted.

7. **What happens if the server crashes in the middle of completing a job?** Completion runs in one transaction (`utils/transaction.js`: BEGIN … COMMIT, ROLLBACK on error). Either the status, `completed_at`, EARN row, log and notification are all saved, or none are.

8. **Why is the balance not a column in `users`?** A stored balance can drift from the history. A sum of the ledger is always right and shows where every point came from (auditability, NFR-08).

9. **How do you guarantee only one active redemption rule?** The generated column `active_key` is 1 for the active rule and NULL otherwise, and it has a UNIQUE index. Switching rules locks all rules, deactivates them and inserts the new one in one transaction.

10. **What is the difference between 409 and 422?** 409 means the state does not allow the action (for example, completing a Pending request). 422 means the input is valid but breaks a business rule (balance too low, below minimum points, correction would go negative).

11. **Why does a collector who rejects lose the job?** T5 clears `collector_id`, so the request returns to the admin queue and can be reassigned (T2). The rejection reason is stored in the log for the admin and the user.

12. **How does a user know what happened?** Each of the 11 events in FR-14 creates a notification row. The header badge polls the unread count every 30 seconds, and the timeline shows every status change.

13. **Why don't admins get notifications?** Admins work from queues. The dashboard shows live counts of Pending/Rejected requests and Pending/Approved redemptions, which is more useful than one message per event.

14. **How is XSS prevented?** User text is put on the page with `textContent`, never `innerHTML`. The Content-Security-Policy allows only same-origin scripts and blocks inline code, so the pages use separate `.js` files and `addEventListener`.

15. **How is one user stopped from seeing another user's request?** Every query for a user's data includes the owner's id. A request that is not yours returns 404, not 403, so its existence is not revealed.

16. **What happens when the admin corrects a weight?** In one transaction: the new weight is saved, an ADJUST row of `ROUND(new kg × rate, 2) − points already posted` is written, and the status log gets "Weight corrected from X kg to Y kg" with the admin's id.

17. **How did you test it?**
    - 20 unit tests and 103 API tests on a separate `wrr_test` database, all passing.
    - A 45-check end-to-end story.
    - 352 static page checks.
    - A real Chrome run of the browser checklist at 360 px and 1280 px.
    - A performance test with 50 concurrent users: slowest call ~150 ms (limit 2 s).

18. **How are the reports computed?** Five SQL queries (`report.model.js`, same text as `database.md` §6) with GROUP BY, SUM and a window function for percentages. Dates default to the current month in Bangladesh time. The page can print on A4 and export CSV.

19. **How do you handle time zones?** Every database connection sets `time_zone = '+06:00'`, and the API reads and writes `YYYY-MM-DD HH:mm:ss` in Bangladesh time. `preferred_at` must be strictly in the future.

20. **What would you add next?** HTTPS and deployment with uptime monitoring (NFR-03.2, NFR-05), SMS for collectors, a map view of pickups, and automatic bKash/Nagad payouts through their APIs. These are listed as future work in `requirement-validation.md`.

---

## 7. Numbers to remember

| Item | Value |
|---|---|
| Tables | 10 |
| API endpoints | 44 under `/api/v1` |
| Pages | 23 (3 public, 6 user, 4 collector, 10 admin) |
| Request statuses / transitions | 7 / 8 |
| Notification types | 11 |
| Reports | 5 |
| Tests | 20 unit + 103 API (100 % pass), 45 e2e checks |
| Seed rates | Plastic 10, Paper 6, E-waste 25, Metal 15, Glass 4, Other 5 points/kg; ৳0.50 per point, minimum 100 points |
