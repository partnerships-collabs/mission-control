import unittest
from datetime import datetime, timedelta
import test_revenue_collector  # Installs the existing secret-free test stubs.
import all_time_revenue_collector as collector


class HistoryTests(unittest.TestCase):
    def test_ads_missing_earnings_only_accepts_explicit_zero_activity(self):
        revenue = collector.revenue
        self.assertEqual(revenue.ads_campaign_earnings({'revenue': 0, 'leads': 0, 'clicks': 0}, True), 0)
        for campaign in [{}, {'revenue': 100, 'leads': 1, 'clicks': 10}, {'revenue': 0}]:
            with self.assertRaises(revenue.ConnectorError):
                revenue.ads_campaign_earnings(campaign, True)
        with self.assertRaises(revenue.ConnectorError):
            revenue.ads_campaign_earnings({'revenue': 0, 'leads': 0, 'clicks': 0})
    def test_months_cover_history_once_including_leap_day(self):
        months = list(collector.calendar_months(2024, datetime(2026, 9, 9)))
        self.assertEqual(months[0][0].isoformat(), '2024-01-01')
        self.assertEqual(months[1][1].date().isoformat(), '2024-02-29')
        self.assertEqual(months[-1][1].date().isoformat(), '2026-09-09')
        for first, second in zip(months, months[1:]):
            self.assertEqual(first[1].date() + timedelta(days=1), second[0])

    def test_msn_requires_explicit_history_and_adds_ytd_once(self):
        rows = [[year, 10] for year in range(2020, 2026)]
        self.assertEqual(collector.msn_history_total(rows, 25, 2026), 85)
        for invalid in [[], rows[:-1], rows + [[2026, 20]], rows + [[2020, 10]], [[2020, '']]]:
            with self.assertRaises(collector.revenue.ConnectorError):
                collector.msn_history_total(invalid, 25, 2026)

    def test_year_rollover_requires_last_year_final_total(self):
        with self.assertRaises(collector.revenue.ConnectorError):
            collector.msn_history_total([[year, 0] for year in range(2020, 2026)], 100, 2027)

    def test_verified_cumulative_baseline_tracks_new_ytd_revenue(self):
        rows = [['Through 2025', 210853.36]]
        self.assertEqual(collector.msn_history_total(rows, 119914, 2026), 330767.36)
        self.assertEqual(collector.msn_history_total(rows, 119924, 2026), 330777.36)
        self.assertEqual(collector.msn_history_total(rows + [[2026, 150000]], 25, 2027), 360878.36)

    def test_cumulative_baseline_rejects_overlap_missing_years_and_future_balances(self):
        baseline = [['Through 2025', 210853.36]]
        for rows, year in [
            (baseline + [[2025, 10]], 2026),
            (baseline + baseline, 2026),
            (baseline, 2027),
            ([['Through 2026', 330767.36]], 2026),
            ([['Through 2025', '']], 2026),
        ]:
            with self.assertRaises(collector.revenue.ConnectorError):
                collector.msn_history_total(rows, 119914, year)


class MonthlyTests(unittest.TestCase):
    def test_monday_only_includes_reconciled_payments_and_preserves_refunds(self):
        now = datetime(2026, 1, 10)
        health = {'msn': collector.revenue.SourceHealth(amount_usd=25, status='success', fetched_at='2026-01-10T00:00:00Z', reused=False), 'monday_affiliates': None}
        rows = [
            {'disposition':'included', 'paymentDate':'2025-12-01', 'grossCents':500},
            {'disposition':'included', 'paymentDate':'2026-01-01', 'grossCents':-100},
            {'disposition':'covered', 'paymentDate':'2026-01-01', 'grossCents':10000},
            {'disposition':'review', 'paymentDate':'2026-01-01', 'grossCents':10000},
        ]
        result = collector.monthly_payload({'close': {'2025-12': 100}}, health, {'rows':rows}, now)
        self.assertEqual(result['months'][-2]['sources']['monday_affiliates'], 5)
        self.assertEqual(result['months'][-1]['sources']['monday_affiliates'], -1)
        self.assertEqual(result['undatedSources'], {'msn':25})
        self.assertIsNone(collector.monthly_payload({}, health, {}, now))

    def test_close_buckets_won_dates_and_converts_cents(self):
        from unittest.mock import patch, Mock
        response = Mock()
        response.json.return_value = {'data': [
            {'id':'one', 'value':10000, 'value_currency':'USD', 'value_period':'one_time', 'date_won':'2025-12-31'},
            {'id':'two', 'value':2500, 'value_currency':'USD', 'value_period':'one_time', 'date_won':'2026-01-01'},
        ], 'has_more':False}
        values = {}
        with patch.object(collector.revenue.requests, 'get', return_value=response) as request:
            total = collector.revenue.fetch_close_ytd(None, datetime(2026,1,10), 'key', monthly_totals=values)
        self.assertEqual(total, 125)
        self.assertEqual(values, {'2025-12':100, '2026-01':25})
        self.assertIn('date_won', request.call_args.kwargs['params']['_fields'])
        response.json.return_value['data'][0]['date_won'] = None
        with patch.object(collector.revenue.requests, 'get', return_value=response):
            with self.assertRaises(collector.revenue.ConnectorError):
                collector.revenue.fetch_close_ytd(None, datetime(2026,1,10), 'key', monthly_totals={})

    def test_month_requests_use_nonoverlapping_explicit_bounds(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        secrets = SimpleNamespace(impact_sid='id', impact_reporting_password='password')
        now = datetime(2020, 2, 20)
        with patch.object(collector.revenue, 'fetch_impact_ytd', return_value=10) as fetch:
            result = collector.fetch_monthly_history(secrets, now, 'impact')
        self.assertEqual(result, {'2020-01':10, '2020-02':10})
        bounds = sorted((call.kwargs['start_date'].isoformat(), call.args[2].date().isoformat()) for call in fetch.call_args_list)
        self.assertEqual(bounds, [('2020-01-01','2020-01-31'), ('2020-02-01','2020-02-20')])


if __name__ == '__main__':
    unittest.main()
