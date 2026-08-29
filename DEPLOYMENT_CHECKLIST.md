# Deployment checklist

Use a Linux server with at least 2 CPU cores, 4 GB RAM, and 20 GB of free disk space (the recovered `manuals` directory is currently 6.51 GiB, and updates/backups need headroom). Install Docker Engine and the Docker Compose plugin first.

## 1. Upload and configure

1. Upload the complete `kks-repair-rebuild` directory to the server.
2. Copy `.env.example` to `.env`.
3. In `.env`, set:
   - `DOMAIN=kks-repair.com`
   - `PUBLIC_ORIGIN=https://kks-repair.com`
   - a private administrator email
   - a new, long administrator password that was never used on the old site
4. Protect `.env`, `data`, and `manuals` so they are not publicly downloadable or committed to a public repository.

## 2. Start without changing DNS

Run this in the project directory:

```text
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

Confirm that the `app` container reports healthy. Test with the server IP or a temporary hostname before changing the live domain.

## 3. Acceptance checks

- Sign in with the new administrator account.
- Confirm the dashboard shows 21 vehicles, 49 recovered members, and 52 authorization codes.
- Open several vehicles and documents from Repair, System, and Wiring.
- Run `npm run verify:recovery` and confirm it reports `passed: true`, 10,201 indexed documents, and zero missing or partial files.
- Confirm an unauthenticated visitor is redirected to sign in when requesting a manual URL.
- Create a temporary member and authorization code, then test sign-in and expiry behavior.
- Restart the stack and confirm the data remains available.

## 4. Switch the domain

1. Lower the DNS TTL in advance if possible.
2. Point the domain's A record to the new server IPv4 address; update or remove the AAAA record depending on IPv6 support.
3. Keep the old records noted for rollback.
4. Wait for DNS propagation and confirm Caddy obtains the HTTPS certificate.
5. Re-run the acceptance checks at `https://kks-repair.com`.

## 5. Backups

Back up these paths together:

```text
data/
manuals/
.env
```

Keep at least one encrypted backup outside the server. Test a restore before considering the migration complete.

## Rollback

If the new service fails after the DNS change, restore the previous A/AAAA records while fixing the new server. Do not delete the recovery archives or this project until the production service and backups have been verified.
