# REST API Specification
## Waste Resource Recycle (WRR) Management System

**Document Version:** 1.1.0  
**Date:** November 11, 2026  
**Base URL:** `/api/v1`  
**Protocol:** HTTPS in deployment; HTTP on `http://localhost:5000` during development. Express serves both the frontend pages and this API from the same origin.  
**Data Format:** `application/json`  
**Related Documents:** [`WRR_PRD.md`](WRR_PRD.md), [`database.md`](database.md), [`architecture.md`](architecture.md)  
**Status:** This file is the single source for endpoint names, payloads and status codes. The PRD only summarises it.  
**Course Context:** CSE-3112 Software Engineering Lab, Faridpur Engineering College  
**Team Members:** MD Mohiuddin Molla (Reg: 2022254878), Abdul Al Noman (Reg: 935)  
**Supervisor:** Mohammad Shamsul Islam  

---

## 1. Global API Standards & Conventions

### 1.1 Authentication & Session Management
- **Mechanism:** the JWT is sent only in a cookie: `token=<JWT>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` (7 days), plus `Secure` when served over HTTPS. The token is never returned in a response body, and frontend JavaScript never reads it. Because pages and API share one origin, `fetch` sends the cookie automatically (`credentials: 'same-origin'`).
- **Testing tools:** Postman/Thunder Client keep the cookie after calling `/auth/login`.
- **Login rate limit:** 5 failed attempts per 15 minutes per IP, then HTTP 429.
- **JWT Payload Schema:**
  ```json
  {
    "user_id": 4,
    "role": "user",
    "iat": 1731326400,
    "exp": 1731931200
  }
  ```
- **RBAC Enforcement:** Access is strictly controlled via `middleware/auth.js` and `middleware/role.js`. On every request the middleware re-reads the user's `status`; deactivated accounts (`status = 'inactive'`) are denied with HTTP 403 Forbidden. The token carries only `user_id` and `role`; status, role and zone are always re-read from `users`.

### 1.2 Standard Response Envelopes

#### Success Envelope (HTTP 200, 201)
```json
{
  "success": true,
  "message": "Operation executed successfully.",
  "data": {}
}
```

#### Error Envelope (HTTP 400, 401, 403, 404, 409, 422, 429, 500)
```json
{
  "success": false,
  "message": "Human-readable explanation of error.",
  "errors": [
    {
      "field": "estimated_weight_kg",
      "message": "Estimated weight must be greater than 0 kg."
    }
  ]
}
```

### 1.3 Date-Time Format
All times are Bangladesh time (+06:00). Requests send `YYYY-MM-DDTHH:mm` (or `YYYY-MM-DD HH:mm:ss`); responses return `YYYY-MM-DD HH:mm:ss`. Some examples below show ISO strings for readability.

### 1.4 Standard HTTP Status Codes
| Code | Meaning | Usage Scenario |
|---|---|---|
| `200 OK` | Success | Successful `GET`, `PUT`, or `PATCH` request. |
| `201 Created` | Created | Successful `POST` resulting in new entity creation. |
| `400 Bad Request` | Validation Error | Missing fields, invalid types or formats, past `preferred_at`. The `errors` array lists each bad field. |
| `401 Unauthorized` | Unauthenticated | Missing or expired JWT token. |
| `403 Forbidden` | Access Denied | Authenticated actor lacks required role (`user`, `collector`, `admin`) or account is `inactive`. |
| `404 Not Found` | Entity Missing | Target record ID does not exist in MySQL. |
| `409 Conflict` | State / Duplicate Conflict | Invalid state transition (e.g. cancelling an `Assigned` request), or a duplicate unique value (email, zone name, category name). |
| `422 Unprocessable Entity` | Business Rule Broken | Insufficient point balance, points below `min_points`, or a weight correction that would make the balance negative. |
| `429 Too Many Requests` | Rate Limited | More than 5 failed logins in 15 minutes from one IP. |
| `500 Server Error` | System Exception | Uncaught runtime error (the transaction is rolled back). |

---

## 2. API Endpoints Master Routing Matrix

