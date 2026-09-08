#!/bin/bash
# Read-only post-deploy check. It keeps the activity secret in process memory,
# verifies the authenticated health record, and checks the public Smiirl value.

set -euo pipefail

SERVICE_HOME="${HOME:?HOME must be set}"
VENV_PYTHON="${REVENUE_VENV_PYTHON:-$SERVICE_HOME/Services/venvs/mission-control-revenue/bin/python}"
SECRET_LOADER="${REVENUE_SECRET_LOADER:-$SERVICE_HOME/.openclaw/workspace/scripts/secret_loader.py}"
SITE_URL="${CONVEX_SITE_URL:-https://healthy-bison-550.convex.site}"
SECRET_LOADER_ROOT="$(cd "$(dirname "$SECRET_LOADER")/.." && pwd)"

PYTHONPATH="$SECRET_LOADER_ROOT${PYTHONPATH:+:$PYTHONPATH}" \
  "$VENV_PYTHON" - "$SITE_URL" <<'PY'
import json
import math
import sys

import requests

from scripts.secret_loader import read_secret


site_url = sys.argv[1].rstrip("/")
activity_secret = read_secret("mission_control_activity")
health_response = requests.get(
    f"{site_url}/revenue/health",
    headers={"x-activity-secret": activity_secret},
    timeout=20,
)
health_response.raise_for_status()
health = health_response.json()

smiirl_response = requests.get(f"{site_url}/revenue/smiirl", timeout=20)
smiirl_response.raise_for_status()
smiirl = smiirl_response.json()

display = health.get("displaySnapshot") or {}
total = display.get("totalYtdUsd")
displayed_number = smiirl.get("number")
expected_number = math.floor(float(total) + 0.5) if isinstance(total, (int, float)) else None
last_attempt = health.get("lastAttempt") or {}

summary = {
    "healthy": health.get("healthy"),
    "displayStatus": health.get("displayStatus"),
    "snapshotDate": display.get("snapshotDate"),
    "totalYtdUsd": total,
    "smiirlNumber": displayed_number,
    "lastAttemptPublished": last_attempt.get("published"),
    "lastAttemptVerificationStatus": last_attempt.get("verificationStatus"),
    "sourceFreshness": {
        name: details.get("freshness")
        for name, details in (last_attempt.get("sourceHealth") or {}).items()
        if isinstance(details, dict)
    },
}
print(json.dumps(summary, indent=2, sort_keys=True))

if health.get("healthy") is not True:
    raise SystemExit("revenue health is not healthy")
if expected_number is None or displayed_number != expected_number:
    raise SystemExit("Smiirl number does not match the verified snapshot")
PY
