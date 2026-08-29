# KKS Repair replacement

Independent replacement for the former vendor-hosted KKS Repair application.

## GitHub checkout versus private recovery package

This repository intentionally excludes `data/`, `manuals/`, `.env`, raw HAR files, and private recovery JSON. Those paths contain migrated customer/account information or the large recovered handbook archive and must never be committed to a public repository.

A GitHub clone contains the application source, catalog/menu metadata, vehicle images, recovery tools, and deployment configuration. To reproduce the complete recovered installation, privately copy `data/kks-repair.db` and the `manuals` directory from the owner's recovery package into the clone before starting or deploying it.

## Recovered content

- 21 vehicle records
- 3 brands
- 49 member accounts
- 52 authorization codes
- 21 vehicle images
- 16 manual bindings/folder mappings
- 14,295 recovered handbook menu records
- 10,201 identified repair, system, and wiring documents
- 105,742 physical handbook files (6.51 GiB), including 95,541 linked images, diagrams, stylesheets, scripts, and subpages beyond the indexed HTML set

The deployable SQLite database is already stored at `data/kks-repair.db`. Recovered customer passwords were converted from the legacy plaintext values to salted scrypt hashes during import.

## Local run

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env` and set a new administrator email and password.
3. Run:

   ```text
   npm install
   npm run build
   npm start
   ```

4. Open `http://localhost:3000`.

The configured administrator is created automatically on first startup. Keep the `data` directory private because it contains member and authorization-code data.

## Server deployment

The application currently supports two independent switches:

- `DATA_BACKEND=sqlite|mysql|supabase`
- `MANUAL_STORAGE=local|supabase`

Both default to the recovered local implementation. This makes rollback a configuration change instead of a data restore. Use the temporary Hostinger hostname for side-by-side testing and do not change the production domain until the replacement passes the checks below.

### Hostinger MySQL migration

Hostinger managed Node.js deployments keep build output outside `public_html`, so SQLite files bundled with a release are not a reliable long-term store across future redeployments. The `mysql` backend keeps customer accounts, sessions, authorization codes, vehicles, and admin edits in the hosting plan's managed MySQL service while the large manuals remain in the existing protected bundle store.

