"""Sequential full-month history. Subdivision failed real-provider cents parity."""
from decimal import Decimal
import time
import revenue_collector as revenue
import revenue_transport as transport

def cents(amount):
    # Preserve the existing monthly rounding before conversion to integer cents.
    return int(Decimal(str(round(amount, 2))) * 100)

def transient(error):
    return (isinstance(error, (revenue.requests.Timeout, revenue.requests.ConnectionError))
            or getattr(getattr(error, 'response', None), 'status_code', None) in transport.TRANSIENT)

def fetch_history(key, bounds, progress=None):
    values, failed = {}, {}
    deadline = min(transport.collection_deadline or float('inf'), time.monotonic()+1200)
    def budget():
        if time.monotonic() >= deadline:
            raise revenue.requests.Timeout('Collection budget exhausted')

    def fetch(start, end):
        cache_key = 'month:adsbymoney:' + str(start) + ':' + str(end.date())
        def request():
            budget()
            return cents(revenue.fetch_adsbymoney_ytd(key, end, start_date=start, require_rows=False))
        if progress:
            return progress.memo(cache_key, request, revenue.utc_iso)[0]
        return request()

    # All ranges get an initial attempt. Later passes revisit only failed ones.
    # Permanent errors abort, rather than repeating authentication/validation.
    for start, end in bounds:
        try:
            values[str(start)[:7]] = fetch(start, end)
        except Exception as error:
            if not transient(error):
                raise
            failed[(start, end)] = error
            response = getattr(error, 'response', None)
            # A provider-wide Retry-After also applies before the NEXT month,
            # not just before retrying this particular request.
            if response is not None and response.headers.get('Retry-After'):
                delay = transport.retry_delay(response, 2)
                if time.monotonic()+delay >= deadline:
                    raise
                time.sleep(delay)
    for _ in range(2):
        for (start, end), prior in list(failed.items()):
            budget()
            response = getattr(prior, 'response', None)
            if response is not None:
                delay = transport.retry_delay(response, 2)
                if time.monotonic()+delay >= deadline:
                    raise prior
                time.sleep(delay)
            try:
                values[str(start)[:7]] = fetch(start, end)
                del failed[(start, end)]
            except Exception as error:
                if not transient(error):
                    raise
                failed[(start, end)] = error

    if failed:
        # Real-provider full-month/half-month comparison differed by a cent.
        # Another successful sample cannot override this known non-additivity.
        for start,end in failed:
            revenue.log.error('AdsByMoney unresolved range=%s..%s; subdivision not accounting-safe',start,end.date())
        raise next(iter(failed.values()))
    if sum(values.values()) <= 0:
        raise revenue.ConnectorError('empty_data')
    return {month: amount/100 for month, amount in values.items()}
