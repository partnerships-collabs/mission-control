#!/usr/bin/env python3
"""Collect and report a fully verified Creators Agency revenue snapshot.

This is the canonical collector source. Production installation is coordinated
separately; do not point launchd at this file until the matching Convex schema
and HTTP route are deployed.

Every attempt reports per-source health to ``/revenue/collection-run``. Convex only
publishes a Smiirl snapshot when all five sources succeeded during this run.
There is deliberately no last-known-good substitution in this process.
"""

from __future__ import annotations

import base64
import json
import logging
import math
import os
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import quote
from zoneinfo import ZoneInfo

import requests

try:
    from scripts.secret_loader import read_secret
except ModuleNotFoundError:  # Runtime installation places this beside secret_loader.py.
    from secret_loader import read_secret


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


CLOSE_BASE_URL = "https://api.close.com/api/v1"
COUNTER_SHEET_ID = "11m_IbqoiIcWhxLTjNONbrqCe-2NMA8FMxFuOd3LwnoU"
COUNTER_SHEET_RANGE = "Sheet1!B9"
REDVENTURES_PROPERTY_ID = "50812"
SITE_URL = "https://healthy-bison-550.convex.site"
SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
CHICAGO = ZoneInfo("America/Chicago")
GOAL_USD = 25_000_000
SOURCE_NAMES = ("close", "impact", "redventures", "adsbymoney", "msn")
MAX_SERVICE_ACCOUNT_BYTES = 64 * 1024

SAFE_ERROR_MESSAGES = {
    "credential_unavailable": "credential unavailable",
    "timeout": "request timed out",
    "connection": "connection failed",
    "http_status": "HTTP request failed",
    "malformed_response": "malformed response",
    "validation": "validation failed",
    "empty_data": "empty data",
    "missing_dependency": "missing dependency",
    "unexpected": "unexpected failure",
}


class ConnectorError(RuntimeError):
    """A connector failure whose public representation is fully controlled."""

    def __init__(
        self,
        category: str,
        *,
        close_validation_counts: tuple[int, int, int] | None = None,
    ) -> None:
        if category not in SAFE_ERROR_MESSAGES:
            category = "unexpected"
        self.category = category
        self.close_validation_counts = close_validation_counts
        super().__init__(self.controlled_message())

    def controlled_message(self) -> str:
        message = SAFE_ERROR_MESSAGES[self.category]
        if self.category == "validation" and self.close_validation_counts is not None:
            records, invalid_currency, invalid_period = self.close_validation_counts
            message += (
                f" (records={max(0, int(records))}, "
                f"invalidCurrency={max(0, int(invalid_currency))}, "
                f"invalidValuePeriod={max(0, int(invalid_period))})"
            )
        return message


@dataclass(frozen=True)
class RuntimeSecrets:
    activity_secret: str | None
    close_api_key: str | None
    impact_sid: str | None
    impact_reporting_password: str | None
    redventures_client_id: str | None
    redventures_client_secret: str | None
    adsbymoney_api_key: str | None
    msn_google_service_account: dict | None
    source_errors: dict[str, ConnectorError]
    activity_error: ConnectorError | None = None


@dataclass(frozen=True)
class SourceHealth:
    amount_usd: float | None
    status: str
    fetched_at: str
    reused: bool
    error: str | None = None

    def to_payload(self) -> dict:
        payload: dict[str, object] = {
            "status": self.status,
            "fetchedAt": self.fetched_at,
            "reused": self.reused,
        }
        if self.amount_usd is not None:
            payload["amountUsd"] = self.amount_usd
        if self.error:
            payload["error"] = self.error
        return payload


def utc_iso(now: datetime | None = None) -> str:
    value = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _requests_exception_type(name: str) -> type[BaseException] | None:
    exceptions = getattr(requests, "exceptions", None)
    candidate = getattr(exceptions, name, None) if exceptions is not None else None
    return candidate if isinstance(candidate, type) else None


