import type { RevenueSourceHealth, RevenueSourceName } from './revenueMath';

const REVENUE_SOURCE_NAMES: RevenueSourceName[] = ['close', 'impact', 'redventures', 'adsbymoney', 'msn'];


export type AllTimeRevenueAttempt = {
  collectorRunId: string;
  snapshotDate: string;
  collectorStartedAt: string;
  collectorCompletedAt: string;
  sourceHealth: RevenueSourceHealth;
};

export function evaluateAllTimeRevenue(attempt: AllTimeRevenueAttempt, now: number) {
  const issues: string[] = [];
  const started = Date.parse(attempt.collectorStartedAt);
  const completed = Date.parse(attempt.collectorCompletedAt);
  const date = Date.parse(`${attempt.snapshotDate}T00:00:00Z`);
  if (!attempt.collectorRunId || !/^\d{4}-\d{2}-\d{2}$/.test(attempt.snapshotDate)
    || !Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== attempt.snapshotDate) issues.push('invalid_run');
  if (!Number.isFinite(started) || !Number.isFinite(completed) || started > completed
    || completed > now + 300_000 || now - started > 6 * 60 * 60 * 1000) issues.push('invalid_collection_time');
  if (Number.isFinite(started) && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(started) !== attempt.snapshotDate) {
    issues.push('invalid_snapshot_date');
  }
  let cents = 0;
  const sources: RevenueSourceName[] = attempt.sourceHealth.monday_affiliates ? [...REVENUE_SOURCE_NAMES, 'monday_affiliates'] : REVENUE_SOURCE_NAMES;
  for (const source of sources) {
    const health = attempt.sourceHealth[source]!;
    const fetched = Date.parse(health.fetchedAt);
    if (health.status !== 'success' || health.reused || health.error
      || typeof health.amountUsd !== 'number' || !Number.isFinite(health.amountUsd) || health.amountUsd < 0
      || !Number.isFinite(fetched) || fetched < started - 300_000 || fetched > completed + 300_000) {
      issues.push(`${source}_failed`);
    } else {
      cents += Math.round(health.amountUsd * 100);
    }
  }
  if (!Number.isSafeInteger(cents)) issues.push('invalid_total');
  return { published: issues.length === 0, issues, totalAllTimeUsd: issues.length ? null : cents / 100 };
}
