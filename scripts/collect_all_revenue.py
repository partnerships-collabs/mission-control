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
import revenue_checkpoint as checkpoint

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
        days[now.date().isoformat()] = 0
    return [{'date': day, 'amountCents': days[day]} for day in sorted(days)]


def collect_payload(*, dry_run=False, now=None, mode='publish', secrets=None, run_id=None, started=None):
    started = started or revenue.utc_iso()
    now = now or datetime.now(revenue.CHICAGO)
    secrets = secrets or revenue.load_runtime_secrets(include_msn=False)
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
        'collectorRunId': run_id or str(uuid.uuid4()), 'snapshotDate': now.date().isoformat(),
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
        if 'reconciliationInputs' in audit:
            payload['evidenceId'] = audit['auditId']
            audit['closeFacts'] = [{**{k: d[k] for k in ('id', 'date_won', 'value', 'value_currency', 'value_period')},
                'lead_name': d.get('lead_name') or '', 'note': d.get('note') or '',
                'creators': [v for k, values in d.items() if k.startswith('custom.') and isinstance(values, list)
                             for v in values if isinstance(v, str)]} for d in opportunities]
    return payload, audit, secrets, successful


def main(dry_run=False, mode='publish'):
    if dry_run:
        payload, audit, secrets, successful = collect_payload(dry_run=True, mode=mode)
        # Keep detailed canonical facts private; diagnostics print only sums.
        print(json.dumps({**{k: v for k, v in payload.items() if k not in ('closeDays', 'platformMonths')},
                          'dryRun': True, 'closeDays': len(payload['closeDays']),
                          'platformMonths': len(payload['platformMonths']),
                          'mondaySummary': audit['summary'] if audit else None}, indent=2))
        return 0 if successful else 1
    secrets = revenue.load_runtime_secrets(include_msn=False)
    if not secrets.activity_secret:
        revenue.log.error('Unified ingestion credential unavailable')
        return 1
    state = Path(os.environ.get('REVENUE_STATE_DIR', str(Path.home() / 'Library/Application Support/CreatorsAgency/revenue-collector')))
    pending = state / ('pending-shadow-upload.json' if mode == 'shadow' else 'pending-upload.json')
    origin = 'scheduled' if os.environ.get('REVENUE_RUN_ORIGIN') == 'scheduled' else 'manual'
    payload = None
    def status(kind, code=None):
        if mode == 'shadow' or not payload:
            return
        body = {key: payload[key] for key in ('collectorRunId', 'collectorStartedAt')}
        body.update(origin=origin, status=kind)
        if code:
            body['code'] = code
        result = revenue.request_with_retry(revenue.requests.post, revenue.SITE_URL + '/revenue/unified/collection-status',
            headers={'x-activity-secret': secrets.activity_secret}, json=body, timeout=30)
        result.raise_for_status()
    try:
        capture = checkpoint.load(pending)
        if capture:
            payload, audit, successful = capture['payload'], capture['audit'], capture['successful']
            origin = capture['origin']
            revenue.log.info('Resuming immutable upload for run %s', payload['collectorRunId'])
        else:
            payload = {'collectorRunId': str(uuid.uuid4()), 'collectorStartedAt': revenue.utc_iso()}
            status('collecting')
            payload, audit, _, successful = collect_payload(mode=mode, secrets=secrets,
                run_id=payload['collectorRunId'], started=payload['collectorStartedAt'])
            if not successful:
                # Commit failed source health, without trying to validate or
                # publish an incomplete reconciliation capture.
                audit = None
                payload.pop('mondayAuditId', None)
                payload.pop('evidenceId', None)
            checkpoint.save(pending, {'payload': payload, 'audit': audit, 'successful': successful, 'origin': origin})
        if audit is not None:
            monday.post_audit(audit, secrets.activity_secret)
            if payload.get('evidenceId'):
                monday.post_reconciliation_evidence(audit, secrets.activity_secret)
        response = revenue.request_with_retry(revenue.requests.post, revenue.SITE_URL + '/revenue/unified/collection-run',
                    headers={'x-activity-secret': secrets.activity_secret}, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        print(json.dumps(result, sort_keys=True))
        # A terminal server response means these private transport inputs no
        # longer need retrying; authoritative evidence remains stored in Convex.
        pending.unlink(missing_ok=True)
        return 0 if successful and result.get('verified') and (mode == 'shadow' or result.get('published') or result.get('queued')) else 1
    except Exception as error:
        revenue.log.error('Unified ingestion failed: %s', revenue.controlled_error_message(error))
        try:
            status('rejected', 'upload_failed')
        except Exception:
            revenue.log.error('Collection failure status could not be reported; existing wrapper alert required')
        response = getattr(error, 'response', None)
        if response is not None:
            try:
                if response.status_code in (400, 401, 403, 409, 422) or response.json().get('retryable') is False:
                    return 78
            except (ValueError, AttributeError):
                pass
        return 1


if __name__ == '__main__':
    raise SystemExit(main('--dry-run' in sys.argv, 'shadow' if '--shadow' in sys.argv else 'publish'))
