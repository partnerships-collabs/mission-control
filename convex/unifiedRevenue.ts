import { internalMutation } from './_generated/server';
import {v} from 'convex/values';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { unifiedRunFields } from './unifiedRevenueModel';
import { evaluateUnifiedAttempt, UNIFIED_SOURCES } from './unifiedRevenueMath';
import { revenueScheduleHealth, revenueSourceFreshness, safeRevenueSourceError } from './revenueMath';
import {readEvidence} from './revenueEvidence';
import {assertOverrideEvidenceStable,deriveCloseDays,reconcileMonday} from './reconcileMonday';
import {realtimeState,scheduleRefresh} from './realtimeRevenue';
import {chicagoDate} from './realtimeRevenueModel';

type ReadCtx = Pick<QueryCtx,'db'> | Pick<MutationCtx,'db'>;
// Separate transactions from publication: a rejected/rolled-back mutation must
// never erase evidence that an authenticated upload was attempted.
export const recordIngestionReceipt = internalMutation({args:{collectorRunId:v.string(),startedAt:v.number(),
  status:v.union(v.literal('processing'),v.literal('verified'),v.literal('rejected')),
  code:v.optional(v.string()),retryable:v.optional(v.boolean())},handler:async(ctx,args)=>{
  const prior=await ctx.db.query('revenue_ingestion_receipts').withIndex('by_run',q=>q.eq('collectorRunId',args.collectorRunId)).unique();
  if(prior&&prior.startedAt!==args.startedAt)throw Error('Conflicting run ID');
  // An erroneous duplicate cannot turn a committed verified run into a failure.
  const run=await ctx.db.query('revenue_unified_runs').withIndex('by_run',q=>q.eq('collectorRunId',args.collectorRunId)).unique();
  const status=run?.verified?'verified':args.status;
  const fields={...args,status,code:status==='verified'?undefined:args.code,retryable:status==='verified'?undefined:args.retryable,updatedAt:Date.now()};
  if(prior)await ctx.db.patch(prior._id,fields);
  else await ctx.db.insert('revenue_ingestion_receipts',{...fields,receivedAt:Date.now()});
}});
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
        queued:existing.verified&&existing.mode==='publish'&&!existing.published,
        totalYtdUsd:existing.snapshot?.totalYtdUsd??null,totalAllTimeUsd:existing.snapshot?.totalAllTimeUsd??null};
    }
    const receivedAt=Date.now();
    const audit=args.mondayAuditId?await ctx.db.query('revenue_monday_audits').withIndex('by_audit',q=>q.eq('auditId',args.mondayAuditId!)).unique():null;
    const chunks=audit?await ctx.db.query('revenue_monday_chunks').withIndex('by_audit_chunk',q=>q.eq('auditId',audit.auditId)).collect():[];
    const result=evaluateUnifiedAttempt(input,chunks.flatMap(c=>c.rows),receivedAt);
    const realtime=await realtimeState(ctx);
    if(args.evidenceId){
      try{
        if(args.evidenceId!==args.mondayAuditId)throw Error('evidence_audit_mismatch');
        const evidence=await readEvidence(ctx,args.evidenceId);
        const prior=realtime?.baselineId?await ctx.db.get(realtime.baselineId):null;
        if(prior?.evidenceId){const previous=await readEvidence(ctx,prior.evidenceId);assertOverrideEvidenceStable(evidence.items,evidence.close,previous.close);}
        const rows=reconcileMonday(evidence.items,evidence.close,evidence.creatorAliases,args.snapshotDate);
        if(canonical(rows)!==canonical(chunks.flatMap(c=>c.rows))||canonical(deriveCloseDays(evidence.close,args.snapshotDate))!==canonical(args.closeDays))throw Error('reconciliation_parity_failed');
      }catch{result.issues.push('reconciliation_evidence_invalid');}
    }
    if (!audit || audit.snapshotDate!==args.snapshotDate || !audit.ruleVersion.startsWith('2026-09-18.msn-paid:')
        || audit.fetchedAt!==sourceHealth.msn.fetchedAt || audit.fetchedAt!==sourceHealth.monday_affiliates.fetchedAt) result.issues.push('monday_audit_mismatch');
    const publication=await activePublication(ctx);
    if(realtime?.mode==='live'&&!args.evidenceId&&args.mode==='publish')result.issues.push('reconciliation_evidence_required');
    const lastAttempt=publication?await ctx.db.get(publication.latestAttemptId):null;
    // A delayed old run may never replace a newer failure or verified dataset.
    const clockValid=!result.issues.some(issue=>['invalid_collection_time','invalid_snapshot_date','invalid_utc_timestamp'].includes(issue));
    const dailyPrior=realtime?.dailyAttemptId?await ctx.db.get(realtime.dailyAttemptId):null;
    const orderingBase=realtime?.mode==='live'?dailyPrior:lastAttempt;
    const ordered=clockValid && (!orderingBase || Date.parse(args.collectorStartedAt)>Date.parse(orderingBase.collectorStartedAt));
    if (clockValid && !ordered && args.mode==='publish') result.issues.push('out_of_order_run');
    const verified=result.issues.length===0;
    const queued=verified&&args.mode==='publish'&&realtime?.mode==='live';
    const published=verified && args.mode==='publish'&&!queued;
    const id=await ctx.db.insert('revenue_unified_runs',{...input,receivedAt,verified,published,issues:result.issues,
      ...(verified && result.snapshot?{snapshot:result.snapshot}:{})});
    // One transactional pointer controls BOTH consumers. No dual publication.
    if (args.mode==='publish' && ordered && realtime) {
      await ctx.db.patch(realtime._id,{dailyAttemptId:id,...(verified&&args.evidenceId?{baselineId:id,requested:realtime.requested+1}:{} )});
      if(verified&&args.evidenceId)await scheduleRefresh(ctx,0);
    }
    if (args.mode==='publish' && ordered && realtime?.mode!=='live') {
      if (publication) await ctx.db.patch(publication._id,{latestAttemptId:id,...(published?{publishedRunId:id}:{})});
      else if (published) await ctx.db.insert('revenue_publication',{key:'active',publishedRunId:id,latestAttemptId:id});
    }
    return {runId:args.collectorRunId,verified,published,queued:Boolean(queued),issues:result.issues,
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
  const receipt=await ctx.db.query('revenue_ingestion_receipts').withIndex('by_started').order('desc').first();
  const receiptRun=receipt?await ctx.db.query('revenue_unified_runs').withIndex('by_run',q=>q.eq('collectorRunId',receipt.collectorRunId)).unique():null;
  const collection=receipt?{collectorRunId:receipt.collectorRunId,startedAt:receipt.startedAt,receivedAt:receipt.receivedAt,updatedAt:receipt.updatedAt,
    status:receiptRun?.verified?'verified':receipt.status,code:receiptRun?.verified?null:receipt.code??null,
    retryable:receiptRun?.verified?false:receipt.retryable??false}:null;
  const latestReceiptRelevant=receipt&&receipt.startedAt>=Date.parse(attempt.collectorStartedAt);
  const ingestionIssues=latestReceiptRelevant&&!receiptRun?.verified
    ? receipt.status==='rejected'?['collection_upload_failed']
      :receipt.status==='processing'&&now-receipt.updatedAt>600_000?['collection_upload_incomplete']:[] :[];
  const realtime=await realtimeState(ctx);
  const dailyAttempt=realtime?.dailyAttemptId?await ctx.db.get(realtime.dailyAttemptId):null;
  const schedule=revenueScheduleHealth(run.provenance?chicagoDate(Date.parse(run.provenance.lastFullRefreshAt)):run.snapshotDate,new Date(now));
  const sourceHealth=Object.fromEntries(UNIFIED_SOURCES.map(key=>[key,{...run.sourceHealth[key],
    freshness:revenueSourceFreshness({...run.sourceHealth[key],...(run.provenance?{reused:false}:{})},now),
    ...(run.provenance&&dailyAttempt?{lastDailyStatus:dailyAttempt.sourceHealth[key].status}:{}),connection:key==='msn'?'monday_affiliates':key}]));
  const fresh=UNIFIED_SOURCES.every(key=>sourceHealth[key].freshness==='fresh');
  const live=Boolean(run.provenance);
  const closeError=live&&realtime?.mode!=='off'?realtime?.error:undefined;
  const issues=[...attempt.issues,...ingestionIssues,...(live&&dailyAttempt&&!dailyAttempt.verified?dailyAttempt.issues:[]),
    ...(closeError?['close_refresh_failed']:[]),...(!schedule.lastAttemptOnSchedule?['scheduled_update_missing']:[]),...(!fresh?['sources_stale']:[])];
  const snapshot={...run.snapshot, datasetId:run.collectorRunId, msnSource:'monday_paid' as const,
    snapshotDate:run.snapshotDate,collectorStartedAt:run.collectorStartedAt,collectorCompletedAt:run.collectorCompletedAt,
    goalUsd:run.goalUsd,verifiedAt:run.receivedAt,sourceHealth,
    ...(run.provenance?{refresh:{...run.provenance,closePending:Boolean(realtime&&realtime.requested>realtime.processed),
      closeError:closeError??null,mode:realtime?.mode??'off',allSourcesCurrent:issues.length===0}}:{}),
    monday:{auditId:audit.auditId,fetchedAt:audit.fetchedAt,ruleVersion:audit.ruleVersion,summary:audit.summary}};
  return {healthy:attempt.published && issues.length===0,issues,schedule,snapshot,collection,
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
  const queue=await realtimeState(ctx);
  return {healthy:report.healthy,issues:report.issues,schedule:report.schedule,collection:report.collection,datasetId:s.datasetId,
    ...(s.refresh?{refresh:s.refresh}:{}),
    queue:queue?{mode:queue.mode,pending:queue.requested>queue.processed,requestedVersion:queue.requested,processedVersion:queue.processed,
      failures:queue.failures,error:queue.error??null,lastEventAt:queue.lastEventAt??null,lastSuccessAt:queue.lastSuccessAt??null,
      leaseUntil:queue.leaseUntil??null,retryAt:queue.retryAt??null,scheduled:Boolean(queue.scheduled)}:{mode:'off'},
    displayStatus:'verified',displaySnapshot:{snapshotDate:s.snapshotDate,totalYtdUsd:s.totalYtdUsd,updatedAt:s.verifiedAt,datasetId:s.datasetId},
    lastAttempt:report.lastAttempt,lastVerifiedSnapshot:{snapshotDate:s.snapshotDate,totalYtdUsd:s.totalYtdUsd,
      totalAllTimeUsd:s.totalAllTimeUsd,verifiedAt:s.verifiedAt,collectorRunId:s.datasetId,
      collectorStartedAt:s.collectorStartedAt,collectorCompletedAt:s.collectorCompletedAt,sourceHealth:s.sourceHealth},
    lastNonAuthoritativeCloseDiagnostic:null};
}
