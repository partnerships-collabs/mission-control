"""Bounded retries for read-only connector requests and idempotent uploads."""
from __future__ import annotations
import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import requests
import logging

# Set only by the single locked collector process. Applies to its worker threads.
collection_deadline = None

TRANSIENT = {408, 429, 500, 502, 503, 504}

def retry_delay(response, attempt):
    header = response.headers.get('Retry-After', '') if response is not None else ''
    try:
        delay = float(header)
    except (ValueError, TypeError):
        try:
            delay = (parsedate_to_datetime(header) - datetime.now(timezone.utc)).total_seconds()
        except (ValueError, TypeError, OverflowError):
            delay = 0
    # Never retry earlier than the provider's Retry-After. Long delays abort
    # this bounded invocation; the immutable upload checkpoint is retained.
    return max(0, delay, min(30, 2 ** attempt) + random.uniform(0, 1))

def request_with_retry(request, *args, diagnostic=None, **kwargs):
    deadline = time.monotonic() + 180
    if collection_deadline is not None:
        deadline = min(deadline, collection_deadline)
    for attempt in range(3):
        response = None
        began = time.monotonic()
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise requests.Timeout('Collection budget exhausted')
            options = dict(kwargs)
            if isinstance(options.get('timeout'), (int, float)):
                options['timeout'] = min(options['timeout'], remaining)
            response = request(*args, **options)
            if diagnostic:
                logging.getLogger(__name__).info('source=%s range=%s..%s attempt=%s duration=%.2f status=%s',
                    *diagnostic, attempt + 1, time.monotonic()-began, response.status_code)
            retryable = response.status_code in TRANSIENT
            # Our protected ingestion routes explicitly classify permanent
            # server/validation errors. Do not repeat deterministic failures.
            if retryable:
                try:
                    body = response.json()
                    if isinstance(body, dict) and body.get('retryable') is False:
                        return response
                except (ValueError, TypeError):
                    pass
            if not retryable or attempt == 2:
                return response
        except (requests.Timeout, requests.ConnectionError):
            if diagnostic:
                logging.getLogger(__name__).warning('source=%s range=%s..%s attempt=%s duration=%.2f status=transport_failure',
                    *diagnostic, attempt + 1, time.monotonic()-began)
            if attempt == 2 or time.monotonic() >= deadline:
                raise
        delay = retry_delay(response, attempt)
        if time.monotonic() + delay >= deadline:
            if response is not None:
                return response
            raise requests.Timeout('Retry budget exhausted')
        if response is not None:
            response.close()
        time.sleep(delay)
    raise RuntimeError('Unreachable retry state')
