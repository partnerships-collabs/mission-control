import unittest
from unittest.mock import patch
from datetime import datetime
import test_revenue_collector as fixtures
import collect_all_revenue as unified
from test_monday_affiliates import item, POLICY

NOW = datetime(2026, 9, 18, tzinfo=unified.revenue.CHICAGO)

class UnifiedTests(unittest.TestCase):
    def test_redventures_history_uses_one_token_for_the_whole_capture(self):
        with patch.object(unified.revenue, 'fetch_redventures_token', return_value='fixture') as token, \
             patch.object(unified.revenue, 'fetch_redventures_ytd', return_value=1) as report:
            values = unified.history.fetch_monthly_history(fixtures.runtime_secrets(), NOW, 'redventures')
        token.assert_called_once()
        self.assertEqual(len(values), 81)
        self.assertEqual(report.call_count, 81)
        self.assertTrue(all(call.kwargs['access_token'] == 'fixture' for call in report.call_args_list))

    def test_msn_payments_replace_sheet_and_signed_adjustments_are_counted_once(self):
        rows = unified.monday.reconcile([
            item(name='Microsoft Start x One', numbers='100', date='2025-12-31'),
            item('2', name='Microsoft Start - Deficit', numbers='-.17'),
            item('3', name='Microsoft Start - Excess', numbers='.72'),
            item('4', name='MSN x Two', numbers='50'),
            item('5', name='Money.com x One'),
        ], [], [], NOW, POLICY, msn_from_monday=True)
        self.assertEqual([r['disposition'] for r in rows], ['included'] * 4 + ['covered'])
        self.assertEqual(sum(r['grossCents'] for r in rows if r.get('source') == 'msn'), 15055)
        self.assertEqual(unified.monday.summarize(rows, '2026-09-18')['totalYtdUsd'], 50.55)

    def test_missing_amount_or_date_and_identical_msn_lines_are_not_silently_counted(self):
        for values in [{'numbers':''}, {'date':''}]:
            rows = unified.monday.reconcile([item(name='Microsoft Start x A', **values)], [], [], NOW, POLICY, msn_from_monday=True)
            self.assertEqual(rows[0]['source'], 'msn')
            self.assertEqual(rows[0]['disposition'], 'review')
        rows = unified.monday.reconcile([item(name='Microsoft Start x A'), item('2', name='Microsoft Start x A')], [], [], NOW, POLICY, msn_from_monday=True)
        self.assertTrue(all(r['disposition'] == 'review' for r in rows))

    def test_close_capture_uses_cents_dates_and_rejects_duplicates_or_invalid_values(self):
        row = {'id':'a', 'date_won':'2026-09-18', 'value':12345, 'value_currency':'USD', 'value_period':'one_time'}
        self.assertEqual(unified.close_days([row], NOW), [{'date':'2026-09-18', 'amountCents':12345}])
        for value in [True, -1, 1.5, float('nan'), float('inf'), '100']:
            with self.assertRaises(unified.revenue.ConnectorError): unified.close_days([{**row, 'value':value}], NOW)
        with self.assertRaises(unified.revenue.ConnectorError): unified.close_days([row, row], NOW)

    def test_one_capture_shared_with_monday_and_never_loads_google_credentials(self):
        rows = unified.monday.reconcile([item(name='Microsoft Start x A')], [], [], NOW, POLICY, msn_from_monday=True)
        opportunities = [{'id':'a', 'date_won':'2026-09-18', 'value':12345, 'value_currency':'USD', 'value_period':'one_time'}]
        audit = {'auditId':'test', 'fetchedAt':unified.revenue.utc_iso(), 'rows':rows}
        with patch.object(unified.revenue, 'load_runtime_secrets', return_value=fixtures.runtime_secrets()) as secrets, \
             patch.object(unified.monday, 'fetch_close_evidence', return_value=opportunities) as close, \
             patch.object(unified.monday, 'collect', return_value=audit) as monday, \
             patch.object(unified.history, 'fetch_monthly_history', return_value={'2026-09':10}) as platform:
            payload, _, _, success = unified.collect_payload(dry_run=True, now=NOW)
        secrets.assert_called_once_with(include_msn=False)
        close.assert_called_once(); self.assertEqual(platform.call_count, 3)
        self.assertIs(monday.call_args.kwargs['opportunities'], opportunities)
        self.assertTrue(monday.call_args.kwargs['read_only'])
        self.assertTrue(success)
        self.assertEqual(payload['sourceHealth']['msn']['amountUsd'], 100)
        self.assertEqual(payload['sourceHealth']['monday_affiliates']['amountUsd'], 0)

if __name__ == '__main__':
    unittest.main()
