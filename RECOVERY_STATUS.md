# Recovery status

Updated: 2026-08-29 (Asia/Hong_Kong)

## Completed

- Captured and validated the original administrative HAR and a separate sanitized authenticated handbook HAR.
- Recovered every paginated vehicle, brand, member, and authorization-code API response.
- Recovered all 21 vehicle images; one missing HAR body was downloaded directly from its source URL.
- Recovered the complete public frontend and 71 compiled admin JavaScript bundles.
- Identified the original stack and all core data fields.
- Recovered all 16 unique handbook menu trees with 14,295 menu records.
- Reconstructed the shared-manual mappings for all 21 vehicles, producing 19,102 vehicle/menu rows.
- Downloaded all 10,201 indexed Repair, System, and Wiring HTML documents with zero missing or failed indexed pages.
- Recovered and verified 105,742 physical handbook files (6.51 GiB), including 95,541 supplemental images, diagrams, stylesheets, scripts, and linked subpages beyond the indexed HTML set.
- Completed the same-manual resource audit across 126,471 URLs: 105,747 successful URL entries, 20,724 confirmed old-site 404s, zero failed requests, and zero partial files.
- Fixed aborted/closed-response handling in the resumable crawler and completed a clean retry pass.
- Built a standalone TypeScript/Express/SQLite replacement.
- Imported all recovered records into the deployable database.
- Added create and edit screens for vehicles, members, and authorization codes.
- Converted legacy plaintext passwords to salted scrypt hashes.
- Added secure sessions, CSRF protection, login throttling, security headers, and origin checking.
- Added Docker Compose and Caddy deployment configuration.
- Protected handbook files behind application sign-in instead of exposing them as public static files.
- Passed the TypeScript build, automated tests, health check, authentication checks, handbook access check, and recovered-count verification.
- Re-ran the final smoke test against the packaged database: health and landing page returned 200, and unauthenticated handbook access redirected to sign-in.

## Still required

- Test the Docker image on a machine with Docker (Docker is not installed on this workstation).
- Deploy to the selected server and switch DNS only after acceptance testing.
- Rotate the administrator credentials and require migrated customers to reset their passwords.

## Verified counts

| Data | Count |
|---|---:|
| Vehicles | 21 |
| Brands | 3 |
| Members | 49 |
| Authorization codes | 52 |
| Vehicle images | 21 |
| Manual bindings | 16 |
| Recovered menu records | 14,295 |
| Vehicle/menu rows | 19,102 |
| Indexed handbook HTML documents | 10,201 |
| Physical handbook files | 105,742 |
| Supplemental handbook files | 95,541 |
| Handbook archive size | 6,993,888,685 bytes (6.51 GiB) |
| Confirmed old-site 404 references | 20,724 |
| Remaining failed asset requests | 0 |
