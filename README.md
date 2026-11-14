# Waste Resource Recycle (WRR)

**🌐 Live demo: https://waste-resource-recycle.up.railway.app** · 📋 [Project board](https://github.com/users/elnMohiuddinMolla/projects/2)

A web platform that connects households with local waste collectors for recyclable waste pickup. Households request a pickup, a collector weighs the waste on site, and the household earns reward points (actual kg × category rate) that can be redeemed for cash via bKash, Nagad or bank transfer.

**CSE-3112 Software Engineering Lab** · Faridpur Engineering College
**Supervisor:** Mohammad Shamsul Islam, Associate Professor & Head, Dept. of CSE
**Team:** MD Mohiuddin Molla (Reg: 2022254878), Abdul Al Noman (Reg: 935)

---

## Status

| Part | State |
|---|---|
| Requirements & design (PRD, API spec, database, architecture, DFD) | Done |
| Database schema + seed data | Done |
| Backend REST API — all 50 endpoints | Done, tested and audited |
| Frontend (User, Collector, Admin portals) | Done |
| End-to-end testing, test cases, ER diagram, viva notes | Done |

Progress is tracked step by step in [`prompt.md`](prompt.md) and on the GitHub project board: **[Waste Resource Recycle board](https://github.com/users/elnMohiuddinMolla/projects/2)** (one issue per task A1–E2, plus the open manual checks).

## Features

- **General users:** register, submit pickup requests (category, a photo of the waste, estimated kg, address, preferred time), track each request with a full status timeline, cancel while pending, view the points ledger, request cash redemption, in-website notifications, open support tickets.
- **Waste collectors:** see assigned jobs with the waste photo, accept / reject (with reason) / abort on site, record the actual weight, complete the job (points are credited automatically), view collection history, open support tickets.
- **Administrators:** assign and reassign collectors, approve / pay / reject redemptions (rejection refunds the points), correct weights (with a balancing ledger entry), manage zones, waste categories, redemption rules and accounts, answer support tickets, and run 5 management reports.
- **Everyone:** a public Help & FAQ page with the admin's contact details.

Key rules: a strict 8-transition request state machine, a signed points ledger whose balance can never go negative, rate snapshots so later rate changes never alter past rewards, and row locks that prevent double-spending.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, JavaScript (served by the same Express server) |
| Backend | Node.js 22, Express 4 — layered `routes → controllers → services → models` |
| Database | MySQL 8.0+ or MariaDB 10.4+ (XAMPP) |
| Auth | bcryptjs + JWT in an `HttpOnly` cookie |

## Getting started

### 1. Requirements
- [Node.js](https://nodejs.org/) 22 (LTS); the test scripts need Node 21 or newer
- [XAMPP](https://www.apachefriends.org/) (only its MySQL/MariaDB is used)

### 2. Database
1. Start **MySQL** in the XAMPP Control Panel.
2. In phpMyAdmin (`http://localhost/phpmyadmin`) or the MySQL CLI, import **`database/schema.sql`**, then **`database/seed.sql`**. This creates the `wrr_db` database with 11 tables and test data.

   CLI alternative (Git Bash):
   ```
   /c/xampp/mysql/bin/mysql.exe -u root < database/schema.sql
   /c/xampp/mysql/bin/mysql.exe -u root < database/seed.sql
   ```
   **Already have a `wrr_db` from before 12 Nov 2026?** Run the migrations once, in order, instead of re-importing. They only add new things and keep your data:
   ```
   /c/xampp/mysql/bin/mysql.exe -u root < database/migrations/001_add_pickup_photo.sql
   /c/xampp/mysql/bin/mysql.exe -u root < database/migrations/002_add_support_tickets.sql
   ```
   | Migration | What it adds | PRD |
   |---|---|---|
   | `001_add_pickup_photo.sql` | `pickup_requests.photo_path` column (waste photo) | v1.4.0 |
   | `002_add_support_tickets.sql` | `support_tickets` table (help & support) | v1.5.0 |

   Run each one only once: running 001 again fails with "Duplicate column", and 002 with "Table already exists". Both mean it is already done.

### 3. Backend
```
cd backend
npm install
cp .env.example .env
```
Open `backend/.env` and set `JWT_SECRET` to a long random value (the server refuses to start with the example value or anything shorter than 32 characters). Generate one with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
If your MySQL `root` user has a password, set `DB_PASSWORD` as well.

### 4. Run
```
cd backend
npm run dev
```
You should see:
```
WRR server running at http://localhost:5000
Successfully connected to database: wrr_db
```

> Open `http://localhost:5000/` for the website. The API lives under `/api/v1`.

### 5. Deploy (optional)
To put the site online, follow [`docs/deploy-railway.md`](docs/deploy-railway.md): one Railway project with the server, a MySQL database and a volume for photos. `npm run db:setup` loads the tables once.

Live site: **https://waste-resource-recycle.up.railway.app**

## Trying the API

Public endpoints open directly in the browser:
- http://localhost:5000/api/v1/categories
- http://localhost:5000/api/v1/zones

For everything else, log in first with **Thunder Client** (VS Code) or **Postman** — the session cookie is kept automatically:

```
POST http://localhost:5000/api/v1/auth/login
Content-Type: application/json

{ "email": "tanvir@gmail.com", "password": "password123" }
```

Then try `GET /api/v1/auth/me`, `GET /api/v1/rewards/balance`, `GET /api/v1/pickup-requests/mine`.

### Test accounts (password for all: `password123`)

| Email | Role | Notes |
|---|---|---|
| `admin@wrr.com` | Administrator | |
| `collector1@wrr.com` | Collector | Zone 1, has an accepted job (#2) |
| `collector2@wrr.com` | Collector | Zone 2 |
| `tanvir@gmail.com` | User | Zone 1, balance 55.00 points |
| `sadia@gmail.com` | User | Zone 3, has a pending request (#3) |

Every endpoint, body and status code is documented in [`api-spec.md`](api-spec.md).

## Tests

Run from `backend/`:

| Command | What it does | Needs MySQL |
|---|---|:---:|
| `npm test` | Unit tests (state machines, validators, security checks) | No |
| `npm run test:api` | API tests for every endpoint | Yes |
| `npm run e2e` | Full story end to end (register → request → assign → reject → reassign → weigh → complete → redeem → pay → reject → corrections → reports → deactivate), 45 checks | Yes |
| `npm run check:frontend` | Static checks of all pages: files exist, links work, no inline code, no innerHTML | No |
| `npm run perf` | NFR-02 performance check: 50 users, 1,000 requests, 50 concurrent calls per endpoint | Yes |

The API and performance tests rebuild a **separate** database, `wrr_test`, from `database/*.sql`. They refuse to run against `wrr_db`, so your data is never touched.

Latest results: 23 unit + 116 API tests passing; slowest core call ~150 ms (limit 2 s) and slowest report ~110 ms (limit 5 s) with 50 concurrent users.

## Project structure

```
Waste_Resource_Recycle/
├── backend/
│   ├── src/
│   │   ├── config/        db.js (pool, Bangladesh time zone), secret.js (JWT secret check)
│   │   ├── middleware/    auth (cookie JWT), role, rate limiter, security headers, errors
│   │   ├── routes/        one router per API area, mounted under /api/v1
│   │   ├── controllers/   input checks, HTTP responses
│   │   ├── services/      business rules, transactions, state machines
│   │   ├── models/        parameterized SQL only
│   │   ├── utils/         AppError, transaction helper, validators, money
│   │   └── app.js
│   ├── test/              unit/ and api/
│   ├── scripts/           perf-check.js, e2e-walkthrough.js, frontend-check.js
│   └── .env.example
├── database/              schema.sql, seed.sql, migrations/ (changes for an existing database)
├── frontend/              HTML pages per role, css/style.css, js/ (api, ui, auth, notifications, pages/)
└── docs/                 test results, test cases, ER diagram, viva notes; archive/ = superseded documents
```

## Documentation

| Document | Contents |
|---|---|
| [`WRR_PRD.md`](WRR_PRD.md) | Requirements (FR-01–FR-22, NFR-01–NFR-08), business rules, state machine — **source of truth** |
| [`api-spec.md`](api-spec.md) | Every REST endpoint: paths, bodies, responses, validation, status codes |
| [`database.md`](database.md) | Tables, constraints, report SQL, transactions, seed data |
| [`architecture.md`](architecture.md) | Layers, security, folder structure, integration snippets |
| [`dfd.md`](dfd.md) | Data flow diagrams (Level 0–2) |
| [`requirement-validation.md`](requirement-validation.md) | Edge cases, security, validation rules, RBAC matrix |
| [`prd-analysis.md`](prd-analysis.md) | Business analysis and adopted recommendations |
| [`AGENTS.md`](AGENTS.md) | Project rules for AI coding agents and new teammates |
| [`prompt.md`](prompt.md) | Step-by-step build plan with progress tracker |
| [`WRR_Project_Idea.md`](WRR_Project_Idea.md) | Original project proposal |
| [`docs/e2e-walkthrough.md`](docs/e2e-walkthrough.md) | End-to-end walkthrough and browser checklist results |
| [`docs/test-cases.md`](docs/test-cases.md) | Test-case table for the lab report (FR, EC, NFR) |
| [`docs/er-diagram.md`](docs/er-diagram.md) | Up-to-date ER diagram from `database/schema.sql` |
| [`docs/viva-notes.md`](docs/viva-notes.md) | Viva preparation: key design points and 20 likely questions |
| [`docs/deploy-railway.md`](docs/deploy-railway.md) | Putting the site online on Railway (server + MySQL + photo volume) |