| # | HTTP Method | Endpoint Path | Authentication | Allowed Roles | Description |
|:---:|:---:|---|:---:|:---:|---|
| **Auth & Profile** | | | | | |
| 1 | `POST` | `/api/v1/auth/register` | None (Public) | Anyone | General User self-registration. |
| 2 | `POST` | `/api/v1/auth/login` | None (Public) | Anyone | Credentials validation; issues HTTP-Only cookie. |
| 3 | `POST` | `/api/v1/auth/logout` | None | Anyone | Clears the auth cookie (works even if the session has expired). |
| 4 | `GET` | `/api/v1/auth/me` | Required | All Roles | Returns authenticated user profile and role claims. |
| **Catalog & Zones** | | | | | |
| 5 | `GET` | `/api/v1/categories` | None (Public) | Anyone | Lists active waste categories and reward rates. |
| 6 | `GET` | `/api/v1/zones` | None (Public) | Anyone | Lists active municipal service zones. |
| **Pickup Requests (User)** | | | | | |
| 7 | `POST` | `/api/v1/pickup-requests` | Required | `user` | Submits a new recycling pickup job (`Pending`). |
| 8 | `GET` | `/api/v1/pickup-requests/mine` | Required | `user` | Lists authenticated user's submitted requests. |
| 9 | `GET` | `/api/v1/pickup-requests/:id` | Required | `user`, `collector`, `admin` | Retrieves detailed job information & status audit timeline. |
| 10 | `PUT` | `/api/v1/pickup-requests/:id/cancel` | Required | `user` | Cancels request strictly while in `Pending` state. |
| **Collector Operations** | | | | | |
| 11 | `GET` | `/api/v1/collector/requests` | Required | `collector` | Retrieves pickup jobs assigned to the logged-in collector (filter by zone/status). |
| 12 | `PUT` | `/api/v1/collector/requests/:id/accept` | Required | `collector` | Accepts an assigned pickup job (`Accepted`). |
| 13 | `PUT` | `/api/v1/collector/requests/:id/reject` | Required | `collector` | Rejects an assigned job with mandatory reason note. |
| 14 | `PUT` | `/api/v1/collector/requests/:id/abort` | Required | `collector` | On-site cancellation with mandatory reason note. |
| 15 | `POST` | `/api/v1/collector/collection-records` | Required | `collector` | Records physical scale weight & snapshots rate (`Collected`). |
| 16 | `PUT` | `/api/v1/collector/requests/:id/complete`| Required | `collector` | Atomic transaction: completes job and issues `EARN` points. |
| 17 | `GET` | `/api/v1/collector/history` | Required | `collector` | Lists completed pickups and metrics for the logged-in collector. |
| **Rewards & Ledger** | | | | | |
| 18 | `GET` | `/api/v1/rewards/balance` | Required | `user` | Computes live spendable point balance via `SUM(points)`. |
| 19 | `GET` | `/api/v1/rewards/history` | Required | `user` | Lists paginated ledger rows (`EARN`, `REDEEM`, `REFUND`, `ADJUST`). |
| **Cash Redemptions** | | | | | |
| 20 | `GET` | `/api/v1/redemptions/rules/active` | Required | `user`, `admin` | Returns active conversion rate and minimum threshold. |
| 21 | `POST` | `/api/v1/redemptions` | Required | `user` | Submits cash withdrawal; holds points via negative ledger entry. |
| 22 | `GET` | `/api/v1/redemptions/mine` | Required | `user` | Lists user's redemption requests and disbursement states. |
| **Notifications** | | | | | |
| 23 | `GET` | `/api/v1/notifications` | Required | All Roles | Lists in-website alerts with unread badge count. |
| 24 | `PATCH` | `/api/v1/notifications/:id/read` | Required | All Roles | Marks a single notification as read. |
| 25 | `PATCH` | `/api/v1/notifications/read-all` | Required | All Roles | Marks all notifications for authenticated user as read. |
| **Admin Operations** | | | | | |
| 26 | `GET` | `/api/v1/admin/pickup-requests` | Required | `admin` | Lists all platform pickup requests with multi-filters. |
| 27 | `PUT` | `/api/v1/admin/pickup-requests/:id/assign` | Required | `admin` | Assigns an active collector to a pending/rejected request. |
| 28 | `GET` | `/api/v1/admin/redemptions` | Required | `admin` | Lists pending and processed cash redemptions. |
| 29 | `PATCH` | `/api/v1/admin/redemptions/:id` | Required | `admin` | Processes redemption: `approve`, `reject` (+ refund), or `paid` (+ TrxID). |
| 30 | `GET` | `/api/v1/admin/collection-records` | Required | `admin` | Lists certified scale receipts for audit. |
| 31 | `PUT` | `/api/v1/admin/collection-records/:id` | Required | `admin` | Corrects scale weight; updates ledger (`ADJUST`); guards balance. |
| **Admin Governance** | | | | | |
| 32 | `GET` | `/api/v1/admin/categories` | Required | `admin` | Lists all waste categories (active & inactive). |
| 33 | `POST` | `/api/v1/admin/categories` | Required | `admin` | Adds a new recyclable category. |
| 34 | `PUT` | `/api/v1/admin/categories/:id` | Required | `admin` | Updates category point rates and active status. |
| 35 | `GET` | `/api/v1/admin/zones` | Required | `admin` | Lists all zones (active & inactive). |
| 36 | `POST` | `/api/v1/admin/zones` | Required | `admin` | Creates a new municipal operational zone. |
| 37 | `PUT` | `/api/v1/admin/zones/:id` | Required | `admin` | Updates zone boundary name and active status. |
| 38 | `GET` | `/api/v1/admin/redemption-rules` | Required | `admin` | Lists current active conversion rule and archived rules. |
| 39 | `POST` | `/api/v1/admin/redemption-rules` | Required | `admin` | Archives existing rule and activates new conversion rate. |
| 40 | `GET` | `/api/v1/admin/users` | Required | `admin` | Lists user and collector accounts with status filters. |
| 41 | `POST` | `/api/v1/admin/collectors` | Required | `admin` | Provisions a new waste collector account. |
| 42 | `PATCH` | `/api/v1/admin/users/:id/status` | Required | `admin` | Activates or deactivates a user/collector account. |
| 43 | `PATCH` | `/api/v1/admin/users/:id/zone` | Required | `admin` | Updates assigned operational zone for a collector. |
| 44 | `GET` | `/api/v1/admin/reports/:type` | Required | `admin` | Computes 5 SQL analytical and operational KPI reports. |

---

## 3. Module Specifications & Endpoint Contracts

---

### Module 1: Authentication & User Profile

#### 1.1 General User Self-Registration
- **Endpoint:** `POST /api/v1/auth/register`
- **Authentication:** `None (Public)`
- **Request Body:**
  ```json
  {
    "full_name": "Tanvir Ahmed",
    "email": "tanvir@gmail.com",
    "phone": "01811000004",
    "password": "password123",
    "address": "House 14, Road 2, Baitul Aman",
    "zone_id": 1
  }
  ```
- **Validation Rules:**
  - `full_name`: String, 3–100 chars, required.
  - `email`: Valid email format, normalized to lowercase, unique in `users`.
  - `phone`: Bangladeshi 11-digit mobile regex (`^(?:\+8801|01)[3-9]\d{8}$`), required.
  - `password`: Min 8 characters, required (hashed with `bcryptjs`, cost factor 10).
  - `address`: String, max 255 chars, optional (used as the default pickup address).
  - `zone_id`: Valid foreign key reference in `zones` table where `is_active = TRUE`.
- **Response `201 Created`:**
  ```json
  {
    "success": true,
    "message": "User registered successfully.",
    "data": {
      "user_id": 4,
      "full_name": "Tanvir Ahmed",
      "email": "tanvir@gmail.com",
      "phone": "01811000004",
      "role": "user",
      "zone_id": 1,
      "status": "active"
    }
  }
  ```
