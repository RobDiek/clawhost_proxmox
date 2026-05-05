#!/bin/bash
# Idempotent prod deploy script for openclaw-hosting (master server only).
# Run from /opt/openclaw-hosting on the prod box. Safe to run repeatedly.
#
# Why this exists: Caddy serves static HTML from apps/web/dist/, but git stores
# them in apps/web/public/. Without an explicit sync step, pulling new commits
# updates public/ but leaves dist/ stale — so master users keep seeing the old
# dashboard after a deploy. This script bridges the gap.
#
# Steps:
#   1. Stash any prod-local uncommitted changes (some files like
#      infra/docker-compose.yml.disabled, dashboard.html, etc. tend to drift
#      via direct edits — preserve them).
#   2. Pull origin/Production.
#   3. Pop stash. Auto-resolve recurring conflicts in known files by taking
#      the pulled (origin) version (--ours after pop is the freshly-pulled
#      side; matches the "trust origin" rule from feedback_prod_via_commits).
#   4. Sync apps/web/public/*.html → apps/web/dist/ so Caddy serves the
#      latest. dashboard.html is intentionally NOT synced — it's promoted to
#      prod via Admin → Releases → Publish (canary flow).
#      We sync EVERYTHING ELSE: dashboard-staging.html, index.html, login.html,
#      register.html, onboarding.html, checkout.html, about.html, auto-pilot.html.
#   5. systemctl restart clawflow-api.
#   6. Probe /hosting/auth/me — expect 401 (means API + DB up).
set -e

cd /opt/openclaw-hosting

echo "=== STASH local prod-WIP ==="
STASH_MSG="prod-deploy-$(date +%s)"
git stash push -u -m "$STASH_MSG" 2>&1 | tail -2 || true

echo "=== PULL origin/Production ==="
git pull origin Production 2>&1 | tail -5

if git stash list | grep -q "$STASH_MSG"; then
    echo "=== POP stashed prod-WIP ==="
    git stash pop 2>&1 | tail -10 || true

    # Auto-resolve recurring conflicts. Take ours (= the freshly-pulled
    # version) for these files; prod-side WIP for them is usually drift
    # that the team accepted to abandon when migrating to commit-only flow.
    CONFLICTS=$(grep -lr --include='*.ts' --include='*.html' --include='*.js' '^<<<<<<<' apps/ infra/ 2>/dev/null || true)
    if [ -n "$CONFLICTS" ]; then
        echo "=== AUTO-RESOLVE conflicts (taking pulled version) ==="
        for f in $CONFLICTS; do
            git checkout --ours "$f"
            git add "$f"
            echo "  resolved: $f"
        done
    fi
    if git stash list | grep -q "$STASH_MSG"; then
        git stash drop 2>&1 | tail -1 || true
    fi
fi

echo "=== SYNC public/*.html → dist/ (skipping dashboard.html — uses Admin Publish) ==="
WEB_PUBLIC=apps/web/public
WEB_DIST=apps/web/dist
mkdir -p "$WEB_DIST"
for f in "$WEB_PUBLIC"/*.html; do
    name=$(basename "$f")
    # Skip dashboard.html — promotion is via Admin → Releases → Publish, not git pull.
    if [ "$name" = "dashboard.html" ]; then
        echo "  skip (admin-published): $name"
        continue
    fi
    cp -f "$f" "$WEB_DIST/$name"
    echo "  synced: $name"
done

echo "=== RESTART clawflow-api ==="
systemctl restart clawflow-api
sleep 8
echo "=== STATUS ==="
systemctl is-active clawflow-api
echo "=== HEAD ==="
git log -1 --oneline
echo "=== HEALTH ==="
curl -sS -m 5 -o /dev/null -w 'auth/me: %{http_code}\n' http://localhost:3001/hosting/auth/me
