# ♻️ Waste Resource Recycle (WRR)
### *Smart Municipal Waste Management & Recyclable Reward Incentive Platform*

<p align="center">
  <a href="https://waste-resource-recycle.up.railway.app" target="_blank">
    <img src="https://img.shields.io/badge/🌐_Live_Demo-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Live Demo" />
  </a>
  <a href="https://github.com/users/elnMohiuddinMolla/projects/2" target="_blank">
    <img src="https://img.shields.io/badge/📋_Project_Board-GitHub-2088FF?style=for-the-badge&logo=github&logoColor=white" alt="Project Board" />
  </a>
  <img src="https://img.shields.io/badge/Tests-139%2F139_Passing-brightgreen?style=for-the-badge&logo=jest" alt="Test Status" />
  <img src="https://img.shields.io/badge/Node.js-v22_LTS-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node Version" />
  <img src="https://img.shields.io/badge/Database-MySQL_8.0_|_MariaDB-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="Database" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

---

## 📌 Executive Summary

**Waste Resource Recycle (WRR)** is a full-stack, production-ready municipal solid waste management and recycling rewards platform designed for urban environments. It connects urban households (**General Users**) directly with verified local **Waste Collectors** to streamline door-to-door collection of recyclable waste (Plastic, Paper, E-waste, Metal, Glass).

Households request doorstep pickups, collectors verify and record weight on digital certified scales, and users earn instant reward points calculated mathematically as `Actual Weight (kg) × Category Point Rate`. Points accumulate in an immutable, double-entry financial ledger that users can redeem for real cash payouts via **bKash**, **Nagad**, or direct **Bank Transfer**.

> **Academic Course:** CSE-3112 Software Engineering Lab · **Faridpur Engineering College**  
> **Supervisor:** Mohammad Shamsul Islam, Associate Professor & Head, Department of CSE  
> **Engineering Team:** MD Mohiuddin Molla (Reg: 2022254878) · Abdul Al Noman (Reg: 935)  
> **SDLC:** Waterfall with comprehensive requirements engineering, formal 3NF relational schema, and 100% automated test verification.

---

## 📑 Table of Contents

