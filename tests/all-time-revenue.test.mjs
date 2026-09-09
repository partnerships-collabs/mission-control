import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAllTimeRevenue } from '../convex/allTimeRevenueMath.ts';

const now = Date.parse('2026-09-09T17:10:00Z');
function attempt() {
  return { collectorRunId: 'run-1', snapshotDate: '2026-09-09',
    collectorStartedAt: '2026-09-09T17:00:00Z', collectorCompletedAt: '2026-09-09T17:10:00Z',
    sourceHealth: Object.fromEntries(['close','impact','redventures','adsbymoney','msn'].map(key => [key, {
      status: 'success', amountUsd: 12.34, fetchedAt: '2026-09-09T17:05:00Z', reused: false,
    }])),
  };
}
test('publishes an exact cent-rounded total only with all five fresh histories', () => {
  assert.deepEqual(evaluateAllTimeRevenue(attempt(), now), { published: true, issues: [], totalAllTimeUsd: 61.7 });
});
test('missing, reused, failed or invalid history cannot publish a partial lifetime total', () => {
  for (const patch of [{status:'failed'}, {reused:true}, {amountUsd:NaN}, {amountUsd:-1}, {amountUsd:undefined}, {error:'validation failed'}, {fetchedAt:'2025-09-09T17:05:00Z'}]) {
    const value = attempt(); Object.assign(value.sourceHealth.msn, patch);
    const result = evaluateAllTimeRevenue(value, now);
    assert.equal(result.published, false); assert.equal(result.totalAllTimeUsd, null);
    assert.ok(result.issues.includes('msn_failed'));
  }
});
test('rejects invalid and stale collection timestamps', () => {
  for (const patch of [{snapshotDate:'2026-02-30'}, {collectorStartedAt:'2025-01-01T00:00:00Z'}, {collectorCompletedAt:'2027-01-01T00:00:00Z'}]) {
    assert.equal(evaluateAllTimeRevenue({...attempt(),...patch},now).published,false);
  }
});
