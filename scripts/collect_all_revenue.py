"""One Monday capture shared by the independent YTD and lifetime publications."""
import os
import sys
from datetime import datetime
from pathlib import Path

import revenue_collector as revenue
import all_time_revenue_collector as lifetime
import monday_affiliates as monday


def main(dry_run=False):
    started = revenue.utc_iso()
    now = datetime.now(revenue.CHICAGO)
    try:
        state_root = Path(os.environ.get('REVENUE_STATE_DIR', str(Path.home() / 'Library/Application Support/CreatorsAgency/revenue-collector')))
        audit = monday.collect(now, None if dry_run else state_root / 'monday-item-ids.json')
        if not dry_run:
            monday.post_audit(audit, revenue.read_secret('mission_control_activity'))
        def context(period):
            return {'auditId':audit['auditId'], 'rows':audit['rows'], 'health':revenue.SourceHealth(
                amount_usd=audit['summary'][period], status='success', fetched_at=audit['fetchedAt'], reused=False)}
        ytd_context, all_time_context = context('totalYtdUsd'), context('totalAllTimeUsd')
        revenue.log.info('Monday reconciled: included=%d covered=%d review=%d estimated=%d',
                         audit['summary']['includedRows'], audit['summary']['coveredRows'], audit['summary']['reviewRows'], audit['summary']['estimatedRows'])
    except Exception as error:
        revenue.log.error('Monday reconciliation failed: %s', revenue.controlled_error_message(error))
        failure = {'health':revenue.SourceHealth(amount_usd=None, status='failed', fetched_at=revenue.utc_iso(), reused=False,
                                               error=revenue.controlled_error_message(error))}
        ytd_context = all_time_context = failure
    # Record both attempts even on failure. No prior Monday amount is substituted.
    ytd_exit = revenue.main(dry_run=dry_run, monday_context=ytd_context, now=now, started_at=started)
    lifetime_exit = lifetime.main(dry_run=dry_run, monday_context=all_time_context, now=now, started_at=started)
    return 0 if ytd_exit == lifetime_exit == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main('--dry-run' in sys.argv))
