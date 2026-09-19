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
all_time_response = requests.get(
    f"{site_url}/revenue/all-time", headers={"x-activity-secret": activity_secret}, timeout=20,
)
all_time_response.raise_for_status()
all_time = all_time_response.json()
snapshot = all_time.get("snapshot") or {}

display = health.get("displaySnapshot") or {}
total = display.get("totalYtdUsd")
displayed_number = smiirl.get("number")
expected_number = math.floor(float(total) + 0.5) if isinstance(total, (int, float)) else None
last_attempt = health.get("lastAttempt") or {}

summary = {
    "datasetId": health.get("datasetId"),
    "allTimeDatasetId": snapshot.get("datasetId"),
    "allTimeHealthy": all_time.get("healthy"),
    "totalAllTimeUsd": snapshot.get("totalAllTimeUsd"),
    "healthy": health.get("healthy"),
    "displayStatus": health.get("displayStatus"),
    "snapshotDate": display.get("snapshotDate"),
    "totalYtdUsd": total,
    "smiirlNumber": displayed_number,
    "lastAttemptPublished": last_attempt.get("published"),
    "lastAttemptVerificationStatus": last_attempt.get("verificationStatus"),
    "refresh": health.get("refresh"),
    "queue": health.get("queue"),
    "sourceFreshness": {
        name: details.get("freshness")
        for name, details in (snapshot.get("sourceHealth") or {}).items()
        if isinstance(details, dict)
    },
}
print(json.dumps(summary, indent=2, sort_keys=True))

if health.get("healthy") is not True:
    raise SystemExit("revenue health is not healthy")
if expected_number is None or displayed_number != expected_number:
    raise SystemExit("Smiirl number does not match the verified snapshot")
if not health.get("datasetId") or health["datasetId"] != snapshot.get("datasetId") or health["datasetId"] != smiirl_response.headers.get("X-Revenue-Dataset"):
    raise SystemExit("Consumers do not share the same verified dataset; retry if publication occurred during this check")
if all_time.get("healthy") is not health.get("healthy") or snapshot.get("totalYtdUsd") != total:
    raise SystemExit("Unified revenue health or YTD totals disagree")
monthly_ytd_cents = sum(round(amount * 100) for row in snapshot["monthly"]["months"]
                        if row["month"].startswith(snapshot["snapshotDate"][:4]) for amount in row["sources"].values())
if monthly_ytd_cents != round(total * 100):
    raise SystemExit("CA HQ monthly YTD does not equal Smiirl YTD")
PY