1. Create a dedicated Hostinger MySQL database and set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` as server-only environment variables.
2. Keep the recovered SQLite file in the first migration deployment and set `MYSQL_MIGRATION_PATH=data/kks-repair.db`.
3. Set `DATA_BACKEND=mysql` only after the new database is empty. At startup, the application creates its schema and imports brands, vehicles, members, authorization codes, and manual-menu rows in one transaction. It refuses to import into a non-empty unmarked database.
4. Verify `/health` reports `backend: mysql`, then test customer/admin login and an admin write before treating the migration as complete.
5. Keep the SQLite and Hostinger database backups for rollback. After the migration marker exists, future starts skip the import automatically.

Database credentials must remain in Hostinger environment settings and must never be placed in Git, a deployment archive, browser code, or logs.

### Recommended Hostinger-first model

For the current workload, use `DATA_BACKEND=mysql` and keep `MANUAL_STORAGE=local`. The structured data remains in the hosting plan's managed MySQL service, while the 6.99 GB handbook archive continues to use the existing protected bundle parts. This avoids an external paid storage service and ensures admin changes survive Node.js redeployments.

Keep these persistent files outside the deployed source release and deny direct web access to their directory:

```text
private-data/manuals.bundle.000 (and the remaining numbered parts)
private-data/manuals-index.json
```

Keep the SQLite recovery database as an offline rollback artifact rather than the active production database. The application exposes handbook entries only through the authenticated `/manuals/*` route. A deployment must never package the manual files or commit private data to Git. After every deployment, verify their exact sizes and test both an authenticated manual request and an unauthenticated rejection.

Hostinger managed Node.js builds run outside `public_html` and cannot directly mount its large persistent files. On that platform, set `MANUAL_REMOTE_BASE_URL` to the protected `private-data` URL and `MANUAL_REMOTE_TOKEN` to a long random server-only value. The `private-data/.htaccess` rule must require the matching `X-KKS-Storage-Key` header and set `Cache-Control: private, no-store`. The Node.js adapter then range-proxies only authenticated handbook requests; ordinary requests to `private-data` remain forbidden.

The customer interface is English-only. Recovered Chinese and Japanese service-sheet branches are excluded at the presentation boundary, and recovered non-English vehicle descriptions receive a neutral English service-information summary. The source recovery data remains unchanged for audit and rollback.

For a conventional Linux server deployment:

1. Copy this project to the new Linux server.
2. Create `.env` from `.env.example`.
3. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `PUBLIC_ORIGIN`.
4. Build and run the included Dockerfile or deploy the Node.js source to Hostinger.
5. Verify the application using the server IP or a temporary hostname.
6. Only after verification, change the domain's DNS A/AAAA records to the new server.

In local mode, back up `data/kks-repair.db` and either the `manuals` directory or the bundle/index pair together. Hostinger Business daily backups are useful for short-term recovery, but keep the owner's local recovery package as a separate backup.

## Supabase side-by-side migration

The Supabase design keeps the existing server-rendered application and its custom scrypt passwords. Only the trusted Node.js server connects to Supabase. Browser roles have no table privileges, all public tables have RLS enabled, and manuals are stored in a private bucket and streamed through the authenticated application route.

The recovered manual corpus is 6,993,888,685 bytes (about 6.99 GB decimal). Supabase's Free organization quota is currently 1 GB of Storage, so the full manual migration requires a paid organization with enough Storage capacity. See [Supabase Storage size usage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size). If the organization remains Free, keep `MANUAL_STORAGE=local`; do not start a partial Storage cutover.

1. Create a dedicated Supabase project in the intended organization and region.
2. Apply `supabase/migrations/20260829043156_create_kks_schema.sql`.
3. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_EXPECTED_PROJECT_REF` locally. The expected ref is a write-safety pin and must match the URL.
4. Validate the database import without writing:

   ```text
   npm run migrate:supabase
   ```

5. Import and verify every structured row:

   ```text
   npm run migrate:supabase -- --apply
   ```

6. Inventory the manual corpus, then upload it. Completed objects are journaled so the command can be resumed safely. Files above 6 MB use Supabase's resumable TUS endpoint.

   ```text
   npm run upload:supabase-manuals
   npm run upload:supabase-manuals -- --apply
   ```

7. Independently compare every remote object path and size, then download and SHA-256-check deterministic samples including the largest file:

   ```text
   npm run verify:supabase-manuals
   ```

8. On the temporary deployment only, set `DATA_BACKEND=supabase` and `MANUAL_STORAGE=supabase`. Test customer/admin login, registration-code redemption, vehicle/manual browsing, admin edits, logout, and restart persistence.
9. To roll back, restore `DATA_BACKEND=sqlite` and `MANUAL_STORAGE=local`; the local database and manual files remain untouched during side-by-side testing.

Never place `SUPABASE_SECRET_KEY` in public JavaScript, HTML, logs, screenshots, or Git. It bypasses RLS and belongs only in server environment settings.

## Manual recovery and resuming downloads

The complete handbook hierarchy is included in `recovery/catalog/manual-menus.json` and imported automatically when a new database is created. Recovered manual files are stored under:

```text
manuals/<vehicle-folder>/html/<Repair|System|Wiring>/<page-file>
```

The recovery commands are resumable and skip files that already exist:

```text
npm run recover:manual-html
npm run recover:manual-assets
```

The first command mirrors all indexed HTML pages. The second follows same-manual links and downloads images, stylesheets, scripts, subpages, and diagrams. Its default safety limit is 24 GB; edit the package script or run `node scripts/recover-manual-assets.mjs --concurrency=20 --max-gb=40` if a later pass needs more capacity.

Progress reports are written to `recovery/manual-download-report.json` and `recovery/manual-asset-report.json`.

The included archive has completed both recovery commands. The final linked-resource audit processed 126,471 URLs: 105,747 successful URL entries mapped to 105,742 physical files, 20,724 references were confirmed as 404 on the former vendor site, and zero requests remained failed. Run `npm run verify:recovery` after copying the project to verify the database-to-file links and detect partial downloads.

For hosting platforms that cannot efficiently upload 105,742 individual manual files, run `npm run build:manual-bundle`, then `npm run shard:manual-bundle -- --part-mb=256`. The second command creates `manuals.bundle.000`, sequentially numbered parts of at most 256 MiB, and `manuals-index-v2.json`. Upload every numbered part first, upload the version 2 index last as `manuals-index.json`, and keep `MANUAL_BUNDLE_PATH` pointed at the `manuals.bundle` base path. Smaller independent parts make failed transfers and future replacements inexpensive to retry. The reader remains backwards compatible with the original single-file version 1 bundle.

Before and after transferring the bundle, run `npm run verify:manual-bundle -- --index=private-transfer/manuals-index-v2.json`. It proves that every source path and byte length is represented contiguously across all parts and SHA-256 checks deterministic samples against the original files.

After each upgrade, run the read-only deployment smoke test with temporary customer and administrator accounts. Credentials are passed only through the shell environment and must not be saved in Git:

```text
VERIFY_BASE_URL=https://temporary-hostname.example \
VERIFY_CUSTOMER_EMAIL=... VERIFY_CUSTOMER_PASSWORD=... \
VERIFY_ADMIN_EMAIL=... VERIFY_ADMIN_PASSWORD=... \
npm run verify:deployment -- --manual=vehicle-folder/html/Repair/example.html
```

The check covers health, direct private-file denial, customer and administrator login, the catalogue, manual byte delivery, and the main administration pages. It performs no database writes.

## Security notes

- Never commit `.env`, `data`, `manuals`, HAR files, or raw recovery JSON to a public repository.
- Force a password reset after migration. The old application exposed legacy passwords as plaintext to its administrator API.
- Use a new administrator password that was never used on the former site.
- Test backups and account access before switching DNS.
