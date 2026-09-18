// Read-only stdin verifier: private captured facts are never printed or persisted.
// Feed {payload,audit,legacyYtd,legacyAllTime} from the service's --dry-run capture.
import { evaluateUnifiedAttempt, UNIFIED_SOURCES } from '../convex/unifiedRevenueMath';
import { validMonthlyRevenue } from '../convex/monthlyRevenueMath';
import assert from 'node:assert/strict';

async function main() {
let input='';
for await (const chunk of process.stdin) input+=chunk;
const {payload,audit,legacyYtd,legacyAllTime}=JSON.parse(input);
const result=evaluateUnifiedAttempt(payload,audit?.rows??[],Date.now());
assert.equal(result.verified,true,JSON.stringify(result.issues));
const snapshot=result.snapshot!;
assert.equal(validMonthlyRevenue(snapshot.monthly,snapshot.sources,payload.snapshotDate),true);
const beforeAllTime=legacyAllTime.snapshot.sources;
const beforeYtd=legacyYtd.sources;
console.log(JSON.stringify({verified:true,dryRun:true,collectorRunId:payload.collectorRunId,
  snapshotDate:payload.snapshotDate,totalYtdUsd:snapshot.totalYtdUsd,totalAllTimeUsd:snapshot.totalAllTimeUsd,
  legacySnapshotDate:legacyAllTime.snapshot.snapshotDate,
  monthlyCount:snapshot.monthly.months.length,msnPaymentRows:audit.rows.filter((r:any)=>r.source==='msn'&&r.disposition==='included').length,
  sourceComparison:Object.fromEntries(UNIFIED_SOURCES.map(source=>[source,{
    allTimeUsd:snapshot.sources[source],ytdUsd:snapshot.ytdSources[source],
    allTimeChangeUsd:Math.round((snapshot.sources[source]-beforeAllTime[source])*100)/100,
    ytdChangeUsd:Math.round((snapshot.ytdSources[source]-beforeYtd[source])*100)/100,
  }]))},null,2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Candidate verification failed'); process.exitCode=1; });
