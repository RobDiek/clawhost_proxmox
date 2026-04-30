# Stack Migrations

Each migration is a standalone bash script that runs on a client VPS via the
upgrade flow (`POST /hosting/instances/:id/upgrade`).

## Naming convention
`YYYY-MM-DD-short-description.sh` — must be unique forever.

## Contract
1. Idempotent — re-runnable without harm.
2. Exit 0 on success, non-zero on failure.
3. Last line of stdout must be `MIGRATION_OK` exactly (the executor greps for it).
4. Verify your work at the end (e.g. `docker compose ps | grep -q "service.*Up"`).
5. No interactive prompts. No AI commands. No `rm -rf` outside `/var/openclaw/`.
6. Idempotency markers can live in `/var/openclaw/migration-marks/<id>.done`.

## How it runs
1. Mgmt API takes a Hetzner snapshot (24h retention).
2. Each pending migration is `curl`d down + executed sequentially.
3. On any failure → snapshot restored, instance rolled back.
4. After all succeed → version.json bumped to latest stackVersion.
5. `docker compose pull && up -d --remove-orphans` final step.

## Registering
Add the migration filename (without `.sh`) to `apps/web/public/version.json`
in the `migrations` array.