- **Response `400 Bad Request`:**
  ```json
  {
    "success": false,
    "message": "Validation failed.",
    "errors": [
      { "field": "password", "message": "Password must be at least 8 characters." }
    ]
  }
  ```
- **Response `409 Conflict`:**
  ```json
  {
    "success": false,
    "message": "An account with this email already exists."
  }
  ```

---

#### 1.2 User Login
- **Endpoint:** `POST /api/v1/auth/login`
- **Authentication:** `None (Public)`
- **Request Body:**
  ```json
  {
    "email": "tanvir@gmail.com",
    "password": "password123"
  }
  ```
- **Response `200 OK`:**
  *(Sets cookie `token=<JWT>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`. The token is not in the body.)*
  ```json
  {
    "success": true,
    "message": "Login successful.",
    "data": {
      "user": {
        "user_id": 4,
        "full_name": "Tanvir Ahmed",
        "email": "tanvir@gmail.com",
        "role": "user",
        "zone_id": 1,
        "status": "active"
      }
    }
  }
  ```
- **Response `401 Unauthorized`:**
  ```json
  {
    "success": false,
    "message": "Invalid email or password."
  }
  ```
- **Response `403 Forbidden`:**
  ```json
  {
    "success": false,
    "message": "Your account has been deactivated. Please contact support."
  }
  ```
- **Response `429 Too Many Requests`:**
  ```json
  {
    "success": false,
    "message": "Too many failed login attempts. Please try again in 15 minutes."
  }
  ```

---

#### 1.3 User Logout
- **Endpoint:** `POST /api/v1/auth/logout`
- **Authentication:** `None` — always succeeds, so an expired or broken cookie can still be cleared.
- **Request Body:** `None`
- **Response `200 OK`:**
  *(Clears `token` cookie with `Max-Age=0`)*
  ```json
  {
    "success": true,
    "message": "Logged out successfully."
  }
  ```

---

#### 1.4 Get Current User Profile
- **Endpoint:** `GET /api/v1/auth/me`
- **Authentication:** `Required (All Roles)`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "user_id": 4,
      "full_name": "Tanvir Ahmed",
      "email": "tanvir@gmail.com",
      "phone": "01811000004",
      "role": "user",
      "address": "House 14, Road 2, Baitul Aman",
      "zone_id": 1,
      "zone_name": "Zone 1 - Baitul Aman",
      "status": "active"
    }
  }
  ```

---

### Module 2: Master Data & Public Catalog

#### 2.1 Get Active Waste Categories
- **Endpoint:** `GET /api/v1/categories`
- **Authentication:** `None (Public)`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      {
        "category_id": 1,
        "name": "Plastic",
        "points_per_kg": "10.00",
        "is_other": false
      },
      {
        "category_id": 6,
        "name": "Other Recyclable Waste",
        "points_per_kg": "5.00",
        "is_other": true
      }
    ]
  }
  ```

---

#### 2.2 Get Active Operational Zones
- **Endpoint:** `GET /api/v1/zones`
- **Authentication:** `None (Public)`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      {
        "zone_id": 1,
        "name": "Zone 1 - Baitul Aman",
        "description": "Covers Baitul Aman, Engineering College, and surrounding residential areas"
      },
      {
        "zone_id": 2,
        "name": "Zone 2 - Goalchamot",
        "description": "Covers Goalchamot, Old Bus Stand, and commercial hubs"
      }
    ]
  }
  ```

---

### Module 3: Pickup Requests (General User)

#### 3.1 Submit Pickup Request
- **Endpoint:** `POST /api/v1/pickup-requests`
- **Authentication:** `Required (Role: user)`
- **Request Body:**
  ```json
  {
    "category_id": 1,
    "zone_id": 1,
    "pickup_address": "House 14, Road 2, Baitul Aman",
    "contact_phone": "01811000004",
    "other_description": null,
    "estimated_weight_kg": 15.00,
    "preferred_at": "2026-11-15T10:00:00"
  }
  ```
- **Validation Rules:**
  - `category_id`: Must be an active category.
  - `zone_id`: Must be an active zone.
  - `preferred_at`: Must be strictly in the future (`preferred_at > CURRENT_TIMESTAMP`).
  - `other_description`: Mandatory if selected category has `is_other = TRUE`.
  - `estimated_weight_kg`: Required, must be positive (`> 0.00`).
  - `contact_phone`: Bangladeshi mobile format; the form pre-fills it from the user's profile.
- **Database Transaction Steps:**
  1. Inserts into `pickup_requests` with `status = 'Pending'`.
  2. Inserts initial audit log into `request_status_logs` (`old_status = NULL`, `new_status = 'Pending'`).
  3. Inserts a `PICKUP_SUBMITTED` notification for the user.
- **Response `201 Created`:**
  ```json
  {
    "success": true,
    "message": "Pickup request submitted successfully.",
    "data": {
      "request_id": 12,
      "status": "Pending",
      "created_at": "2026-11-11T12:00:00.000Z"
    }
  }
  ```

---

#### 3.2 List Logged-In User's Requests
- **Endpoint:** `GET /api/v1/pickup-requests/mine`
- **Authentication:** `Required (Role: user)`
- **Query Parameters:** `?status=Pending&from=2026-11-01&to=2026-11-30&category_id=1&page=1&limit=10` — all optional (FR-12). One status at a time; `from`/`to` are whole days on `created_at`; an impossible date such as `2026-02-31` → 400.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "total": 3,
      "page": 1,
      "limit": 10,
      "requests": [
        {
          "request_id": 1,
          "category_id": 1,
          "category_name": "Plastic",
          "zone_id": 1,
          "zone_name": "Zone 1 - Baitul Aman",
          "pickup_address": "House 14, Road 2, Baitul Aman",
          "estimated_weight_kg": "15.00",
          "actual_weight_kg": "15.50",
          "preferred_at": "2026-11-10T11:00:00.000Z",
          "status": "Completed",
          "collector_name": "Rafiqul Islam",
          "created_at": "2026-11-10T09:00:00.000Z"
        }
      ]
    }
  }
  ```

