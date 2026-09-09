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


if __name__ == '__main__':
    unittest.main()
