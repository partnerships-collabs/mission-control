import { internalMutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { unifiedRunFields } from './unifiedRevenueModel';
import { evaluateUnifiedAttempt, UNIFIED_SOURCES } from './unifiedRevenueMath';
import { revenueScheduleHealth, revenueSourceFreshness, safeRevenueSourceError } from './revenueMath';

type ReadCtx = Pick<QueryCtx,'db'> | Pick<MutationCtx,'db'>;
export const activePublication = (ctx:ReadCtx) => ctx.db.query('revenue_publication').withIndex('by_key',q=>q.eq('key','active')).unique();
function canonical(value:unknown):string {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}

export const recordUnifiedRunInternal = internalMutation({
  args:unifiedRunFields,
  handler:async(ctx,args)=>{
    const sourceHealth = {...args.sourceHealth};
    for (const key of UNIFIED_SOURCES) {
      const {error,...health}=sourceHealth[key];
      const safe=safeRevenueSourceError(error);
      sourceHealth[key]={...health,...(safe?{error:safe}:{})};
    }
    const input={...args,sourceHealth};
    const existing=await ctx.db.query('revenue_unified_runs').withIndex('by_run',q=>q.eq('collectorRunId',args.collectorRunId)).unique();
    if (existing) {
      const prior=Object.fromEntries(Object.keys(unifiedRunFields).filter(k=>k in existing).map(k=>[k,existing[k as keyof typeof existing]]));
      if (canonical(input)!==canonical(prior)) throw new Error('Conflicting run ID');
      return {runId:existing.collectorRunId,verified:existing.verified,published:existing.published,issues:existing.issues,
        totalYtdUsd:existing.snapshot?.totalYtdUsd??null,totalAllTimeUsd:existing.snapshot?.totalAllTimeUsd??null};
    }
    const receivedAt=Date.now();
    const audit=args.mondayAuditId?await ctx.db.query('revenue_monday_audits').withIndex('by_audit',q=>q.eq('auditId',args.mondayAuditId!)).unique():null;
    const chunks=audit?await ctx.db.query('revenue_monday_chunks').withIndex('by_audit_chunk',q=>q.eq('auditId',audit.auditId)).collect():[];
    const result=evaluateUnifiedAttempt(input,chunks.flatMap(c=>c.rows),receivedAt);
    if (!audit || audit.snapshotDate!==args.snapshotDate || !audit.ruleVersion.startsWith('2026-09-18.msn-paid:')
        || audit.fetchedAt!==sourceHealth.msn.fetchedAt || audit.fetchedAt!==sourceHealth.monday_affiliates.fetchedAt) result.issues.push('monday_audit_mismatch');
    const publication=await activePublication(ctx);
    const lastAttempt=publication?await ctx.db.get(publication.latestAttemptId):null;
    // A delayed old run may never replace a newer failure or verified dataset.
    const clockValid=!result.issues.some(issue=>['invalid_collection_time','invalid_snapshot_date','invalid_utc_timestamp'].includes(issue));
    const ordered=clockValid && (!lastAttempt || Date.parse(args.collectorStartedAt)>Date.parse(lastAttempt.collectorStartedAt));
    if (clockValid && !ordered && args.mode==='publish') result.issues.push('out_of_order_run');
    const verified=result.issues.length===0;
    const published=verified && args.mode==='publish';
    const id=await ctx.db.insert('revenue_unified_runs',{...input,receivedAt,verified,published,issues:result.issues,
      ...(verified && result.snapshot?{snapshot:result.snapshot}:{})});
    // One transactional pointer controls BOTH consumers. No dual publication.
    if (args.mode==='publish' && ordered) {
      if (publication) await ctx.db.patch(publication._id,{latestAttemptId:id,...(published?{publishedRunId:id}:{})});
      else if (published) await ctx.db.insert('revenue_publication',{key:'active',publishedRunId:id,latestAttemptId:id});
    }
    return {runId:args.collectorRunId,verified,published,issues:result.issues,
      totalYtdUsd:verified?result.snapshot!.totalYtdUsd:null,totalAllTimeUsd:verified?result.snapshot!.totalAllTimeUsd:null};
  },
});

export async function unifiedReport(ctx:ReadCtx) {
  const publication=await activePublication(ctx);
  if (!publication) return null; // Additive rollout: legacy reads until first complete publication.
  const [run,attempt]=await Promise.all([ctx.db.get(publication.publishedRunId),ctx.db.get(publication.latestAttemptId)]);
  if (!run?.snapshot || !run.published || !attempt) throw new Error('Unified publication unavailable');
  const audit=await ctx.db.query('revenue_monday_audits').withIndex('by_audit',q=>q.eq('auditId',run.mondayAuditId!)).unique();
  if (!audit) throw new Error('Unified audit unavailable');
  const now=Date.now();
  const schedule=revenueScheduleHealth(run.snapshotDate,new Date(now));
  const sourceHealth=Object.fromEntries(UNIFIED_SOURCES.map(key=>[key,{...run.sourceHealth[key],
    freshness:revenueSourceFreshness(run.sourceHealth[key],now),connection:key==='msn'?'monday_affiliates':key}]));
  const fresh=UNIFIED_SOURCES.every(key=>sourceHealth[key].freshness==='fresh');
  const issues=[...attempt.issues,...(!schedule.lastAttemptOnSchedule?['scheduled_update_missing']:[]),...(!fresh?['sources_stale']:[])];
  const snapshot={...run.snapshot, datasetId:run.collectorRunId, msnSource:'monday_paid' as const,
    snapshotDate:run.snapshotDate,collectorStartedAt:run.collectorStartedAt,collectorCompletedAt:run.collectorCompletedAt,
    goalUsd:run.goalUsd,verifiedAt:run.receivedAt,sourceHealth,
    monday:{auditId:audit.auditId,fetchedAt:audit.fetchedAt,ruleVersion:audit.ruleVersion,summary:audit.summary}};
  return {healthy:attempt.published && schedule.lastAttemptOnSchedule && fresh,issues,schedule,snapshot,
    lastAttempt:{collectorRunId:attempt.collectorRunId,snapshotDate:attempt.snapshotDate,
      collectorStartedAt:attempt.collectorStartedAt,collectorCompletedAt:attempt.collectorCompletedAt,
      published:attempt.published,verificationStatus:attempt.verified?'verified':'degraded',
      receivedAt:attempt.receivedAt,issues:attempt.issues,sourceHealth:attempt.sourceHealth},
  };
}

export async function unifiedYtdSnapshot(ctx:ReadCtx) {
  const report=await unifiedReport(ctx);
  if (!report) return null;
  const s=report.snapshot;
  return {snapshotDate:s.snapshotDate,totalYtdUsd:s.totalYtdUsd,goalUsd:s.goalUsd,
    last30DayUsd:s.last30DayUsd,projectedAnnualUsd:s.projectedAnnualUsd,sources:s.ytdSources,
    verificationStatus:'verified' as const,verifiedAt:s.verifiedAt,updatedAt:s.verifiedAt,
    collectorRunId:s.datasetId,datasetId:s.datasetId,collectorStartedAt:s.collectorStartedAt,
    collectorCompletedAt:s.collectorCompletedAt,sourceHealth:s.sourceHealth};
}

export async function unifiedHealthReport(ctx:ReadCtx) {
  const report=await unifiedReport(ctx);
  if (!report) return null;
  const s=report.snapshot;
  return {healthy:report.healthy,issues:report.issues,schedule:report.schedule,datasetId:s.datasetId,
    displayStatus:'verified',displaySnapshot:{snapshotDate:s.snapshotDate,totalYtdUsd:s.totalYtdUsd,updatedAt:s.verifiedAt,datasetId:s.datasetId},
    lastAttempt:report.lastAttempt,lastVerifiedSnapshot:{snapshotDate:s.snapshotDate,totalYtdUsd:s.totalYtdUsd,
      totalAllTimeUsd:s.totalAllTimeUsd,verifiedAt:s.verifiedAt,collectorRunId:s.datasetId,
      collectorStartedAt:s.collectorStartedAt,collectorCompletedAt:s.collectorCompletedAt,sourceHealth:s.sourceHealth},
    lastNonAuthoritativeCloseDiagnostic:null};
}
