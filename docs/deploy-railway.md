# Deploying WRR on Railway

One Railway **project** holds two services: the **web** service (this repository: the Express server, which also serves `frontend/`) and a **MySQL** database. Pickup photos are kept on a Railway **volume**. The architecture stays the same as on your own computer: one server, one origin, one database (architecture.md §8).

Files in the repository that Railway uses:

| File | Purpose |
|---|---|
| `package.json` (repository root) | Railway runs its `build` script (installs `backend/`) and its `start` script (starts the server); Node 22 |
| `backend/scripts/db-setup.js` | `npm run db:setup`: loads `schema.sql` + `seed.sql` once (refuses if tables already exist) |

> Railway is a paid service after its free trial credit. Check the current prices on railway.com before you start.

## 1. Create the project

1. Sign in to [railway.com](https://railway.com) with GitHub.
2. **New Project → Deploy from GitHub repo →** choose `Waste-Resource-Recycle`. Leave **Root Directory** empty (the server needs both `backend/` and `frontend/`).
3. The first deploy fails because no settings are there yet; that is expected.

## 2. Add the database

1. In the project: **+ Create → Database → MySQL**.
2. Wait until the MySQL service is running.

## 3. Add a volume for photos

1. Right-click the web service → **Attach volume**.
2. Mount path: `/data`.

## 4. Set the variables of the web service

Web service → **Variables → Raw Editor**, paste and fill in:

```
NODE_ENV=production
TRUST_PROXY=1
UPLOAD_DIR=/data
JWT_SECRET=<64 random hex characters, see below>
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=wrr_db
```

- Make the secret on your computer: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Use a new one, not the one in your local `.env`.
- `${{MySQL.…}}` are Railway references to the database service (if you renamed it, use its name). They use Railway's private network, so no SSL setting is needed.
- Do **not** set `PORT`; Railway sets it and the server reads it.
- `NODE_ENV=production` makes the login cookie `Secure` (HTTPS only). Railway domains are HTTPS, so this is right.
- `TRUST_PROXY=1`: Railway has one proxy in front of the server. Without it, the login limit (5 failed tries / 15 min) would count every visitor together.

## 5. Create the tables (once)

The database is still empty. A new Railway MySQL is only reachable inside Railway, so open a **temporary** public port, load the tables from your own computer, and close the port again.

1. Open the port: MySQL service → **Settings → Networking → TCP Proxy**, port `3306` (or `railway tcp-proxy create --port 3306 --service MySQL`). Railway shows an address such as `thomas.proxy.rlwy.net:24149`.
2. MySQL service → **Variables**: copy `MYSQLPASSWORD`.
3. In PowerShell (fill in host, port and password; choose your own admin password, at least 8 characters):

   ```powershell
   cd backend
   $env:DB_HOST="thomas.proxy.rlwy.net"; $env:DB_PORT="24149"; $env:DB_USER="root"
   $env:DB_PASSWORD="MYSQLPASSWORD-value"; $env:DB_NAME="wrr_db"; $env:ADMIN_PASSWORD="your-new-admin-password"
   npm run db:setup
   ```

   Expected output: `Ran database/schema.sql …`, `Ran database/seed.sql …`, `Set a new password for admin@wrr.com.`
4. **Close the port again:** delete the TCP proxy in the same settings page (or `railway tcp-proxy delete <id> --service MySQL --yes`). The web service does not need it; it uses the private network.
5. Close that PowerShell window (it holds the database password), then restart the web service once so it reconnects.

`db:setup` uses the backend's own mysql2 driver, because XAMPP's older `mysql.exe` client often cannot log in to MySQL 8+ (`caching_sha2_password`). Running it a second time does nothing: it stops when the tables already exist. `--force` wipes everything, so never use it on a database with real data.

> **Railway CLI from Git Bash:** Git Bash turns `/data` into `C:/Program Files/Git/data`. Run `export MSYS_NO_PATHCONV=1` first, or use PowerShell.

## 6. Deploy and open the site

1. Web service → **Deployments → Redeploy** (or push to `main`; every push deploys again).
2. Web service → **Settings → Networking → Generate Domain**. Railway gives an address such as `https://waste-resource-recycle-production.up.railway.app`.
3. Open it and log in as `admin@wrr.com` with the password from step 5.
4. The logs should show `WRR server running …` and `Successfully connected to database: wrr_db`.

## 7. Before real people use it

- **Demo accounts.** `seed.sql` also creates demo users and collectors with the password `password123` (it is in the public repository) and a few sample requests. That is handy for a viva demo. For real use, deactivate those accounts in **Admin → Users** and create real collectors in **Admin → Collectors**.
- **Seed photos.** The sample requests have no photo file on the volume, so their photo is not shown. New requests are fine.
- **Backups.** The data lives in the MySQL service and the photos on the volume; Railway can back up volumes (service → Backups).

## Troubleshooting

| Problem | Cause / fix |
|---|---|
| Deploy log mentions `JWT_SECRET` and the server stops | `JWT_SECRET` missing, shorter than 32 characters or the example value |
| Logs: `Database connection error`, health check fails | Check the `DB_*` variables and that the MySQL service is running; `DB_NAME` must be `wrr_db` (the name `db:setup` created) |
| API answers `Table … doesn't exist` | Step 5 was not done |
| Login works but you are logged out at once | The site was opened over `http://`; use the `https://` address |
| Every visitor gets "Too many failed login attempts" together | `TRUST_PROXY=1` is missing |
| Photos disappear after a redeploy | Volume not attached at `/data`, or `UPLOAD_DIR` is not `/data` |
| A push to `main` does not start a deploy | The Railway GitHub App is not installed for the repo: GitHub → Settings → Applications → Installed GitHub Apps must list **Railway** with access to `Waste-Resource-Recycle` (install it from github.com/apps/railway-app). Then web service → Settings → Source shows branch `main` |