---

#### 3.3 Get Single Request Details & Audit Timeline
- **Endpoint:** `GET /api/v1/pickup-requests/:id`
- **Authentication:** `Required (Roles: user [owner], collector [assigned], admin)`. Anyone else gets **404** (not 403), so they cannot tell whether the request exists.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "request_id": 1,
      "status": "Completed",
      "category_name": "Plastic",
      "points_per_kg": "10.00",
      "pickup_address": "House 14, Road 2, Baitul Aman",
      "contact_phone": "01811000004",
      "estimated_weight_kg": "15.00",
      "actual_weight_kg": "15.50",
      "points_earned": "155.00",
      "preferred_at": "2026-11-10T11:00:00.000Z",
      "collector": {
        "collector_id": 2,
        "name": "Rafiqul Islam",
        "phone": "01711000002"
      },
      "timeline": [
        {
          "log_id": 1,
          "old_status": null,
          "new_status": "Pending",
          "note": "User submitted request",
          "changed_at": "2026-11-10T09:00:00.000Z",
          "changed_by": "Tanvir Ahmed"
        },
        {
          "log_id": 2,
          "old_status": "Pending",
          "new_status": "Assigned",
          "note": "Assigned to Rafiqul Islam",
          "changed_at": "2026-11-10T09:30:00.000Z",
          "changed_by": "System Administrator"
        },
        {
          "log_id": 5,
          "old_status": "Collected",
          "new_status": "Completed",
          "note": "Collection completed and reward points posted",
          "changed_at": "2026-11-10T11:05:00.000Z",
          "changed_by": "Rafiqul Islam"
        }
      ]
    }
  }
  ```

---

#### 3.4 Cancel Pickup Request
- **Endpoint:** `PUT /api/v1/pickup-requests/:id/cancel`
- **Authentication:** `Required (Role: user)`
- **Business Rule:** Only the owner can cancel, and only when `status = 'Pending'`. Any other status returns HTTP 409 Conflict; someone else's request returns 404.
- **Request Body:** `None`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Pickup request cancelled successfully.",
    "data": {
      "request_id": 3,
      "status": "Cancelled"
    }
  }
  ```
- **Response `409 Conflict`:**
  ```json
  {
    "success": false,
    "message": "Cannot cancel request. Only Pending requests can be cancelled (current status: Assigned)."
  }
  ```

---

### Module 4: Collector Operations

#### 4.1 Get Assigned Requests
- **Endpoint:** `GET /api/v1/collector/requests`
- **Authentication:** `Required (Role: collector)`
- **Query Parameters:** `?status=Assigned,Accepted,Collected&zone_id=1` (only requests where `collector_id` = the logged-in collector)
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      {
        "request_id": 2,
        "user_name": "Tanvir Ahmed",
        "contact_phone": "01811000004",
        "pickup_address": "House 14, Road 2, Baitul Aman",
        "category_name": "Paper & Cardboard",
        "estimated_weight_kg": "20.00",
        "preferred_at": "2026-11-13T14:00:00.000Z",
        "status": "Accepted"
      }
    ]
  }
  ```

---

#### 4.2 Accept Assigned Job
- **Endpoint:** `PUT /api/v1/collector/requests/:id/accept`
- **Authentication:** `Required (Role: collector)`. A job assigned to another collector returns 404.
- **Business Rule:** Status must currently be `Assigned` and `collector_id = req.user.user_id` (wrong status → 409; a job not assigned to this collector → 404). Status transitions to `Accepted`, a status log is written, and a `PICKUP_ACCEPTED` notification goes to the user.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Pickup job accepted.",
    "data": {
      "request_id": 2,
      "status": "Accepted"
    }
  }
  ```

---

#### 4.3 Reject Assigned Job
- **Endpoint:** `PUT /api/v1/collector/requests/:id/reject`
- **Authentication:** `Required (Role: collector)`. A job assigned to another collector returns 404.
- **Request Body:**
  ```json
  {
    "reason": "Collector vehicle breakdown; unable to reach Baitul Aman today."
  }
  ```
- **Validation Rules:** `reason` is mandatory (5–200 characters).
- **Business Rule:** Status must be `Assigned` and the request must belong to this collector.
- **Business Effect:** Status transitions to `Rejected` and `collector_id` is set to `NULL`, so the request returns to the Admin queue. The status log row (with `changed_by_id` = this collector and the reason in `note`) keeps the record for the collector-performance report. A `PICKUP_REJECTED` notification tells the user the request is being reassigned.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Pickup job rejected and returned to admin queue.",
    "data": {
      "request_id": 2,
      "status": "Rejected"
    }
  }
  ```

---

#### 4.4 Abort Collection On-Site
- **Endpoint:** `PUT /api/v1/collector/requests/:id/abort`
- **Authentication:** `Required (Role: collector)`. A job assigned to another collector returns 404.
- **Request Body:**
  ```json
  {
    "reason": "Resident absent and phone unreachable after 3 consecutive attempts."
  }
  ```
- **Validation Rules:** `reason` is mandatory (5–200 characters).
- **Business Rule:** Status must be `Accepted` and the request must belong to this collector. Transitions to `Cancelled` with the reason in the status log, and a `PICKUP_ABORTED` notification goes to the user.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Pickup cancelled on-site.",
    "data": {
      "request_id": 2,
      "status": "Cancelled"
    }
  }
  ```

---

#### 4.5 Record Physical Weight
- **Endpoint:** `POST /api/v1/collector/collection-records`
- **Authentication:** `Required (Role: collector)`. A job assigned to another collector returns 404.
- **Request Body:**
  ```json
  {
    "request_id": 2,
    "actual_weight_kg": 18.75,
    "remarks": "Dry cardboard bundled with twine, verified on digital scale."
  }
  ```
