"""One capture and publication for YTD, lifetime and monthly revenue.

MSN is Paid In Full gross revenue on CA Affiliates, by payment date.
No Google sheet, Microsoft session, or separate YTD collection is used.
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import revenue_collector as revenue
import all_time_revenue_collector as history
import monday_affiliates as monday

SOURCES = (*revenue.SOURCE_NAMES, 'monday_affiliates')
PLATFORMS = ('impact', 'redventures', 'adsbymoney')


def close_days(opportunities, now):
    """Same Close capture supplies totals, 30-day metrics and dedup evidence."""
    days, ids = {}, set()
    for row in opportunities:
        won = str(row.get('date_won', ''))[:10]
        amount = row.get('value')
        if (not row.get('id') or row['id'] in ids or not monday.valid_date(won)
                or won > now.date().isoformat() or row.get('value_currency') != 'USD'
                or row.get('value_period') != 'one_time' or isinstance(amount, bool)
                or not isinstance(amount, (float, int)) or amount < 0
                or not float(amount).is_integer()):
            raise revenue.ConnectorError('validation')
        ids.add(row['id'])
        days[won] = days.get(won, 0) + int(amount)
        if days[won] > 9_007_199_254_740_991:
            raise revenue.ConnectorError('validation')
    if not ids:
        raise revenue.ConnectorError('empty_data')
    return [{'date': day, 'amountCents': days[day]} for day in sorted(days)]


def collect_payload(*, dry_run=False, now=None, mode='publish'):
    started = revenue.utc_iso()
    now = now or datetime.now(revenue.CHICAGO)
    secrets = revenue.load_runtime_secrets(include_msn=False)
    health, series, days = {}, {}, []
    audit = None
    state_root = Path(os.environ.get('REVENUE_STATE_DIR', str(Path.home() / 'Library/Application Support/CreatorsAgency/revenue-collector')))

    def platform(source):
        def fetch():
            series[source] = history.fetch_monthly_history(secrets, now, source)
            return sum(monday.cents(Decimal(str(v))) for v in series[source].values()) / 100
        return revenue.collect_source(source, fetch, secrets.source_errors.get(source))

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {source: pool.submit(platform, source) for source in PLATFORMS}
        opportunities = []
        def fetch_close():
            nonlocal opportunities, days
            opportunities = monday.fetch_close_evidence(secrets.close_api_key, now)
            days = close_days(opportunities, now)
            return sum(row['amountCents'] for row in days) / 100
        health['close'] = revenue.collect_source('close', fetch_close, secrets.source_errors.get('close'))
        try:
            if health['close'].status != 'success' or secrets.source_errors.get('impact'):
                raise revenue.ConnectorError('validation')
            audit = monday.collect(now, state_root / 'monday-item-ids.json', secrets=secrets,
                                   opportunities=opportunities, msn_from_monday=True, read_only=dry_run)
            if any(row.get('source') == 'msn' and row['disposition'] == 'review' for row in audit['rows']):
                raise revenue.ConnectorError('validation')
            for source in ('msn', 'monday_affiliates'):
                rows = [row for row in audit['rows'] if row['disposition'] == 'included'
                        and (row.get('source') == 'msn') == (source == 'msn')]
                if source == 'msn' and not rows:
                    raise revenue.ConnectorError('empty_data')
                amount = sum(row['grossCents'] for row in rows) / 100
                if amount < 0:
                    raise revenue.ConnectorError('validation')
                health[source] = revenue.SourceHealth(amount, 'success', audit['fetchedAt'], False)
        except Exception as error:
            audit = None
            for source in ('msn', 'monday_affiliates'):
                health[source] = revenue.SourceHealth(None, 'failed', revenue.utc_iso(), False,
                                                       revenue.controlled_error_message(error))
        health.update({source: future.result() for source, future in futures.items()})

    successful = all(health[source].status == 'success' for source in SOURCES)
    payload = {
        'collectorRunId': str(uuid.uuid4()), 'snapshotDate': now.date().isoformat(),
        'collectorStartedAt': started, 'collectorCompletedAt': revenue.utc_iso(),
        'goalUsd': revenue.GOAL_USD, 'mode': mode,
        'sourceHealth': {source: health[source].to_payload() for source in SOURCES},
        'closeDays': days if successful else [],
        'platformMonths': [{'month': month, **{source + 'Cents': monday.cents(Decimal(str(series[source][month])))
                           for source in PLATFORMS}}
                           for month in sorted(series['impact'])] if successful else [],
    }
    if audit is not None:
        payload['mondayAuditId'] = audit['auditId']
    return payload, audit, secrets, successful


def main(dry_run=False, mode='publish'):
    payload, audit, secrets, successful = collect_payload(dry_run=dry_run, mode=mode)
    if dry_run:
        # Keep detailed canonical facts private; diagnostics print only sums.
        print(json.dumps({**{k: v for k, v in payload.items() if k not in ('closeDays', 'platformMonths')},
                          'dryRun': True, 'closeDays': len(payload['closeDays']),
                          'platformMonths': len(payload['platformMonths']),
                          'mondaySummary': audit['summary'] if audit else None}, indent=2))
        return 0 if successful else 1
    if not secrets.activity_secret:
        revenue.log.error('Unified ingestion credential unavailable')
        return 1
    try:
        if audit is not None:
            try:
                monday.post_audit(audit, secrets.activity_secret)
            except Exception as error:
                # Audit persistence is required evidence. Report the failure so
                # neither consumer appears freshly verified after a failed upload.
                successful = False
                for source in ('msn', 'monday_affiliates'):
                    payload['sourceHealth'][source] = revenue.SourceHealth(None, 'failed', revenue.utc_iso(), False,
                        revenue.controlled_error_message(error)).to_payload()
                payload.pop('mondayAuditId', None)
                payload.update(closeDays=[], platformMonths=[], collectorCompletedAt=revenue.utc_iso())
        response = revenue.requests.post(revenue.SITE_URL + '/revenue/unified/collection-run',
                    headers={'x-activity-secret': secrets.activity_secret}, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        print(json.dumps(result, sort_keys=True))
        return 0 if successful and result.get('verified') and (mode == 'shadow' or result.get('published')) else 1
    except Exception as error:
        revenue.log.error('Unified ingestion failed: %s', revenue.controlled_error_message(error))
        return 1


if __name__ == '__main__':
    raise SystemExit(main('--dry-run' in sys.argv, 'shadow' if '--shadow' in sys.argv else 'publish'))
