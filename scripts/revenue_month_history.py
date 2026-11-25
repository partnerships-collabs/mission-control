"""Bounded recovery of failed full-month reports without refetching successes."""
import time
import revenue_collector as revenue
import revenue_transport as transport


def transient(error):
    return (isinstance(error, (revenue.requests.Timeout, revenue.requests.ConnectionError))
            or getattr(getattr(error, 'response', None), 'status_code', None) in transport.TRANSIENT)


def recover_months(bounds, fetch, source):
    values, failed = {}, {}
    deadline = min(transport.collection_deadline if transport.collection_deadline is not None else float('inf'),
                   time.monotonic() + 1200)

    def budget():
        if time.monotonic() >= deadline:
            raise revenue.requests.Timeout('Collection budget exhausted')

    # All ranges get an initial attempt. Later passes revisit only failed ones.
    # Permanent errors abort, rather than repeating authentication/validation.
    for start, end in bounds:
        budget()
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
            revenue.log.error('%s unresolved range=%s..%s; retaining previous publication',source,start,end.date())
        raise next(iter(failed.values()))
    return values