- **Business Rule & Steps:**
  1. Validates `actual_weight_kg > 0.00`, request status is `Accepted`, and `collector_id = req.user.user_id`.
  2. Queries `waste_categories.points_per_kg` for current tariff rate.
  3. Inserts into `collection_records` with snapshot `points_per_kg_applied`.
  4. Updates `pickup_requests.status = 'Collected'`.
  5. Inserts `request_status_logs` row.
  6. Inserts a `PICKUP_COLLECTED` notification for the user.
  *(Steps 3–6 run in one transaction.)*
- **Response `201 Created`:**
  ```json
  {
    "success": true,
    "message": "Collection weight recorded successfully.",
    "data": {
      "record_id": 2,
      "request_id": 2,
      "actual_weight_kg": "18.75",
      "points_per_kg_applied": "6.00",
      "calculated_points": "112.50",
      "status": "Collected"
    }
  }
  ```

---

#### 4.6 Complete Pickup & Issue Reward Points
- **Endpoint:** `PUT /api/v1/collector/requests/:id/complete`
- **Authentication:** `Required (Role: collector)`. A job assigned to another collector returns 404.
- **Atomic Transaction Workflow (PRD FR-10):**
  1. Status must be `Collected` and `collector_id = req.user.user_id` (wrong status → 409; a job not assigned to this collector → 404).
  2. Updates `pickup_requests.status = 'Completed'`.
  3. Updates `collection_records.completed_at = CURRENT_TIMESTAMP`.
  4. Inserts `reward_transactions` row:
     $$\text{points} = \text{ROUND}(\text{actual\_weight\_kg} \times \text{points\_per\_kg\_applied}, 2)$$
     (`txn_type = 'EARN'`, `record_id = cr.record_id`).
  5. Writes `request_status_logs` row.
  6. Dispatches `PICKUP_COMPLETED` notification to the resident.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Pickup completed and reward points posted to user ledger.",
    "data": {
      "request_id": 2,
      "status": "Completed",
      "points_credited": "112.50"
    }
  }
  ```

---

#### 4.7 Collector Completed History & Metrics
- **Endpoint:** `GET /api/v1/collector/history`
- **Authentication:** `Required (Role: collector)`
- **Query Parameters:** `?from=2026-11-01&to=2026-11-30&category_id=2&page=1&limit=10` — all optional (FR-12); `from`/`to` are whole days on `completed_at`.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "summary": {
        "total_completed_pickups": 28,
        "total_kg_collected": "432.50"
      },
      "records": [
        {
          "record_id": 1,
          "request_id": 1,
          "category_name": "Plastic",
          "actual_weight_kg": "15.50",
          "collected_at": "2026-11-10T11:00:00.000Z"
        }
      ]
    }
  }
  ```

---

### Module 5: Rewards & Points Ledger

#### 5.1 Get Real-Time Point Balance
- **Endpoint:** `GET /api/v1/rewards/balance`
- **Authentication:** `Required (Role: user)`
- **Business Logic:** Dynamically aggregates signed points ledger rows:
  ```sql
  SELECT COALESCE(SUM(points), 0.00) AS available_balance
  FROM reward_transactions WHERE user_id = ?;
  ```
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "user_id": 4,
      "available_balance": "55.00",
      "currency_equivalent_bdt": "27.50"
    }
  }
  ```

---

#### 5.2 Get Ledger Audit History
- **`reference` formats:** EARN `Pickup Job #1 (15.50 kg Plastic)` · ADJUST `Weight correction, Pickup Job #1` · REDEEM `Cash Redemption #1 (bKash)` · REFUND `Refund, Cash Redemption #3 rejected`. `currency_equivalent_bdt` in §5.1 is `null` when no rule is active.
- **Endpoint:** `GET /api/v1/rewards/history`
- **Authentication:** `Required (Role: user)`
- **Query Parameters:** `?page=1&limit=15`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "total": 2,
      "transactions": [
        {
          "transaction_id": 2,
          "txn_type": "REDEEM",
          "points": "-100.00",
          "reference": "Cash Redemption #1 (bKash)",
          "created_at": "2026-11-10T14:00:00.000Z"
        },
        {
          "transaction_id": 1,
          "txn_type": "EARN",
          "points": "155.00",
          "reference": "Pickup Job #1 (15.50 kg Plastic)",
          "created_at": "2026-11-10T11:05:00.000Z"
        }
      ]
    }
  }
  ```

---

### Module 6: Cash Redemptions

#### 6.1 Get Active Conversion Rule
- **No active rule:** `404 Not Found`.
- **Endpoint:** `GET /api/v1/redemptions/rules/active`
- **Authentication:** `Required (Roles: user, admin)`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "rule_id": 1,
      "taka_per_point": "0.5000",
      "min_points": "100.00",
      "effective_from": "2026-11-10T00:00:00.000Z"
    }
  }
  ```

---

#### 6.2 Submit Cash Redemption
- **Endpoint:** `POST /api/v1/redemptions`
- **Authentication:** `Required (Role: user)`
- **Request Body:**
  ```json
  {
    "points_redeemed": 100.00,
    "payout_method": "bKash",
    "payout_account": "01811000004"
  }
  ```
- **Validation Rules:**
  - `points_redeemed`: Must be $\ge \text{min\_points}$ and $\le \text{available\_balance}$.
  - `payout_method`: Must be one of `['bKash', 'Nagad', 'Bank']`.
  - `payout_account`: bKash/Nagad → Bangladeshi mobile number (same rule as `phone`); Bank → 6–30 digits or dashes.
  - No active rule → 422.
- **ACID Double-Spend Prevention Steps:**
  1. `SELECT user_id FROM users WHERE user_id = ? FOR UPDATE;` (Locks user row).
  2. Evaluates current balance from `reward_transactions`.
  3. Inserts into `cash_redemptions` (`status = 'Pending'`).
  4. Inserts into `reward_transactions` (`txn_type = 'REDEEM'`, `points = -100.00`, holds points).
  5. Inserts a `REDEMPTION_REQUESTED` notification for the user.
  *(Steps 1–5 run in one transaction; on any failure everything rolls back.)*