- [Core Value Proposition](#-core-value-proposition)
- [Key Features by Role](#-key-features-by-role)
- [System Architecture & State Machine](#-system-architecture--state-machine)
- [Technology Stack](#-technology-stack)
- [Live Demo & Test Credentials](#-live-demo--test-credentials)
- [Quick Start & Local Setup](#-quick-start--local-setup)
- [API Architecture (50 Endpoints)](#-api-architecture-50-endpoints)
- [Automated Testing & Benchmark Compliance](#-automated-testing--benchmark-compliance)
- [Directory Structure](#-directory-structure)
- [Academic Documentation Index](#-academic-documentation-index)
- [License](#-license)

---

## 💡 Core Value Proposition

- 🛡️ **Strict 8-Transition Request State Machine:** Fully prevents out-of-order pickups, unauthorized status changes, and duplicate processing.
- 💰 **Banking-Grade Double-Spend Prevention:** Signed double-entry points ledger (`EARN`, `REDEEM`, `REFUND`, `ADJUST`). Redemptions lock user balances via atomic database row-level locking (`SELECT ... FOR UPDATE`).
- 📸 **On-Site Photo Verification:** Every pickup request captures a compressed client-side photo preview ensuring verified waste segregation before dispatch.
- ⚖️ **Immutable Point Valuation & Rate Snapshots:** Once weighed, category rates are permanently frozen into collection records; future administrative tariff updates never distort historical rewards.
- 📊 **Administrative Auditing & Weight Corrections:** Built-in scale dispute resolution mechanism that recalculates ledger differences and blocks negative balance anomalies.
- ⚡ **Zero-Framework High-Performance Frontend:** 100% vanilla HTML5, semantic CSS3, and ES6+ modules compliant with strict Content-Security-Policy (CSP) headers (no inline scripts, no eval).

---

## 🚀 Key Features by Role

### 👤 1. General User (Household Resident)
- **Account Registration & Login:** JWT-authenticated session with automatic HTTP-Only cookie storage.
- **Doorstep Pickup Requests:** Select category, upload waste photo (client-side compressed <= 1280 px), set estimated weight, select municipal zone, and schedule a future pickup time.
- **Lifecycle Tracking:** Visual real-time step progress indicator and timestamped audit timeline.
- **Cancellation Rights:** Single-click cancellation strictly while status is `Pending`.
- **Financial Ledger & Wallet:** Dynamic live point balance (`SUM(points)`), full ledger history with breakdown, and real-time BDT value preview.
- **Cash Out Redemptions:** Seamless withdrawal to personal **bKash**, **Nagad**, or Bank accounts with instant point locking.
- **Notification Inbox & Support:** Real-time in-app alerts on status changes and support ticket submission.

### 🚚 2. Waste Collector (Field Operative)
- **Job Dispatch Board:** Zone-filtered queue showing assigned pickups, street addresses, and waste photos.
- **Tap-to-Call Customer Assistance:** Immediate direct phone dialer integration for doorstep navigation.
- **Acceptance / Rejection Workflow:** Accept pickups or reject with mandatory explanatory reason logging.
- **On-Site Cancellation (Abort):** Cancel on-site if resident is absent or waste is contaminated.
- **Digital Scale Recording:** Input certified physical weight (> 0 kg) with automatic point estimation.
- **One-Click Completion:** Atomically marks job completed, updates ledger, and notifies user.
- **Work History & Performance:** Daily and monthly metrics for total pickups and cumulative weight collected.

### 🛡️ 3. System Administrator (Municipal Authority)
- **Operational Dispatch:** View unassigned requests and assign collectors based on geographic proximity.
- **Redemption Financial Oversight:** Review cash withdrawal requests, disburse funds via MFS merchant portals, record TrxIDs (`Paid`), or reject with automatic point refund.
- **Scale Dispute Correction (FR-18):** Audit certified weigh tickets, adjust recorded weight, and atomically update point ledgers.
- **Catalog & Tariff Management:** Create/update recyclable categories, set points-per-kg, and activate currency conversion tariffs (`taka_per_point`).
- **Zone & Account Governance:** Configure municipal operational zones, provision collector accounts, and toggle user active/deactivated statuses.
- **Executive BI Reports:** 5 high-speed SQL analytical reports (Weight by Category, Volume by Status, Collector KPI, Point Liability, Redemption Summary) with CSV export and A4 print stylesheet.

---

## 🏛️ System Architecture & State Machine

The project adheres to a clean **Layered Monolithic Architecture** with strict separation of concerns:

```
[Presentation Tier]        Vanilla HTML5 + Semantic CSS3 + ES6+ JavaScript Modules
         │                 (Role-Specific Portals: User, Collector, Admin)
         ▼ Same-Origin / Express Static
[Application Tier]         Node.js 22 LTS + Express.js 4 (REST API under /api/v1)
                           ├── Routes      (Endpoint mapping & parameter validation)
                           ├── Controllers (HTTP parsing, DTO sanitation, response envelopes)
                           ├── Services    (Domain business logic, state machines, transactions)
                           └── Models      (Parameterized SQL statements via mysql2)
         ▼ mysql2 Connection Pool (Bangladesh BST UTC+6)
[Persistence Tier]         MySQL 8.0+ / MariaDB 10.4+ (InnoDB Engine, Strict FKs, 11 Tables)
```

### 🔄 Request Lifecycle State Machine (PRD §5.1)

```
Pending ──(Admin assigns)──> Assigned ──(Collector accepts)──> Accepted ──(Collector weighs)──> Collected ──(Complete)──> Completed
   │                            │                                 │
   │ (User cancels)             │ (Collector rejects with note)   └──(Collector aborts on-site)──> Cancelled
   ▼                            ▼                                                                     ▲
Cancelled <───────────────── Rejected ──(Admin reassigns)──> Assigned                                 │
   ▲                                                                                                  │
   └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

| Layer | Technology | Specification / Details |
|---|---|---|
| **Runtime** | [Node.js](https://nodejs.org/) | v22.x LTS (compatible with Node 20+) |
| **Backend Framework** | [Express.js](https://expressjs.com/) | v4.x — Layered architecture (`routes -> controllers -> services -> models`) |
| **Database** | [MariaDB](https://mariadb.org/) / [MySQL](https://www.mysql.com/) | MariaDB 10.4+ (XAMPP local) or MySQL 8.0+ (InnoDB, UTF8mb4) |
| **Authentication** | [JWT](https://jwt.io/) + [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | Stateless JSON Web Tokens stored in `HttpOnly`, `SameSite=Lax` cookies |
| **Frontend** | Vanilla Web Standards | HTML5, CSS3 Custom Properties, Vanilla ES6+ JS (Zero frameworks for academic viva transparency) |
| **Testing** | Node Test Runner + Assert | 23 Unit Tests, 116 API Integration Tests, 45-step E2E Integration Suite |
| **Cloud Deployment** | [Railway](https://railway.app/) | Nixpacks buildpack, Railway MySQL database, persistent volume for photo storage |

---

## 🌐 Live Demo & Test Credentials

The system is deployed and active in production:

🔗 **Production Application:** **[https://waste-resource-recycle.up.railway.app](https://waste-resource-recycle.up.railway.app)**

### 🔑 Pre-Seeded Demonstration Accounts (Password: `password123`)

| Email | Role | Operational Role / Scope |
|---|---|---|
| `admin@wrr.com` | **Administrator** | Municipal Headquarters, access to all queues, redemptions, settings & reports |
| `collector1@wrr.com` | **Collector** | Zone 1 (Baitul Aman), pre-assigned active collection task |
| `collector2@wrr.com` | **Collector** | Zone 2 (Goalchamot), secondary field operative |
| `tanvir@gmail.com` | **General User** | Zone 1 Resident, pre-credited wallet balance (`55.00 points`), verified history |
| `sadia@gmail.com` | **General User** | Zone 3 Resident, active pending pickup request |

---

## 💻 Quick Start & Local Setup

### 1. Prerequisites
- **Node.js**: v20 or v22 LTS installed ([Download](https://nodejs.org/))
- **XAMPP**: MySQL/MariaDB service running ([Download](https://www.apachefriends.org/))
- **Git**: Installed for repository cloning

### 2. Clone Repository
```bash
git clone https://github.com/elnMohiuddinMolla/Waste_Resource_Recycle.git
cd Waste_Resource_Recycle
```

### 3. Database Initialization
1. Open XAMPP Control Panel and start **MySQL** (port `3306`).
2. Open your terminal (Git Bash or PowerShell) and import the schema and seed scripts:
```bash
# Using standard XAMPP path:
/c/xampp/mysql/bin/mysql.exe -u root < database/schema.sql
/c/xampp/mysql/bin/mysql.exe -u root < database/seed.sql
```
*Note: This creates `wrr_db` populated with all 11 tables, test users, default zones, and waste tariff rates.*

### 4. Backend Configuration
```bash
cd backend
npm install
cp .env.example .env
```
Generate a secure 64-character JWT secret and add it to `backend/.env`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Ensure your `backend/.env` has:
```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=wrr_db
JWT_SECRET=your_generated_secure_hex_key_here
```

### 5. Start Application
```bash
npm run dev
```
Terminal will output:
```
WRR server running at http://localhost:5000
Successfully connected to database: wrr_db
```
Open **`http://localhost:5000`** in any web browser.

---

## 🔌 API Architecture (50 Endpoints)

All RESTful endpoints are exposed under `/api/v1` with uniform JSON envelopes and semantic HTTP status codes (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `422`, `500`):

| Module | Method & Route | Access Level | Description |
|---|---|:---:|---|
| **Auth** | `POST /api/v1/auth/register` | Public | General user registration |
| | `POST /api/v1/auth/login` | Public | Credential check; issues HttpOnly cookie |
| | `POST /api/v1/auth/logout` | Public | Clears session cookie |
| | `GET /api/v1/auth/me` | Authenticated | Current user profile & role |
| **Catalog** | `GET /api/v1/categories` | Public | Active recyclable categories & rates |
| | `GET /api/v1/zones` | Public | Active municipal service zones |
| **Pickups** | `POST /api/v1/pickup-requests` | User | Submit pickup request with photo |
| | `GET /api/v1/pickup-requests/mine` | User | List user's requests with filters |
| | `GET /api/v1/pickup-requests/:id` | Owner/Admin/Col | Detailed request information & timeline |
| | `GET /api/v1/pickup-requests/:id/photo` | Authenticated | Stream compressed waste verification photo |
| | `PUT /api/v1/pickup-requests/:id/cancel` | User | Cancel request strictly while Pending |
| **Collector** | `GET /api/v1/collector/requests` | Collector | Assigned tasks in collector's zone |
| | `PUT /api/v1/collector/requests/:id/accept` | Collector | Accept assigned pickup task |
| | `PUT /api/v1/collector/requests/:id/reject` | Collector | Reject task with mandatory reason |
| | `PUT /api/v1/collector/requests/:id/abort` | Collector | On-site cancellation with reason note |
| | `POST /api/v1/collector/collection-records` | Collector | Record actual weight & snapshot rate |
| | `PUT /api/v1/collector/requests/:id/complete` | Collector | Atomic transaction: complete job & credit points |
| | `GET /api/v1/collector/history` | Collector | Paginated historical collection records |
| **Rewards** | `GET /api/v1/rewards/balance` | User | Live spendable point balance |
| | `GET /api/v1/rewards/history` | User | Full signed points ledger transactions |
| **Redemptions**| `GET /api/v1/redemptions/rules/active` | User/Admin | Active conversion rate & min points |
| | `POST /api/v1/redemptions` | User | Cash withdrawal request (locks points) |
| | `GET /api/v1/redemptions/mine` | User | User's cash redemption history |
| **Notifications**| `GET /api/v1/notifications` | Authenticated | In-app notification list & badge count |
| | `PATCH /api/v1/notifications/:id/read` | Authenticated | Mark single notification as read |
| | `PATCH /api/v1/notifications/read-all` | Authenticated | Mark all notifications read |
| **Support** | `POST /api/v1/support-tickets` | User/Collector | Open support inquiry |
| | `GET /api/v1/support-tickets/mine` | User/Collector | List user's support tickets & replies |
| | `PATCH /api/v1/support-tickets/:id/close` | Owner/Admin | Close resolved support ticket |
| | `GET /api/v1/admin/support-tickets` | Admin | Filter & list support queue |
| | `PUT /api/v1/admin/support-tickets/:id/reply`| Admin | Reply to ticket & notify submitter |
| **Admin** | `GET /api/v1/admin/pickup-requests` | Admin | Filter all pickup jobs |
| | `PUT /api/v1/admin/pickup-requests/:id/assign` | Admin | Assign active collector to job |
| | `GET /api/v1/admin/redemptions` | Admin | List redemption payout requests |
| | `PATCH /api/v1/admin/redemptions/:id` | Admin | Approve / Pay (TrxID) / Reject (Refund) |
| | `GET /api/v1/admin/collection-records` | Admin | Audit certified weigh receipts |
| | `PUT /api/v1/admin/collection-records/:id` | Admin | Weight dispute correction & balance guard |
| | `GET /api/v1/admin/categories` | Admin | Manage categories & point rates |
| | `POST /api/v1/admin/categories` | Admin | Add new recyclable category |
| | `PUT /api/v1/admin/categories/:id` | Admin | Update category tariff & active state |
| | `GET /api/v1/admin/zones` | Admin | View operational zones |
| | `POST /api/v1/admin/zones` | Admin | Add new operational zone |
| | `PUT /api/v1/admin/zones/:id` | Admin | Update zone boundaries & active status |
| | `GET /api/v1/admin/redemption-rules` | Admin | List current & archived payout tariffs |
| | `POST /api/v1/admin/redemption-rules` | Admin | Set new active currency conversion rule |
| | `GET /api/v1/admin/users` | Admin | User & collector accounts audit |
| | `POST /api/v1/admin/collectors` | Admin | Provision new collector account |
| | `PATCH /api/v1/admin/users/:id/status` | Admin | Activate / deactivate user account |
| | `PATCH /api/v1/admin/users/:id/zone` | Admin | Reassign collector's operating zone |
| | `GET /api/v1/admin/reports/:type` | Admin | 5 SQL BI reports (weight, volume, KPI, liability, payout) |

*Full request/response schemas, status codes, and payload contracts are documented in [`api-spec.md`](api-spec.md).*

---

## 🧪 Automated Testing & Benchmark Compliance

Run test suites from the `backend/` directory:

```bash
cd backend

# 1. Run unit test suite (Validators, state machines, math precision, security rules)
npm test

# 2. Run API integration suite (Runs on isolated test database wrr_test)
npm run test:api

# 3. Run complete lifecycle end-to-end integration walkthrough (45 assertions)
npm run e2e

# 4. Run static frontend compliance check (CSP, no inline JS, no innerHTML)
npm run check:frontend

# 5. Run NFR-02 high-concurrency performance benchmark (50 virtual users, 1,000 queries)
npm run perf
```

### 📊 Benchmark Performance Results (NFR-02 Verification)
- **Core Transactional API Response Time:** ~150 ms *(Well within the <= 2.0 s SLA threshold)*
- **Complex Analytical BI Reports:** ~110 ms *(Well within the <= 5.0 s SLA threshold)*
- **Test Integrity:** API tests automatically spin up and tear down a dedicated `wrr_test` database, completely safeguarding production and development data from corruption.

---

## 📂 Directory Structure

```
Waste_Resource_Recycle/
├── backend/
│   ├── src/
│   │   ├── config/          # MySQL connection pool (Bangladesh BST timezone), secrets
│   │   ├── middleware/      # Auth (HttpOnly JWT), RBAC, rate limiter, CSP security headers, error handler
│   │   ├── routes/          # REST route routers mounted under /api/v1
│   │   ├── controllers/     # Request validation, status codes, response serialization
│   │   ├── services/        # Business workflows, state machines, ACID transactions, notifications
│   │   ├── models/          # Prepared parameterized SQL queries only
│   │   ├── utils/           # AppError, transaction wrapper, money & image helpers, photo store
│   │   └── app.js           # Express app setup and static frontend serving
│   ├── test/                # Unit test suites and API integration tests
│   ├── scripts/             # Performance benchmark, E2E walkthrough, frontend checker
│   └── package.json
├── database/
│   ├── schema.sql           # Complete 11-table relational DDL with constraints & indexes
│   ├── seed.sql             # Test users, default zones, waste rates, and sample lifecycle data
│   └── migrations/          # Incremental database migration scripts (photo, support tickets)
├── frontend/
│   ├── index.html           # Public landing page with live category tariffs
│   ├── login.html           # Authentication portal
│   ├── register.html        # Citizen self-registration
│   ├── help.html            # Public FAQ and emergency contact information
│   ├── support.html         # User & collector help desk and ticket submission
│   ├── user/                # Resident portal (Dashboard, New Request, Requests, History, Redeem)
│   ├── collector/           # Field operative portal (Dashboard, Assigned Jobs, Record Weight, History)
│   ├── admin/               # Municipal admin portal (Dashboard, Queues, Redemptions, Governance, Reports)
│   ├── css/style.css        # Responsive mobile-first CSS3 theme
│   └── js/                  # Reusable ES6+ modules (api.js, ui.js, auth.js, notifications.js)
├── docs/                    # Architecture diagrams, test cases, ERD, viva defense notes, Railway deployment guide
├── .github/                 # Issue templates (Bug Report, Feature Request) & PR template
├── LICENSE                  # MIT License
├── CONTRIBUTING.md          # Contribution guidelines and coding conventions
├── AGENTS.md                # Engineering handbook for developers and AI agents
└── README.md                # Primary repository documentation
```

---

## 📚 Academic Documentation Index

| File | Scope & Technical Focus |
|---|---|
| [`WRR_PRD.md`](WRR_PRD.md) | **Single Source of Truth:** Requirements (FR-01–FR-22, NFR-01–NFR-08), state machine & business rules |
| [`api-spec.md`](api-spec.md) | Comprehensive API manual: routes, payloads, responses, validation, and error envelopes |
| [`database.md`](database.md) | Database architecture: table specifications, indexes, foreign keys, transaction workflows |
| [`architecture.md`](architecture.md) | System architecture: layered monolith design, security boundaries, and middleware integration |
| [`dfd.md`](dfd.md) | Structured analysis: Level 0 Context Diagram, Level 1 DFD, and Level 2 process decomposition |
| [`docs/er-diagram.md`](docs/er-diagram.md) | Up-to-date Entity Relationship Diagram (ERD) matching `schema.sql` |
| [`docs/test-cases.md`](docs/test-cases.md) | 50 academic test cases covering all FRs, edge cases, and non-functional requirements |
| [`docs/viva-notes.md`](docs/viva-notes.md) | Viva examination preparation guide with architectural rationales and 20 sample Q&As |
| [`docs/deploy-railway.md`](docs/deploy-railway.md) | Production cloud deployment runbook (Railway server, MySQL, and persistent volume) |

---

## 👥 Engineering Team & Credits

- **MD Mohiuddin Molla** — Registration: `2022254878`
- **Abdul Al Noman** — Registration: `935`
- **Supervisor:** **Mohammad Shamsul Islam**, Associate Professor & Head, Department of Computer Science and Engineering, Faridpur Engineering College.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for complete details.

---

<p align="center">
  <sub>Built with ❤️ for CSE-3112 Software Engineering Lab · Faridpur Engineering College</sub>
</p>
