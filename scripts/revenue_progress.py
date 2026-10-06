"""Private per-run inputs, never cross-run revenue caches or credential stores."""
from copy import deepcopy
from datetime import datetime, timezone
from threading import RLock
import time
import revenue_checkpoint as checkpoint
import revenue_transport as transport

VERSION = 1
BUDGET_SECONDS = 1200

class Progress:
    def __init__(self, path, run_id, started, cutoff, origin, mode):
        self.path, self.lock = path, RLock()
        self.value = {'version': VERSION, 'origin': origin, 'mode': mode, 'cutoff': cutoff,
            'payload': {'collectorRunId': run_id, 'collectorStartedAt': started,
                        'collectorCompletedAt': started}, 'entries': {}}

    @classmethod
    def resume(cls, path, origin, mode):
        value = checkpoint.load(path)
        if not value or value.get('version') != VERSION or value.get('origin') != origin or value.get('mode') != mode:
            return None
        started = datetime.fromisoformat(value['payload']['collectorStartedAt'].replace('Z', '+00:00'))
        if (datetime.now(timezone.utc)-started).total_seconds() >= BUDGET_SECONDS:
            return None
        obj = cls(path, value['payload']['collectorRunId'], value['payload']['collectorStartedAt'], value['cutoff'], origin, mode)
        obj.value = value
        return obj

    def start_budget(self):
        started = datetime.fromisoformat(self.value['payload']['collectorStartedAt'].replace('Z', '+00:00'))
        remaining = BUDGET_SECONDS - (datetime.now(timezone.utc)-started).total_seconds()
        transport.collection_deadline = time.monotonic() + max(0, remaining)

    def get(self, key):
        with self.lock:
            return deepcopy(self.value['entries'].get(key))

    def put(self, key, value, fetched_at):
        with self.lock:
            entry = {'value': deepcopy(value), 'fetchedAt': fetched_at}
            prior = self.value['entries'].get(key)
            if prior is not None and prior != entry:
                raise ValueError('Conflicting checkpoint input')
            self.value['entries'][key] = entry
            checkpoint.save(self.path, self.value)

    def memo(self, key, fetch, timestamp):
        saved = self.get(key)
        if saved is not None:
            return saved['value'], saved['fetchedAt']
        value = fetch()
        captured = timestamp()
        self.put(key, value, captured)
        return value, captured
