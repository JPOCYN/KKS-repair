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

The recommended deployment is Docker Compose with Caddy:

1. Copy this project to the new Linux server.
2. Create `.env` from `.env.example`.
3. Set `DOMAIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `PUBLIC_ORIGIN`.
4. Run `docker compose up -d --build`.
5. Verify the application using the server IP or a temporary hostname.
6. Only after verification, change the domain's DNS A/AAAA records to the new server.

Caddy obtains and renews HTTPS certificates automatically. Back up `data/kks-repair.db`, `data/kks-repair.db-wal` (when present), and the `manuals` directory together.

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

For hosting platforms that cannot efficiently upload 105,742 individual manual files, run `npm run build:manual-bundle`. The app serves `private-transfer/manuals.bundle` using `private-transfer/manuals-index.json` when `MANUAL_BUNDLE_PATH` and `MANUAL_INDEX_PATH` point to those private files. Bundle requests remain protected by application sign-in and support HTTP byte ranges.

## Security notes

- Never commit `.env`, `data`, `manuals`, HAR files, or raw recovery JSON to a public repository.
- Force a password reset after migration. The old application exposed legacy passwords as plaintext to its administrator API.
- Use a new administrator password that was never used on the former site.
- Test backups and account access before switching DNS.
