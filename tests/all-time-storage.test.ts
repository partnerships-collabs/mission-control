import test from 'node:test';
import assert from 'node:assert/strict';
import { recordAllTimeRunInternal, allTimeRevenueInternal } from '../convex/revenue';

// Run the actual registered handlers against a disposable development store.
// No source calls or production database access is involved.
function store() {
  const rows: Record<string, any>[] = [];
  const touched = new Set<string>();
  const db = {
    query(table: string) {
      touched.add(table);
      let filters: [string, any][] = [];
      let sort = 'receivedAt';
      let direction = 1;
      const query = {
        withIndex(name: string, filter?: (q: any) => void) {
          sort = name === 'by_published_completed' ? 'collectorCompletedAt' : 'receivedAt';
          const q = { eq(key: string, value: any) { filters.push([key, value]); return q; } };
          filter?.(q); return query;
        },
        order(value: string) { direction = value === 'desc' ? -1 : 1; return query; },
        async first() {
          return [...rows].filter(row => row._table === table && filters.every(([key, value]) => row[key] === value))
            .sort((a, b) => direction * (a[sort] < b[sort] ? -1 : a[sort] > b[sort] ? 1 : Number(a._id) - Number(b._id)))[0] ?? null;
        },
        async unique() { return query.first(); },
      };
      return query;
    },
    async insert(table: string, row: any) { touched.add(table); rows.push({ ...row, _table:table, _id: String(rows.length) }); return String(rows.length - 1); },
  };
  return { ctx: { db }, rows, touched };
}

function payload(runId: string, offset = 0) {
  const now = new Date(Date.now() + offset);
  const started = new Date(now.getTime() - 60_000);
  return {
    collectorRunId: runId,
    snapshotDate: new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago'}).format(started),
    collectorStartedAt: started.toISOString(),
    collectorCompletedAt: now.toISOString(),
    sourceHealth: Object.fromEntries(['close', 'impact', 'redventures', 'adsbymoney', 'msn'].map(key => [key, {
      status: 'success', amountUsd: 10, reused: false, fetchedAt: now.toISOString(),
    }])),
  };
}

const record = (recordAllTimeRunInternal as any)._handler;
const read = (allTimeRevenueInternal as any)._handler;

test('complete runs publish once; failed history preserves the complete display and marks it delayed', async () => {
  const dev = store();
  const first = payload('verified');
  assert.equal((await record(dev.ctx, first)).published, true);
  assert.equal((await read(dev.ctx, {})).snapshot.totalAllTimeUsd, 50);
  await record(dev.ctx, first);
  assert.equal(dev.rows.length, 1, 'retrying a run must not double-count revenue');
  const failure = payload('failed', 1);
  failure.sourceHealth.msn.status = 'failed';
  assert.equal((await record(dev.ctx, failure)).published, false);
  const display = await read(dev.ctx, {});
  assert.equal(display.snapshot.totalAllTimeUsd, 50);
  assert.equal(display.healthy, false);
  assert.deepEqual(display.issues, ['msn_failed']);
  assert.deepEqual([...dev.touched], ['revenue_publication', 'revenue_all_time_runs'], 'Legacy writes must not touch Smiirl tables');
});

test('before first complete history, no total is published', async () => {
  const dev = store();
  const failure = payload('missing-msn'); failure.sourceHealth.msn.status = 'failed';
  await record(dev.ctx, failure);
  assert.equal((await read(dev.ctx, {})).snapshot, null);
});