- **Response `201 Created`:**
  ```json
  {
    "success": true,
    "message": "Cash redemption request submitted for administrative review.",
    "data": {
      "redemption_id": 2,
      "points_redeemed": "100.00",
      "cash_amount": "50.00",
      "status": "Pending",
      "payout_method": "bKash"
    }
  }
  ```
- **Response `422 Unprocessable Entity`:**
  ```json
  {
    "success": false,
    "message": "Insufficient points balance. Available: 55.00, Requested: 100.00."
  }
  ```

---

#### 6.3 Get User's Redemption History
- **Endpoint:** `GET /api/v1/redemptions/mine`
- **Authentication:** `Required (Role: user)`
- **Query Parameters:** `?status=Paid` (optional: `Pending`, `Approved`, `Rejected`, `Paid`)
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      {
        "redemption_id": 1,
        "points_redeemed": "100.00",
        "cash_amount": "50.00",
        "payout_method": "bKash",
        "payout_account": "01811000004",
        "payout_trx_id": "BK99X8877A",
        "status": "Paid",
        "requested_at": "2026-11-10T14:00:00.000Z",
        "processed_at": "2026-11-10T15:30:00.000Z"
      }
    ]
  }
  ```

---

### Module 7: Notifications

#### 7.1 List User Notifications
- **Endpoint:** `GET /api/v1/notifications`
- **Authentication:** `Required (All Roles)` — always only the caller's own notifications.
- **Query Parameters:** `?unread_only=true|false` (default `false`; anything else → 400) and `?limit=` (default 20, max 50). Newest first.
- **`unread_count`** counts every unread notification of the user, not only those on this page (used for the badge).
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "unread_count": 1,
      "notifications": [
        {
          "notification_id": 2,
          "type": "REDEMPTION_PAID",
          "message": "Your redemption of 50.00 BDT via bKash has been paid! TrxID: BK99X8877A",
          "is_read": false,
          "request_id": null,
          "redemption_id": 1,
          "created_at": "2026-11-10T15:30:00.000Z"
        },
        {
          "notification_id": 1,
          "type": "PICKUP_COMPLETED",
          "message": "Pickup #1 completed! 15.50 kg Plastic earned you 155.00 points.",
          "is_read": true,
          "request_id": 1,
          "redemption_id": null,
          "created_at": "2026-11-10T11:05:00.000Z"
        }
      ]
    }
  }
  ```

---

#### 7.2 Mark Single Notification As Read
- **Endpoint:** `PATCH /api/v1/notifications/:id/read`
- **Authentication:** `Required (All Roles)`
- **Rules:** someone else's or an unknown id → 404 (same answer, so ids can't be probed). Marking an already-read notification again is still 200.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Notification marked as read."
  }
  ```

---

#### 7.3 Mark All Notifications As Read
- **Endpoint:** `PATCH /api/v1/notifications/read-all`
- **Authentication:** `Required (All Roles)`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "All notifications marked as read.",
    "data": { "updated": 3 }
  }
  ```
  *(`updated` = how many were unread before the call.)*

---

### Module 8: Administrator Operations & Governance

#### 8.1 List All Platform Pickup Requests
- **Endpoint:** `GET /api/v1/admin/pickup-requests`
- **Authentication:** `Required (Role: admin)`
- **Query Parameters:** `?status=Pending&zone_id=1&page=1&limit=20`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "requests": [
        {
          "request_id": 3,
          "user_name": "Sadia Sultana",
          "user_phone": "01811000005",
          "category_name": "E-waste",
          "zone_name": "Zone 3 - Jhiltuly",
          "estimated_weight_kg": "5.00",
          "preferred_at": "2026-11-14T11:00:00.000Z",
          "status": "Pending",
          "collector_id": null,
          "created_at": "2026-11-11T12:00:00.000Z"
        }
      ]
    }
  }
  ```

---

#### 8.2 Assign Collector to Pickup Job
- **Endpoint:** `PUT /api/v1/admin/pickup-requests/:id/assign`
- **Authentication:** `Required (Role: admin)`
- **Request Body:**
  ```json
  {
    "collector_id": 2
  }
  ```
- **Validation Rules:**
  - `collector_id`: Must refer to an active user with `role = 'collector'`.
  - Request status must be `Pending` or `Rejected` (otherwise 409).
  - The admin UI lists collectors of the request's zone first; another zone is allowed when none is available.
- **Business Effect:** Sets `collector_id` and `status = 'Assigned'`, writes a status log, and sends a `PICKUP_ASSIGNED` notification to the collector.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Collector assigned successfully.",
    "data": {
      "request_id": 3,
      "collector_id": 2,
      "status": "Assigned"
    }
  }
  ```

---

