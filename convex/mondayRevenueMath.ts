import { v } from 'convex/values';

export const mondayRowValidator = v.object({
  itemId: v.string(), name: v.string(), invoice: v.string(), paymentDate: v.string(), periodDate: v.string(),
  grossCents: v.optional(v.number()), basis: v.union(v.literal('gross'), v.literal('ca_net_20pct'), v.literal('creator_payout_80pct'), v.literal('missing'), v.literal('conflicting_split')),
  disposition: v.union(v.literal('included'), v.literal('covered'), v.literal('review'), v.literal('unpaid'), v.literal('future')),
  reason: v.string(), source: v.optional(v.string()), references: v.array(v.string()), updatedAt: v.string(), state: v.string(),
});
export const mondaySummaryValidator = v.object({
  totalRows: v.number(), includedRows: v.number(), reviewRows: v.number(), coveredRows: v.number(),
  estimatedRows: v.number(), estimatedAllTimeUsd: v.number(), totalYtdUsd: v.number(), totalAllTimeUsd: v.number(),
});
export type MondayRow = {
  itemId: string; name: string; invoice: string; paymentDate: string; periodDate: string;
  grossCents?: number; basis: string; disposition: string; reason: string; source?: string;
  references: string[]; updatedAt: string; state: string;
};

export function summarizeMondayRows(rows: MondayRow[], snapshotDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate) || !Number.isFinite(Date.parse(snapshotDate))
    || new Date(snapshotDate).toISOString().slice(0,10) !== snapshotDate) throw new Error('Invalid audit date');
  const ids = new Set<string>();
  let allTimeCents = 0, ytdCents = 0, estimatedCents = 0, includedRows = 0, estimatedRows = 0;
  for (const row of rows) {
    if (!/^\d+$/.test(row.itemId) || ids.has(row.itemId) || row.name.length > 500 || row.references.length > 50
      || (row.grossCents !== undefined && !Number.isSafeInteger(row.grossCents))) throw new Error('Invalid audit row');
    ids.add(row.itemId);
    if (row.disposition !== 'included') continue;
    if (row.grossCents === undefined || !['gross','ca_net_20pct','creator_payout_80pct'].includes(row.basis)
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.paymentDate) || !Number.isFinite(Date.parse(row.paymentDate))
      || new Date(row.paymentDate).toISOString().slice(0,10) !== row.paymentDate || row.paymentDate > snapshotDate) throw new Error('Invalid included payment');
    includedRows++;
    allTimeCents += row.grossCents;
    if (row.paymentDate.slice(0,4) === snapshotDate.slice(0,4)) ytdCents += row.grossCents;
    if (row.basis !== 'gross') { estimatedRows++; estimatedCents += row.grossCents; }
  }
  if (![allTimeCents, ytdCents, estimatedCents].every(Number.isSafeInteger) || allTimeCents < 0 || ytdCents < 0) throw new Error('Invalid audit sum');
  return { totalRows: rows.length, includedRows, reviewRows: rows.filter(r => r.disposition === 'review').length,
    coveredRows: rows.filter(r => r.disposition === 'covered').length, estimatedRows, estimatedAllTimeUsd: estimatedCents/100,
    totalYtdUsd: ytdCents/100, totalAllTimeUsd: allTimeCents/100 };
}

