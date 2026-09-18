import { evaluateAllTimeRevenue } from './allTimeRevenueMath';
import { deriveRevenueSnapshotMetrics, shiftDate, type RevenueSourceHealth } from './revenueMath';
import { summarizeMondayRows, type MondayRow } from './mondayRevenueMath';

export const UNIFIED_SOURCES = ['close','impact','redventures','adsbymoney','msn','monday_affiliates'] as const;
type Sources = Record<typeof UNIFIED_SOURCES[number], number>;
export type UnifiedAttempt = {
  collectorRunId:string; snapshotDate:string; collectorStartedAt:string; collectorCompletedAt:string;
  goalUsd:number; sourceHealth:RevenueSourceHealth;
  closeDays:Array<{date:string;amountCents:number}>;
  platformMonths:Array<{month:string;impactCents:number;redventuresCents:number;adsbymoneyCents:number}>;
};
const zero = (): Sources => ({close:0,impact:0,redventures:0,adsbymoney:0,msn:0,monday_affiliates:0});
const usd = (value:Sources): Sources => Object.fromEntries(UNIFIED_SOURCES.map(k=>[k,value[k]/100])) as Sources;
const sum = (value:Sources) => UNIFIED_SOURCES.reduce((n,k)=>n+value[k],0);
function add(value:Sources, source:keyof Sources, amount:number) {
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(value[source]+amount)) throw new Error('invalid_cents');
  value[source] += amount;
}
function validDate(value:string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function nextMonth(month:string) {
  const [y,m] = month.split('-').map(Number);
  return `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;
}

// Money is summed in integer cents. No supplied period or grand total is trusted.
export function deriveUnifiedSnapshot(attempt:UnifiedAttempt, mondayRows:MondayRow[]) {
  if (!validDate(attempt.snapshotDate)) throw new Error('invalid_snapshot_date');
  const monthly = new Map<string,Sources>();
  const month = (key:string) => { if (!monthly.has(key)) monthly.set(key,zero()); return monthly.get(key)!; };
  if (!attempt.closeDays.length || attempt.closeDays.length>20000) throw new Error('close_history_missing');
  let previous = '', closeLast30Cents = 0;
  const last30Start = shiftDate(attempt.snapshotDate,-29);
  for (const row of attempt.closeDays) {
    if (!validDate(row.date) || row.date<=previous || row.date>attempt.snapshotDate || row.amountCents<0) throw new Error('close_days_invalid');
    add(month(row.date.slice(0,7)),'close',row.amountCents);
    if (row.date>=last30Start) closeLast30Cents+=row.amountCents;
    previous=row.date;
  }
  if (!Number.isSafeInteger(closeLast30Cents)) throw new Error('invalid_cents');
  let expected='2020-01';
  if (!attempt.platformMonths.length || attempt.platformMonths.length>1200) throw new Error('platform_history_missing');
  for (const row of attempt.platformMonths) {
    if (row.month!==expected || row.month>attempt.snapshotDate.slice(0,7)) throw new Error('platform_month_gap');
    for (const source of ['impact','redventures','adsbymoney'] as const) add(month(row.month),source,row[`${source}Cents`]);
    expected=nextMonth(expected);
  }
  if (expected!==nextMonth(attempt.snapshotDate.slice(0,7))) throw new Error('platform_history_incomplete');
  summarizeMondayRows(mondayRows,attempt.snapshotDate);
  let msnCount=0;
  for (const row of mondayRows) {
    if (row.source==='msn' && row.disposition==='review') throw new Error('msn_payment_review');
    if (row.disposition!=='included') continue;
    if (row.source && row.source!=='msn') throw new Error('monday_source_invalid');
    const source=row.source==='msn'?'msn':'monday_affiliates';
    if (source==='msn') msnCount++;
    add(month(row.paymentDate.slice(0,7)),source,row.grossCents!);
  }
  if (!msnCount) throw new Error('msn_history_missing');
  const first=[...monthly.keys()].sort()[0];
  for (let key=first;key<=attempt.snapshotDate.slice(0,7);key=nextMonth(key)) month(key);
  const lifetime=zero(), ytd=zero();
  const months=[...monthly].sort(([a],[b])=>a.localeCompare(b)).map(([key,values])=>{
    for (const source of UNIFIED_SOURCES) {
      add(lifetime,source,values[source]);
      if (key.slice(0,4)===attempt.snapshotDate.slice(0,4)) add(ytd,source,values[source]);
    }
    return {month:key,sources:usd(values)};
  });
  if (UNIFIED_SOURCES.some(k=>lifetime[k]<0 || ytd[k]<0) || !Number.isSafeInteger(sum(lifetime)) || !Number.isSafeInteger(sum(ytd))) throw new Error('invalid_total');
  const sources=usd(lifetime), ytdSources=usd(ytd);
  const metrics=deriveRevenueSnapshotMetrics(ytdSources,attempt.snapshotDate,closeLast30Cents/100);
  return { sources,ytdSources,monthly:{months,undatedSources:{}}, totalAllTimeUsd:sum(lifetime)/100,
    ...metrics, totalYtdUsd:sum(ytd)/100, closeLast30DayUsd:closeLast30Cents/100 };
}

export function evaluateUnifiedAttempt(attempt:UnifiedAttempt, mondayRows:MondayRow[], now:number) {
  const issues=[...evaluateAllTimeRevenue(attempt,now).issues];
  if (!attempt.sourceHealth.monday_affiliates) issues.push('monday_affiliates_required');
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(attempt.collectorRunId)) issues.push('invalid_run_id');
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  if (![attempt.collectorStartedAt,attempt.collectorCompletedAt,...UNIFIED_SOURCES.map(k=>attempt.sourceHealth[k]?.fetchedAt??'')]
    .every(value=>utc.test(value))) issues.push('invalid_utc_timestamp');
  if (!Number.isFinite(attempt.goalUsd) || attempt.goalUsd<=0) issues.push('invalid_goal');
  if (Date.parse(attempt.collectorCompletedAt)<now-3_600_000) issues.push('attempt_too_old');
  let snapshot:ReturnType<typeof deriveUnifiedSnapshot>|undefined;
  if (!issues.length) {
    try {
      snapshot=deriveUnifiedSnapshot(attempt,mondayRows);
      for (const key of UNIFIED_SOURCES) {
        if (Math.round(attempt.sourceHealth[key]!.amountUsd!*100)!==Math.round(snapshot.sources[key]*100)) issues.push(`${key}_amount_mismatch`);
      }
    } catch (error) {
      issues.push(error instanceof Error?error.message:'invalid_dataset');
    }
  }
  return {verified:issues.length===0,issues,snapshot:issues.length?undefined:snapshot};
}