def classify_error(error: BaseException) -> ConnectorError:
    """Map any exception to one of a finite set of disclosure-safe failures."""
    if isinstance(error, ConnectorError):
        return error
    if isinstance(error, (ModuleNotFoundError, ImportError)):
        return ConnectorError("missing_dependency")

    timeout_type = _requests_exception_type("Timeout")
    if isinstance(error, TimeoutError) or (
        timeout_type is not None and isinstance(error, timeout_type)
    ):
        return ConnectorError("timeout")

    connection_type = _requests_exception_type("ConnectionError")
    if isinstance(error, ConnectionError) or (
        connection_type is not None and isinstance(error, connection_type)
    ):
        return ConnectorError("connection")

    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int) and 100 <= status_code <= 599:
        failure = ConnectorError("http_status")
        failure.http_status = status_code
        return failure

    if isinstance(error, (json.JSONDecodeError, ET.ParseError, UnicodeError, KeyError)):
        return ConnectorError("malformed_response")
    return ConnectorError("unexpected")


def controlled_error_message(error: BaseException) -> str:
    failure = classify_error(error)
    message = failure.controlled_message()
    status_code = getattr(failure, "http_status", None)
    if failure.category == "http_status" and isinstance(status_code, int):
        return f"{message} (status={status_code})"
    return message


def _valid_amount(value: object) -> float:
    if isinstance(value, bool):
        raise ConnectorError("validation")
    try:
        amount = float(value)
    except (TypeError, ValueError) as error:
        raise ConnectorError("validation") from error
    if not math.isfinite(amount) or amount < 0:
        raise ConnectorError("validation")
    return amount


def _read_secret_or_error(
    key: str,
    label: str,
    errors: dict[str, ConnectorError],
) -> str | None:
    try:
        return read_secret(key)
    except Exception:
        errors[label] = ConnectorError("credential_unavailable")
        return None


