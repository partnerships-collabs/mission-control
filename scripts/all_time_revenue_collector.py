#!/usr/bin/env python3
"""Collect the same five revenue sources for Apple's lifetime revenue view.

Runs after the existing YTD collector under the same noon scheduler and lock.
API history is re-read each day, so historical corrections flow into the total.
The history begins in 2020, before the company's first 2021 Close wins; empty
pre-account periods are valid. Close has no lower date bound.
MSN's manual history must explicitly cover every prior year; missing history
fails the attempt instead of silently using the YTD number as a lifetime total.
"""
from __future__ import annotations

import json
import re
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

import revenue_collector as revenue

HISTORY_START_YEAR = 2020
MSN_HISTORY_RANGE = 'Sheet1!A11:B40'


def calendar_months(start_year: int, now: datetime):
    for year in range(start_year, now.year + 1):
        for month in range(1, 13):
            start = date(year, month, 1)
            if start > now.date():
                return
            next_month = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
            end = min(next_month - revenue.timedelta(days=1), now.date())
            yield start, datetime.combine(end, datetime.min.time(), tzinfo=revenue.CHICAGO)


def msn_history_total(rows: list, ytd: float, year: int) -> float:
    """Accept annual rows, or a verified 'Through YYYY' balance plus later years."""
    years = {}
    baseline = None
    for row in rows:
        if not row or row[0] in (None, ''):
            continue
        if len(row) < 2 or isinstance(row[0], bool):
            raise revenue.ConnectorError('validation')
        through = re.fullmatch(r'Through (\d{4})', str(row[0]).strip(), re.IGNORECASE)
        if through:
            baseline_year = int(through[1])
            if baseline is not None or not HISTORY_START_YEAR <= baseline_year < year:
                raise revenue.ConnectorError('validation')
            baseline = (baseline_year, revenue._valid_amount(row[1]))
            continue
        try:
            raw_year = float(row[0])
            history_year = int(raw_year)
        except (TypeError, ValueError, OverflowError) as error:
            raise revenue.ConnectorError('validation') from error
        if raw_year != history_year or history_year in years or history_year >= year or history_year < HISTORY_START_YEAR:
            raise revenue.ConnectorError('validation')
        years[history_year] = revenue._valid_amount(row[1])
    start_year = baseline[0] + 1 if baseline else HISTORY_START_YEAR
    if any(history_year < start_year for history_year in years):
        raise revenue.ConnectorError('validation')
    if set(years) != set(range(start_year, year)):
        raise revenue.ConnectorError('empty_data')
    return round((baseline[1] if baseline else 0) + sum(years.values()) + revenue._valid_amount(ytd), 2)


def fetch_msn_all_time(service_account_info: dict, now: datetime) -> float:
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account
    credentials = service_account.Credentials.from_service_account_info(service_account_info, scopes=[revenue.SHEETS_READONLY_SCOPE])
    credentials.refresh(Request())
    response = revenue.requests.get(
        f'https://sheets.googleapis.com/v4/spreadsheets/{revenue.COUNTER_SHEET_ID}/values:batchGet',
        headers={'Authorization': f'Bearer {credentials.token}'},
        params={'ranges': [revenue.COUNTER_SHEET_RANGE, MSN_HISTORY_RANGE], 'valueRenderOption': 'UNFORMATTED_VALUE'},
        timeout=30,
    )
    response.raise_for_status()
    ranges = response.json().get('valueRanges', [])
    if len(ranges) != 2:
        raise revenue.ConnectorError('malformed_response')
    ytd_rows = ranges[0].get('values', [])
    if not ytd_rows or not ytd_rows[0]:
        raise revenue.ConnectorError('empty_data')
    return msn_history_total(ranges[1].get('values', []), ytd_rows[0][0], now.year)


def fetch_impact_all_time(secrets, now: datetime) -> float:
    total = 0.0
    for year in range(HISTORY_START_YEAR, now.year + 1):
        end = now if year == now.year else datetime(year, 12, 31, tzinfo=revenue.CHICAGO)
        total += revenue.fetch_impact_ytd(secrets.impact_sid, secrets.impact_reporting_password, end, require_rows=year == now.year)
    return round(total, 2)


def fetch_ads_all_time(secrets, now: datetime) -> float:
    # Monthly windows avoid large historical report timeouts. Each calendar
    # date appears exactly once, including leap days and the current date.
    def month_total(bounds):
        start, end = bounds
        return revenue.fetch_adsbymoney_ytd(secrets.adsbymoney_api_key, end, start_date=start, require_rows=False)
    with ThreadPoolExecutor(max_workers=3) as pool:
        total = sum(pool.map(month_total, calendar_months(HISTORY_START_YEAR, now)))
    if total <= 0:
        raise revenue.ConnectorError('empty_data')
    return round(total, 2)