#### 8.3 List Cash Redemptions for Review
- **Endpoint:** `GET /api/v1/admin/redemptions`
- **Authentication:** `Required (Role: admin)`
- **Query Parameters:** `?status=Pending&page=1&limit=20` (`status` may be `Pending`, `Approved`, `Rejected` or `Paid`)
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "total": 1,
      "redemptions": [
        {
          "redemption_id": 2,
          "user_id": 4,
          "user_name": "Tanvir Ahmed",
          "points_redeemed": "100.00",
          "cash_amount": "50.00",
          "payout_method": "bKash",
          "payout_account": "01811000004",
          "status": "Pending",
          "requested_at": "2026-11-11T14:00:00.000Z"
        }
      ]
    }
  }
  ```

---

#### 8.4 Process Cash Redemption Decision
- **Endpoint:** `PATCH /api/v1/admin/redemptions/:id`
- **Authentication:** `Required (Role: admin)`
- **Allowed actions:**

  | `action` | From status | To status | Required fields | Side effects |
  |---|---|---|---|---|
  | `approve` | `Pending` | `Approved` | — | `REDEMPTION_APPROVED` notification |
  | `paid` | `Approved` | `Paid` | `payout_trx_id` | Stores TrxID, `REDEMPTION_PAID` notification |
  | `reject` | `Pending` or `Approved` | `Rejected` | `admin_note` | `REFUND` ledger row (+points), `REDEMPTION_REJECTED` notification |

  Any other combination returns HTTP 409. Every action sets `admin_id` and `processed_at`.
- **Request Body (Scenario A: Approve):**
  ```json
  {
    "action": "approve"
  }
  ```
- **Request Body (Scenario B: Mark Paid):**
  ```json
  {
    "action": "paid",
    "payout_trx_id": "BK99X8877A",
    "admin_note": "Disbursed via bKash merchant payout portal."
  }
  ```
- **Request Body (Scenario C: Reject with Refund):**
  ```json
  {
    "action": "reject",
    "admin_note": "Invalid bKash personal wallet account number."
  }
  ```
- **Business Logic on Rejection (one transaction):**
  1. Updates `cash_redemptions.status = 'Rejected'`, records `admin_note`.
  2. Inserts positive `REFUND` row in `reward_transactions` restoring points.
  3. Inserts a `REDEMPTION_REJECTED` notification for the user.
- **Response `200 OK` (Scenario B):**
  ```json
  {
    "success": true,
    "message": "Redemption processed successfully.",
    "data": {
      "redemption_id": 2,
      "status": "Paid",
      "payout_trx_id": "BK99X8877A"
    }
  }
  ```

---

#### 8.5 Scale Weight Dispute Correction (FR-18)
- **Endpoint:** `PUT /api/v1/admin/collection-records/:id`
- **Authentication:** `Required (Role: admin)`
- **Request Body:**
  ```json
  {
    "actual_weight_kg": 12.00,
    "remarks": "Admin audited certified scale ticket: corrected from 15.50 kg to 12.00 kg"
  }
  ```
- **Atomic Balance Guard Execution:**
  1. Computes delta so the record's total always equals the points for the new weight
     (works for repeated corrections and avoids double rounding):
     $$\Delta = \text{ROUND}(\text{new\_kg} \times \text{points\_per\_kg\_applied}, 2) - \sum(\text{EARN} + \text{ADJUST points already posted for this record})$$
     Example: $\text{ROUND}(12.00 \times 10.00, 2) - 155.00 = -35.00$. If $\Delta = 0$ no ledger row is written.
  2. Locks user row: `SELECT user_id FROM users WHERE user_id = ? FOR UPDATE;`
  3. Pre-checks balance (in the service; the controller turns the error into the response):
     ```javascript
     if (currentBalance + deltaPoints < 0) {
       throw new AppError(422, "Weight correction denied: the user's balance would drop below 0.00.");
     }
     ```
  4. Updates `collection_records.actual_weight_kg = 12.00`.
  5. Inserts `reward_transactions` row (`txn_type = 'ADJUST'`, `points = -35.00`).
  6. Inserts `request_status_logs` row (`old_status = new_status = 'Completed'`, `changed_by_id` = admin, `note = "Weight corrected from 15.50 kg to 12.00 kg"`).
  *(Steps 2–6 run in one transaction. Only `Completed` records can be corrected.)*
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Weight corrected and ledger balance adjusted successfully.",
    "data": {
      "record_id": 1,
      "corrected_weight_kg": "12.00",
      "point_adjustment": "-35.00"
    }
  }
  ```

---

#### 8.6 Category Governance (List, Create & Update)
All three endpoints: `Required (Role: admin)`. Categories are never deleted; deactivate them instead.
Changing `points_per_kg` never changes past rewards: each collection record keeps the rate it was weighed with (`points_per_kg_applied`, PRD §5.2).

- **Endpoint:** `GET /api/v1/admin/categories` — every category, active and inactive, ordered by id.
  - **Response `200 OK`:**
    ```json
    {
      "success": true,
      "data": [
        { "category_id": 1, "name": "Plastic", "points_per_kg": "10.00", "is_other": false, "is_active": true },
        { "category_id": 5, "name": "Glass", "points_per_kg": "4.00", "is_other": false, "is_active": false }
      ]
    }
    ```
- **Endpoint:** `POST /api/v1/admin/categories`
  - **Request Body:**
    ```json
    {
      "name": "Aluminum Cans",
      "points_per_kg": 18.00,
      "is_other": false
    }
    ```
  - **Validation:** `name` 2–100 characters; `points_per_kg` a number from 0 to 99999999.99 (0 is allowed); `is_other` a JSON boolean, default `false`. New categories start active.
  - **Response `201 Created`:** `{ "success": true, "message": "Category created.", "data": { "category_id": 7, "name": "Aluminum Cans", "points_per_kg": "18.00", "is_other": false, "is_active": true } }`
  - **Response `409 Conflict`:** the name already exists (letter case is ignored: `plastic` = `Plastic`).
- **Endpoint:** `PUT /api/v1/admin/categories/:id` — partial update: send any of `name`, `points_per_kg`, `is_active` (at least one).
  - **Request Body:**
    ```json
    {
      "points_per_kg": 12.00,
      "is_active": true
    }
    ```
  - **Response `200 OK`:** the updated category (same shape as above).
  - **Errors:** unknown id → 404; name used by another category → 409; bad values or empty body → 400.
  - **Effect of `is_active: false`:** the category disappears from `GET /categories` and new pickup requests with it get 400, but requests already in progress can still be weighed and completed (requirement-validation EC-03).

---

#### 8.7 Operational Zone Governance (List, Create & Update)
All three endpoints: `Required (Role: admin)`. Zones are never deleted (foreign keys are `RESTRICT`); deactivate them instead.

- **Endpoint:** `GET /api/v1/admin/zones` — every zone, active and inactive, ordered by id.
  - **Response `200 OK`:**
    ```json
    {
      "success": true,
      "data": [
        { "zone_id": 1, "name": "Zone 1 - Baitul Aman", "description": "Covers Baitul Aman, ...", "is_active": true },
        { "zone_id": 4, "name": "Zone 4 - Aliabad", "description": null, "is_active": false }
      ]
    }
    ```
