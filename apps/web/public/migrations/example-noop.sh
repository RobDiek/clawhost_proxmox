#!/bin/bash
# Example no-op migration. Verifies the upgrade plumbing works end-to-end
# without changing anything on the VPS. Safe to run/re-run on any instance.
#
# Contract reminder:
#   - Idempotent
#   - Exit 0 on success
#   - Last line of stdout MUST be "MIGRATION_OK"

set -e

MARK_DIR=/var/openclaw/migration-marks
mkdir -p "$MARK_DIR"

if [ -f "$MARK_DIR/example-noop.done" ]; then
    echo "Already applied — skipping body."
else
    echo "Applying example-noop migration..."
    # (no actual work)
    touch "$MARK_DIR/example-noop.done"
fi

# Verify
[ -f "$MARK_DIR/example-noop.done" ] || { echo "verify failed"; exit 1; }

echo "MIGRATION_OK"