def load_msn_service_account() -> dict:
    """Load only the explicitly configured, MSN-dedicated Google identity.

    There is no default credential path. The broad Gmail/analytics identity is
    intentionally not eligible. Deployment may inject a base64 JSON document
    in memory or point to one explicit credential file.
    """
    encoded = os.environ.get("MSN_GOOGLE_SERVICE_ACCOUNT_B64", "").strip()
    configured_path = os.environ.get("MSN_GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
    if encoded and configured_path:
        raise ConnectorError("validation")
    if not encoded and not configured_path:
        raise ConnectorError("credential_unavailable")

    if encoded:
        try:
            raw = base64.b64decode(encoded, validate=True)
        except Exception as error:
            raise ConnectorError("malformed_response") from error
    else:
        credential_path = Path(configured_path)
        if not credential_path.is_absolute():
            raise ConnectorError("validation")
        try:
            raw = credential_path.read_bytes()
        except OSError as error:
            raise ConnectorError("credential_unavailable") from error

    if not raw or len(raw) > MAX_SERVICE_ACCOUNT_BYTES:
        raise ConnectorError("malformed_response")
    try:
        info = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ConnectorError("malformed_response") from error
    if not isinstance(info, dict) or info.get("type") != "service_account":
        raise ConnectorError("validation")
    for field in ("client_email", "private_key", "token_uri"):
        if not isinstance(info.get(field), str) or not info[field]:
            raise ConnectorError("validation")
    return info


def load_runtime_secrets() -> RuntimeSecrets:
    source_errors: dict[str, ConnectorError] = {}
    activity_errors: dict[str, ConnectorError] = {}
    activity_secret = _read_secret_or_error(
        "mission_control_activity", "activity", activity_errors
    )
    close_api_key = _read_secret_or_error("close", "close", source_errors)
    impact_sid = _read_secret_or_error("impact_sid", "impact", source_errors)
    impact_password = _read_secret_or_error(
        "impact_reporting_password", "impact", source_errors
    )
    rv_client_id = _read_secret_or_error(
        "redventures_client_id", "redventures", source_errors
    )
    rv_client_secret = _read_secret_or_error(
        "redventures_client_secret", "redventures", source_errors
    )
    adsbymoney_api_key = _read_secret_or_error(
        "adsbymoney", "adsbymoney", source_errors
    )
    try:
        msn_service_account = load_msn_service_account()
    except Exception as error:
        source_errors["msn"] = classify_error(error)
        msn_service_account = None

    return RuntimeSecrets(
        activity_secret=activity_secret,
        close_api_key=close_api_key,
        impact_sid=impact_sid,
        impact_reporting_password=impact_password,
        redventures_client_id=rv_client_id,
        redventures_client_secret=rv_client_secret,
        adsbymoney_api_key=adsbymoney_api_key,
        msn_google_service_account=msn_service_account,
        source_errors=source_errors,
        activity_error=activity_errors.get("activity"),
    )


def fetch_close_ytd(
    start: datetime | None,
    end: datetime,
    close_api_key: str,
    *,
    require_rows: bool = True,
) -> float:
    total = 0.0
    skip = 0
    page_size = 100
    counted = 0
    seen_ids: set[str] = set()
    invalid_currency_count = 0
    invalid_period_count = 0
    params: dict[str, object] = {
        "_limit": page_size,
        "_fields": "id,value,value_currency,value_period",
        "status_type": "won",
        "date_won__lte": end.strftime("%Y-%m-%d"),
    }
    if start is not None:
        params["date_won__gte"] = start.strftime("%Y-%m-%d")

    while True:
        params["_skip"] = skip
        response = requests.get(
            f"{CLOSE_BASE_URL}/opportunity/",
            auth=(close_api_key, ""),
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        deals = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(deals, list):
            raise ConnectorError("malformed_response")
        for deal in deals:
            if not isinstance(deal, dict):
                raise ConnectorError("malformed_response")
            opportunity_id = deal.get("id")
            if not isinstance(opportunity_id, str) or not opportunity_id:
                raise ConnectorError("malformed_response")
            if opportunity_id in seen_ids:
                raise ConnectorError("validation")
            seen_ids.add(opportunity_id)
            if deal.get("value_currency") != "USD":
                invalid_currency_count += 1
            if deal.get("value_period") != "one_time":
                invalid_period_count += 1
            total += _valid_amount(deal.get("value") or 0) / 100.0
            counted += 1

        has_more = payload.get("has_more", False)
        if not isinstance(has_more, bool):
            raise ConnectorError("malformed_response")
        if not has_more:
            break
        if not deals:
            raise ConnectorError("malformed_response")
        skip += page_size

    if counted == 0 and require_rows:
        raise ConnectorError("empty_data")
    if invalid_currency_count or invalid_period_count:
        raise ConnectorError(
            "validation",
            close_validation_counts=(
                counted,
                invalid_currency_count,
                invalid_period_count,
            ),
        )
    log.info(f"Close CRM (won): {counted} opportunities -> ${total:,.2f}")
    return total


def fetch_impact_ytd(account_sid: str, auth_token: str, now: datetime, *, require_rows: bool = True) -> float:
    start_date = f"{now.year}-01-01"
    end_date = now.strftime("%Y-%m-%d")
    url = (
        f"https://api.impact.com/Mediapartners/{account_sid}"
        "/Reports/partner_performance_by_day"
    )
    response = requests.get(
        url,
        auth=(account_sid, auth_token),
        params={"START_DATE": start_date, "END_DATE": end_date, "PageSize": 1000},
        timeout=30,
    )
    response.raise_for_status()
    root = ET.fromstring(response.text)
    if (root.findtext("Status") or "OK") == "ERROR":
        raise ConnectorError("http_status")
    records = root.find("Records")
    if records is None:
        raise ConnectorError("malformed_response")

    total = 0.0
    day_count = 0
    for record in records:
        raw_amount = record.findtext("Total_Cost")
        if raw_amount in (None, ""):
            raise ConnectorError("malformed_response")
        currency = record.findtext("Currency")
        if currency not in (None, "", "USD"):
            raise ConnectorError("validation")
        total += _valid_amount(raw_amount)
        day_count += 1
    if day_count > 366:
        raise ConnectorError("validation")
    if day_count == 0 and require_rows:
        raise ConnectorError("empty_data")
    log.info(f"Impact: {day_count} days -> ${total:,.2f}")
    return total


def _redventures_windows(today: date, start_date: date | None = None) -> list[tuple[str, str]]:
    cursor = start_date or date(today.year, 1, 1)
    windows: list[tuple[str, str]] = []
    while cursor <= today:
        window_end = min(cursor + timedelta(days=30), today)
        windows.append(
            (
                f"{cursor.isoformat()} 00:00:00",
                f"{window_end.isoformat()} 23:59:59",
            )
        )
        cursor = window_end + timedelta(days=1)
    return windows


def fetch_redventures_ytd(
    client_id: str,
    client_secret: str,
    property_id: str,
    now: datetime,
    *,
    start_date: date | None = None,
    require_rows: bool = True,
) -> float:
    token_response = requests.post(
        "https://rvmedianetwork-prod.us.auth0.com/oauth/token",
        headers={"Content-Type": "application/json"},
        json={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "audience": "https://reporting-api.rvmedianetwork.com",
        },
        timeout=30,
    )
    token_response.raise_for_status()
    token_payload = token_response.json()
    token = token_payload.get("access_token") if isinstance(token_payload, dict) else None
    if not isinstance(token, str) or not token:
        raise ConnectorError("malformed_response")

    total = 0.0
    row_count = 0
    for start, end in _redventures_windows(now.date(), start_date):
        response = requests.get(
            "https://reporting-api.rvmedianetwork.com/overview",
            headers={"Authorization": f"Bearer {token}"},
            params={"propertyId": property_id, "start": start, "end": end},
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        reporting = payload.get("overviewReporting") if isinstance(payload, dict) else None
        rows = reporting.get("page") if isinstance(reporting, dict) else None
        if not isinstance(rows, list):
            raise ConnectorError("malformed_response")
        pagination = reporting.get("pagination", {})
        if isinstance(pagination, dict) and (pagination.get("totalPages", 1) > 1
            or pagination.get("totalEntries", len(rows)) > len(rows)):
            raise ConnectorError("validation")
        for row in rows:
            if not isinstance(row, dict) or "commission" not in row:
                raise ConnectorError("malformed_response")
            total += _valid_amount(row.get("commission") or 0)
            row_count += 1
    if row_count == 0 and require_rows:
        raise ConnectorError("empty_data")
    log.info(f"RedVentures: {row_count} rows -> ${total:,.2f}")
    return total


def ads_campaign_earnings(campaign: object, allow_empty_history: bool = False) -> float:
    if not isinstance(campaign, dict):
        raise ConnectorError("malformed_response")
    if campaign.get("earnings") is not None:
        return _valid_amount(campaign["earnings"])
    # The API returns its older zero-activity shape for pre-account periods.
    # Only accept it when every activity/revenue field explicitly equals zero;
    # never infer that a missing earnings field means no historical earnings.
    if allow_empty_history and all(
        campaign.get(field) is not None and _valid_amount(campaign[field]) == 0
        for field in ("revenue", "leads", "clicks")
    ):
        return 0.0
    raise ConnectorError("malformed_response")


def fetch_adsbymoney_ytd(api_token: str, now: datetime, *, start_date: date | None = None, require_rows: bool = True) -> float:
    year_start = start_date.isoformat() if start_date else f"{now.year}-01-01"
    today = now.strftime("%Y-%m-%d")
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = requests.post(
                "https://api.adsbymoney.com/api/v1/publisher_dashboard/campaigns",
                json={"api_token": api_token, "start_at": year_start, "end_at": today},
                headers={"Content-Type": "application/json"},
                timeout=75,
            )
            response.raise_for_status()
            payload = response.json()
            campaigns = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(campaigns, list):
                raise ConnectorError("malformed_response")
            if not campaigns and require_rows:
                raise ConnectorError("empty_data")
            total = 0.0
            for campaign in campaigns:
                total += ads_campaign_earnings(campaign, allow_empty_history=not require_rows)
            log.info(f"AdsByMoney: {len(campaigns)} campaigns -> ${total:,.2f}")
            return total
        except Exception as error:
            last_error = error
            if attempt < 2:
                wait_seconds = 10 * (2**attempt)
                log.warning(
                    "AdsByMoney attempt %d failed: %s; retrying in %ds",
                    attempt + 1,
                    controlled_error_message(error),
                    wait_seconds,
                )
                time.sleep(wait_seconds)
    assert last_error is not None
    raise last_error


def fetch_msn_ytd(service_account_info: dict) -> float:
    """Read only Counter ``Sheet1!B9`` using the dedicated MSN identity."""
    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        from google.oauth2 import service_account
    except ImportError as error:
        raise ConnectorError("missing_dependency") from error

    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=[SHEETS_READONLY_SCOPE],
    )
    credentials.refresh(GoogleAuthRequest())
    token = credentials.token
    if not isinstance(token, str) or not token:
        raise ConnectorError("credential_unavailable")

    encoded_range = quote(COUNTER_SHEET_RANGE, safe="")
    response = requests.get(
        f"https://sheets.googleapis.com/v4/spreadsheets/{COUNTER_SHEET_ID}"
        f"/values/{encoded_range}",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "majorDimension": "ROWS",
            "valueRenderOption": "UNFORMATTED_VALUE",
            "dateTimeRenderOption": "SERIAL_NUMBER",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    values = payload.get("values") if isinstance(payload, dict) else None
    if (
        not isinstance(values, list)
        or not values
        or not isinstance(values[0], list)
        or not values[0]
    ):
        raise ConnectorError("empty_data")
    amount = _valid_amount(values[0][0])
    log.info(f"MSN (Counter Sheet1!B9): ${amount:,.2f}")
    return amount


def collect_source(
    source: str,
    fetch: Callable[[], float],
    credential_error: ConnectorError | None = None,
) -> SourceHealth:
    if credential_error:
        safe_error = controlled_error_message(credential_error)
        log.error("%s fetch failed: %s", source, safe_error)
        return SourceHealth(None, "failed", utc_iso(), False, safe_error)
    try:
        amount = _valid_amount(fetch())
        return SourceHealth(amount, "success", utc_iso(), False)
    except Exception as error:
        safe_error = controlled_error_message(error)
        log.error("%s fetch failed: %s", source, safe_error)
        return SourceHealth(None, "failed", utc_iso(), False, safe_error)


def inclusive_last_30_day_start(now: datetime) -> datetime:
    """Return the first of 30 calendar dates when both API bounds are inclusive."""
    return now - timedelta(days=29)


def build_run_payload(
    collector_run_id: str,
    collector_started_at: str,
    collector_completed_at: str,
    snapshot_date: str,
    source_health: dict[str, SourceHealth],
    close_last30_day_usd: float | None,
) -> dict:
    payload: dict[str, object] = {
        "collectorRunId": collector_run_id,
        "collectorStartedAt": collector_started_at,
        "collectorCompletedAt": collector_completed_at,
        "snapshotDate": snapshot_date,
        "goalUsd": GOAL_USD,
        "sourceHealth": {
            source: source_health[source].to_payload() for source in SOURCE_NAMES
        },
    }
    all_fresh = all(
        source_health[source].status == "success"
        and source_health[source].amount_usd is not None
        and not source_health[source].reused
        for source in SOURCE_NAMES
    )
    if not all_fresh:
        return payload
    if close_last30_day_usd is None:
        raise ConnectorError("validation")

    payload["closeLast30DayUsd"] = _valid_amount(close_last30_day_usd)
    return payload


def post_run_report(payload: dict, activity_secret: str) -> dict:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = requests.post(
                f"{SITE_URL}/revenue/collection-run",
                headers={
                    "x-activity-secret": activity_secret,
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict) or not isinstance(
                result.get("published"), bool
            ):
                raise ConnectorError("malformed_response")
            return result
        except Exception as error:
            last_error = error
            if attempt < 2:
                wait_seconds = 2**attempt
                log.warning(
                    "Run report POST attempt %d failed: %s; retrying in %ds",
                    attempt + 1,
                    controlled_error_message(error),
                    wait_seconds,
                )
                time.sleep(wait_seconds)
    assert last_error is not None
    raise last_error


def main(dry_run: bool | None = None) -> int:
    if dry_run is None:
        dry_run = "--dry-run" in sys.argv[1:]
    collector_run_id = str(uuid.uuid4())
    started_at = utc_iso()
    now = datetime.now(CHICAGO)
    log.info("=== Revenue Collector run %s starting ===", collector_run_id)
    secrets = load_runtime_secrets()
    ytd_start = datetime(now.year, 1, 1, tzinfo=CHICAGO)
    last30_start = inclusive_last_30_day_start(now)

    close_last30_holder: dict[str, float] = {}

    def collect_close() -> float:
        if not secrets.close_api_key:
            raise ConnectorError("credential_unavailable")
        ytd = fetch_close_ytd(ytd_start, now, secrets.close_api_key)
        close_last30_holder["amount"] = fetch_close_ytd(
            last30_start,
            now,
            secrets.close_api_key,
            require_rows=False,
        )
        return ytd

    source_health: dict[str, SourceHealth] = {}
    source_health["close"] = collect_source(
        "close", collect_close, secrets.source_errors.get("close")
    )
    source_health["impact"] = collect_source(
        "impact",
        lambda: fetch_impact_ytd(
            secrets.impact_sid or "", secrets.impact_reporting_password or "", now
        ),
        secrets.source_errors.get("impact")
        or (
            ConnectorError("credential_unavailable")
            if not secrets.impact_sid or not secrets.impact_reporting_password
            else None
        ),
    )
    source_health["redventures"] = collect_source(
        "redventures",
        lambda: fetch_redventures_ytd(
            secrets.redventures_client_id or "",
            secrets.redventures_client_secret or "",
            REDVENTURES_PROPERTY_ID,
            now,
        ),
        secrets.source_errors.get("redventures")
        or (
            ConnectorError("credential_unavailable")
            if not secrets.redventures_client_id or not secrets.redventures_client_secret
            else None
        ),
    )
    source_health["adsbymoney"] = collect_source(
        "adsbymoney",
        lambda: fetch_adsbymoney_ytd(secrets.adsbymoney_api_key or "", now),
        secrets.source_errors.get("adsbymoney")
        or (
            ConnectorError("credential_unavailable")
            if not secrets.adsbymoney_api_key
            else None
        ),
    )
    source_health["msn"] = collect_source(
        "msn",
        lambda: fetch_msn_ytd(secrets.msn_google_service_account or {}),
        secrets.source_errors.get("msn")
        or (
            ConnectorError("credential_unavailable")
            if not secrets.msn_google_service_account
            else None
        ),
    )

    completed_at = utc_iso()
    payload = build_run_payload(
        collector_run_id,
        started_at,
        completed_at,
        now.strftime("%Y-%m-%d"),
        source_health,
        close_last30_holder.get("amount"),
    )
    all_sources_succeeded = all(
        source_health[source].status == "success" for source in SOURCE_NAMES
    )

    if dry_run:
        print(json.dumps({**payload, "dryRun": True}, indent=2, sort_keys=True))
        return 0 if all_sources_succeeded else 1

    if not secrets.activity_secret:
        log.error(
            "Run report could not be recorded: %s",
            controlled_error_message(
                secrets.activity_error or ConnectorError("credential_unavailable")
            ),
        )
        return 1
    try:
        result = post_run_report(payload, secrets.activity_secret)
    except Exception as error:
        log.error("Run report POST failed: %s", controlled_error_message(error))
        return 1

    expected_published = all_sources_succeeded
    if result["published"] is not expected_published:
        log.error(
            "Run acknowledgement mismatch: expected published=%s, received %s",
            expected_published,
            result["published"],
        )
        return 1
    log.info(
        "=== Revenue Collector run %s recorded (published=%s) ===",
        collector_run_id,
        result["published"],
    )
    print(json.dumps(result, sort_keys=True))
    return 0 if all_sources_succeeded else 1


if __name__ == "__main__":
    raise SystemExit(main())