- **Endpoint:** `POST /api/v1/admin/zones`
  - **Request Body:**
    ```json
    {
      "name": "Zone 5 - Ambikapur",
      "description": "Covers Ambikapur and north peri-urban areas."
    }
    ```
  - **Validation:** `name` 2–100 characters; `description` optional text up to 1000 characters (missing, `null` or `""` → stored as `null`). New zones start active.
  - **Response `201 Created`:** `{ "success": true, "message": "Zone created.", "data": { "zone_id": 5, "name": "Zone 5 - Ambikapur", "description": "Covers Ambikapur and north peri-urban areas.", "is_active": true } }`
  - **Response `409 Conflict`:** the name already exists (letter case is ignored).
- **Endpoint:** `PUT /api/v1/admin/zones/:id` — partial update: send any of `name`, `description`, `is_active` (at least one).
  - **Request Body:**
    ```json
    {
      "description": "Updated coverage notes",
      "is_active": false
    }
    ```
  - **Response `200 OK`:** the updated zone (same shape as above).
  - **Errors:** unknown id → 404; name used by another zone → 409; bad values or empty body → 400.
  - **Effect of `is_active: false`:** the zone disappears from `GET /zones`; registering or submitting a request with it gives 400. Existing users, collectors and requests keep their zone and keep working.

---

#### 8.8 Redemption Tariff Governance
- **Endpoint:** `POST /api/v1/admin/redemption-rules`
- **Authentication:** `Required (Role: admin)`
- **Request Body:**
  ```json
  {
    "taka_per_point": 0.6000,
    "min_points": 100.00
  }
  ```
- **Business Rule:** Sets all existing rules `is_active = FALSE`, then inserts new active rule.
- **Response `201 Created`:**
  ```json
  {
    "success": true,
    "message": "New redemption tariff rule activated.",
    "data": {
      "rule_id": 2,
      "taka_per_point": "0.6000",
      "min_points": "100.00",
      "is_active": true
    }
  }
  ```

---

#### 8.9 Collector Provisioning & User Status Management
- **Endpoint:** `POST /api/v1/admin/collectors`
  - **Authentication:** `Required (Role: admin)`
  - **Request Body:**
    ```json
    {
      "full_name": "Jashim Uddin",
      "email": "collector3@wrr.com",
      "phone": "01711000006",
      "password": "password123",
      "zone_id": 3
    }
    ```
  - **Response `201 Created`**
- **Endpoint:** `PATCH /api/v1/admin/users/:id/status`
  - **Authentication:** `Required (Role: admin)`
  - **Request Body:**
    ```json
    {
      "status": "inactive"
    }
    ```
  - **Response `200 OK`**
- **Endpoint:** `PATCH /api/v1/admin/users/:id/zone`
  - **Authentication:** `Required (Role: admin)`
  - **Request Body:**
    ```json
    {
      "zone_id": 2
    }
    ```
  - **Business Rule:** Target user must have `role = 'collector'`; zone must be active.
  - **Response `200 OK`**

---

#### 8.10 Analytical & KPI Reports
- **Endpoint:** `GET /api/v1/admin/reports/:type`
- **Authentication:** `Required (Role: admin)`
- **Path Parameter `:type`:**
  1. `weight-by-category` (FR-17 Report 1)
  2. `request-volume-by-status` (FR-17 Report 2)
  3. `collector-performance` (FR-17 Report 3)
  4. `point-liability` (FR-17 Report 4)
  5. `redemption-summary` (FR-17 Report 5)
- **Query Parameters:** `?from=2026-11-01&to=2026-11-30&zone_id=1&category_id=1` (`zone_id` and `category_id` optional; `category_id` applies to `weight-by-category`). SQL for each report: `database.md` §6.
- **Response `200 OK` (Example for `collector-performance`):**
  ```json
  {
    "success": true,
    "report_type": "collector-performance",
    "data": [
      {
        "collector_id": 2,
        "collector_name": "Rafiqul Islam",
        "primary_zone": "Zone 1 - Baitul Aman",
        "completed_pickups": 1,
        "total_kg_collected": "15.50",
        "rejection_count": 0,
        "rejection_rate_percentage": "0.00"
      }
    ]
  }
  ```

---

## 4. API Error Response Catalog & Diagnostic Codes

| HTTP Status | Error Scenario | Sample Response Payload |
|:---:|---|---|
| `400` | Past Preferred Date | `{"success": false, "message": "Validation failed.", "errors": [{"field": "preferred_at", "message": "Preferred date must be in the future."}]}` |
| `400` | Missing Other Description | `{"success": false, "message": "Validation failed.", "errors": [{"field": "other_description", "message": "Description is mandatory for 'Other' category."}]}` |
| `401` | Missing / Expired Auth Cookie | `{"success": false, "message": "Authentication required. Please log in."}` |
| `403` | Resident Accessing Admin API | `{"success": false, "message": "Access denied. Insufficient permissions for role: user."}` |
| `403` | Deactivated Account | `{"success": false, "message": "Account has been deactivated. Please contact support."}` |
| `404` | Non-Existent Request ID | `{"success": false, "message": "Pickup request #999 not found."}` |
| `409` | Illegal State Transition | `{"success": false, "message": "Invalid state transition from 'Completed' to 'Cancelled'."}` |
| `409` | Duplicate Email | `{"success": false, "message": "An account with this email already exists."}` |
| `422` | Insufficient Balance | `{"success": false, "message": "Insufficient points balance. Available: 55.00, Requested: 100.00."}` |
| `422` | Weight Correction Balance Guard | `{"success": false, "message": "Weight correction denied: the user's balance would drop below 0.00."}` |
| `429` | Login Rate Limit | `{"success": false, "message": "Too many failed login attempts. Please try again in 15 minutes."}` |