def fetch_monthly_history(secrets, now, source):
    def month_total(bounds):
        start, end = bounds
        if source == 'impact':
            amount = revenue.fetch_impact_ytd(secrets.impact_sid, secrets.impact_reporting_password, end, start_date=start, require_rows=False)
        elif source == 'redventures':
            amount = revenue.fetch_redventures_ytd(secrets.redventures_client_id, secrets.redventures_client_secret, revenue.REDVENTURES_PROPERTY_ID, end, start_date=start, require_rows=False)
        else:
            amount = revenue.fetch_adsbymoney_ytd(secrets.adsbymoney_api_key, end, start_date=start, require_rows=False)
        return start.strftime('%Y-%m'), round(amount, 2)
    with ThreadPoolExecutor(max_workers=3) as pool:
        values = dict(pool.map(month_total, calendar_months(HISTORY_START_YEAR, now)))
    if sum(values.values()) <= 0:
        raise revenue.ConnectorError('empty_data')
    return values


def monthly_payload(series, health, monday_context, now):
    # Only reconciled Monday rows contribute; duplicates and review rows are excluded.
    if 'monday_affiliates' in health:
        if not monday_context or 'rows' not in monday_context:
            return None
        values = {}
        for row in monday_context['rows']:
            if row['disposition'] != 'included':
                continue
            key = date.fromisoformat(row['paymentDate']).strftime('%Y-%m')
            values[key] = values.get(key, 0) + row['grossCents'] / 100
        series['monday_affiliates'] = values
    keys = set(key for values in series.values() for key in values)
    # Keep zero months, including gaps and the current month to date.
    first_year = min([HISTORY_START_YEAR] + [int(key[:4]) for key in keys])
    keys.update(start.strftime('%Y-%m') for start, _ in calendar_months(first_year, now))
    rows = [{'month': key, 'sources': {source: round(values.get(key, 0), 2) for source, values in series.items()}}
            for key in sorted(keys)]
    return {'months': rows, 'undatedSources': {'msn': health['msn'].amount_usd}}


def main(dry_run: bool = False, monday_context: dict | None = None, now: datetime | None = None, started_at: str | None = None) -> int:
    started = started_at or revenue.utc_iso()
    now = now or datetime.now(revenue.CHICAGO)
    secrets = revenue.load_runtime_secrets()
    series = {'close': {}}
    def platform(source):
        series[source] = fetch_monthly_history(secrets, now, source)
        return round(sum(series[source].values()), 2)
    fetches = {
        'close': lambda: revenue.fetch_close_ytd(None, now, secrets.close_api_key, monthly_totals=series['close']),
        'impact': lambda: platform('impact'),
        'redventures': lambda: platform('redventures'),
        'adsbymoney': lambda: platform('adsbymoney'),
        'msn': lambda: fetch_msn_all_time(secrets.msn_google_service_account, now),
    }
    def collect(item):
        source, fetch = item
        return source, revenue.collect_source(source, fetch, secrets.source_errors.get(source))
    with ThreadPoolExecutor(max_workers=5) as pool:
        health = dict(pool.map(collect, fetches.items()))
    if monday_context is not None:
        health['monday_affiliates'] = monday_context['health']
    payload = {
        'collectorRunId': str(uuid.uuid4()), 'snapshotDate': now.date().isoformat(),
        'collectorStartedAt': started, 'collectorCompletedAt': revenue.utc_iso(),
        'sourceHealth': {key: value.to_payload() for key, value in health.items()},
    }
    if monday_context and monday_context.get('auditId'):
        payload['mondayAuditId'] = monday_context['auditId']
    successful = all(value.status == 'success' for value in health.values())
    if successful:
        monthly = monthly_payload(series, health, monday_context, now)
        if monthly is not None:
            payload['monthly'] = monthly
    if dry_run:
        print(json.dumps({**payload, 'dryRun': True}, indent=2))
        return 0 if successful else 1
    if not secrets.activity_secret:
        revenue.log.error('All-time revenue ingestion credential unavailable')
        return 1
    try:
        response = revenue.requests.post(
            f'{revenue.SITE_URL}/revenue/all-time/collection-run',
            headers={'x-activity-secret': secrets.activity_secret}, json=payload, timeout=30,
        )
        response.raise_for_status()
        result = response.json()
        if result.get('published') is not successful:
            raise revenue.ConnectorError('validation')
        print(json.dumps(result, sort_keys=True))
    except Exception as error:
        revenue.log.error('All-time revenue ingestion failed: %s', revenue.controlled_error_message(error))
        return 1
    return 0 if successful else 1


if __name__ == '__main__':
    raise SystemExit(main('--dry-run' in sys.argv))
