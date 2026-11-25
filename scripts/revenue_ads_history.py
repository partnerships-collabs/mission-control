"""Sequential full-month history. Subdivision failed real-provider cents parity."""
from decimal import Decimal
import revenue_collector as revenue
from revenue_month_history import recover_months


def cents(amount):
    # Preserve the existing monthly rounding before conversion to integer cents.
    return int(Decimal(str(round(amount, 2))) * 100)


def fetch_history(key, bounds, progress=None):
    def fetch(start, end):
        cache_key = 'month:adsbymoney:' + str(start) + ':' + str(end.date())
        def request():
            return cents(revenue.fetch_adsbymoney_ytd(key, end, start_date=start, require_rows=False))
        if progress:
            return progress.memo(cache_key, request, revenue.utc_iso)[0]
        return request()

    values = recover_months(bounds, fetch, 'adsbymoney')
    if sum(values.values()) <= 0:
        raise revenue.ConnectorError('empty_data')
    return {month: amount/100 for month, amount in values.items()}
