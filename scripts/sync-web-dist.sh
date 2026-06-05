#!/bin/bash
# Sync web static files from the git source (apps/web/public/, apps/web/admin/)
# to the Caddy-served apps/web/dist/. Web-only — NO API restart.
#
# Why: Caddy serves apps/web/dist/, but git stores the editable files in
# apps/web/public/ (+ apps/web/admin/). A plain `git pull` updates public/ and
# leaves dist/ stale, so dashboard/landing changes never reach users. This
# script bridges that gap and is wired to run automatically from a git
# post-merge hook (fires after every `git pull`), and is safe to run manually.
#
# dashboard.html is intentionally SKIPPED — it is promoted to prod separately
# via Admin → Releases → Publish (canary flow). Everything else syncs:
# dashboard-staging.html, index/login/register/onboarding/checkout/about/auto-pilot, etc.
set -e

# Resolve repo root whether invoked from a hook (cwd=repo root) or manually.
REPO="$(git rev-parse --show-toplevel 2>/dev/null || echo /opt/openclaw-hosting)"
cd "$REPO"

WEB_PUBLIC=apps/web/public
WEB_DIST=apps/web/dist
mkdir -p "$WEB_DIST"
synced=0
for f in "$WEB_PUBLIC"/*.html; do
    [ -e "$f" ] || continue
    name=$(basename "$f")
    if [ "$name" = "dashboard.html" ]; then continue; fi   # admin-published
    cp -f "$f" "$WEB_DIST/$name"
    synced=$((synced + 1))
done

ADMIN_SRC=apps/web/admin
ADMIN_DST=apps/web/dist/admin
if [ -d "$ADMIN_SRC" ]; then
    mkdir -p "$ADMIN_DST"
    for f in "$ADMIN_SRC"/*.html; do
        [ -e "$f" ] || continue
        cp -f "$f" "$ADMIN_DST/$(basename "$f")"
        synced=$((synced + 1))
    done
fi

echo "[sync-web-dist] synced $synced static file(s) public/+admin/ → dist/ (dashboard.html skipped — Admin Publish)"
