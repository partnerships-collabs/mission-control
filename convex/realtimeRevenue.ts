import {v} from 'convex/values';
import {internalAction,internalMutation,internalQuery} from './_generated/server';
import type {MutationCtx,QueryCtx} from './_generated/server';
import type {Doc} from './_generated/dataModel';
import {internal} from './_generated/api';
import {chicagoDate,closeFact,transactionUuid,type CloseFact} from './realtimeRevenueModel';
import {readEvidence} from './revenueEvidence';
import {assertOverrideEvidenceStable,deriveCloseDays,reconcileMonday} from './reconcileMonday';
import {deriveUnifiedSnapshot,UNIFIED_SOURCES} from './unifiedRevenueMath';
import {summarizeMondayRows} from './mondayRevenueMath';

export const realtimeState=(ctx:Pick<QueryCtx,'db'>|Pick<MutationCtx,'db'>)=>ctx.db.query('revenue_realtime').withIndex('by_key',q=>q.eq('key','active')).unique();
export async function scheduleRefresh(ctx:MutationCtx,delay=10000){
  const state=await realtimeState(ctx);
  if(!state||state.mode==='off'||state.scheduled||(state.leaseUntil??0)>Date.now())return;
  const scheduled=await ctx.scheduler.runAfter(delay,internal.revenue.refreshCloseRealtime,{});
  await ctx.db.patch(state._id,{scheduled});
}
export const configureRealtime=internalMutation({args:{mode:v.union(v.literal('off'),v.literal('shadow'),v.literal('live')),organizationId:v.string(),subscriptionId:v.string()},handler:async(ctx,a)=>{
  if(!/^orga_[a-zA-Z0-9]+$/.test(a.organizationId)||!/^whsub_[a-zA-Z0-9]+$/.test(a.subscriptionId))throw Error('invalid_close_identity');
  const state=await realtimeState(ctx);
  if(state){
    if(a.mode==='live'){
      const shadow=state.shadowRunId?await ctx.db.query('revenue_unified_runs').withIndex('by_run',q=>q.eq('collectorRunId',state.shadowRunId!)).unique():null;
      const baseline=state.baselineId?await ctx.db.get(state.baselineId):null;
      if(state.mode!=='shadow'||!shadow?.verified||!baseline||shadow.provenance?.baselineRunId!==baseline.collectorRunId||state.error
        ||Date.now()-shadow.receivedAt>15*60000||a.organizationId!==state.organizationId||a.subscriptionId!==state.subscriptionId)throw Error('verified_shadow_required');
    }
    if(state.scheduled)await ctx.scheduler.cancel(state.scheduled);
    await ctx.db.patch(state._id,{...a,requested:state.requested+1,scheduled:undefined,lease:undefined,leaseUntil:undefined,retryAt:undefined});
  }else{
    if(a.mode==='live')throw Error('verified_shadow_required');
    await ctx.db.insert('revenue_realtime',{key:'active',...a,requested:1,processed:0,failures:0});
  }
  await scheduleRefresh(ctx);return {mode:a.mode};
}});
export const enqueueCloseEvent=internalMutation({args:{subscriptionId:v.string(),organizationId:v.string(),eventId:v.string(),revision:v.string(),objectType:v.string(),action:v.string()},handler:async(ctx,a)=>{
  const state=await realtimeState(ctx);
  if(!state)throw Error('webhook_not_initialized');
  if(a.subscriptionId!==state.subscriptionId||a.organizationId!==state.organizationId)throw Error('wrong_webhook_identity');
  if(!['opportunity','lead'].includes(a.objectType)||!['created','updated','deleted','merged'].includes(a.action))return {ignored:true};
  if(!/^ev_[a-zA-Z0-9]+$/.test(a.eventId)||!Number.isFinite(Date.parse(a.revision))||a.revision.length>40)throw Error('invalid_event');
  const key=`${a.subscriptionId}:${a.eventId}:${a.revision}`;
  if(await ctx.db.query('revenue_close_events').withIndex('by_key',q=>q.eq('key',key)).unique())return {duplicate:true};
  await ctx.db.insert('revenue_close_events',{key,receivedAt:Date.now()});
  await ctx.db.patch(state._id,{requested:state.requested+1,lastEventAt:Date.now()});
  await scheduleRefresh(ctx);return {queued:true};
}});
export const claimCloseRefresh=internalMutation({args:{},handler:async(ctx)=>{
  const s=await realtimeState(ctx),now=Date.now();
  if(!s||s.mode==='off')return null;
  await ctx.db.patch(s._id,{scheduled:undefined});
  if((s.leaseUntil??0)>now)return null;
  if(!s.baselineId){await ctx.db.patch(s._id,{error:'Verified reconciliation baseline unavailable.'});return null;}
  if(s.requested<=s.processed&&s.publishedDate===chicagoDate(now))return null;
  if((s.retryAt??0)>now){await scheduleRefresh(ctx,s.retryAt!-now);return null;}
  const lease=transactionUuid();
  await ctx.db.patch(s._id,{lease,leaseUntil:now+120000});
  return {lease,version:s.requested,baselineId:s.baselineId,mode:s.mode,organizationId:s.organizationId};
}});

export async function fetchCloseFacts(key:string,request:typeof fetch=fetch,organizationId?:string):Promise<CloseFact[]>{
  if(!key)throw Error('Close credentials unavailable.');
  const facts:CloseFact[]=[],ids=new Set<string>(),deadline=Date.now()+45000,date=chicagoDate();
  if(organizationId){
    const response=await request('https://api.close.com/api/v1/me/',{headers:{Authorization:`Basic ${btoa(key+':')}`},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Close identity verification failed.');
    const identity=await response.json();
    if(!Array.isArray(identity.organizations)||identity.organizations.length!==1||identity.organizations[0]?.id!==organizationId)throw Error('Close identity verification failed.');
  }
  for(let skip=0;skip<20000;skip+=100){
    const url=new URL('https://api.close.com/api/v1/opportunity/');
    const params={status_type:'won',date_won__lte:date,_limit:'100',_skip:String(skip),_fields:'id,note,lead_name,date_won,value,value_currency,value_period,custom'};
    for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
    if(Date.now()>=deadline)throw Error('Close request timed out.');
    const r=await request(url,{headers:{Authorization:`Basic ${btoa(key+':')}`},signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))});
    if(!r.ok){
      const e=new Error(r.status===429?'Close rate limit reached.':'Close connector request failed.') as Error&{retryAfter?:number};
      const header=r.headers.get('Retry-After')??'',seconds=Number(header)||Math.ceil((Date.parse(header)-Date.now())/1000)||60;
      e.retryAfter=Math.min(3600,Math.max(60,seconds));throw e;
    }
    const p=await r.json();if(!Array.isArray(p.data)||typeof p.has_more!=='boolean')throw Error('Invalid Close response.');
    for(const d of p.data){
      if(!d||typeof d.id!=='string'||ids.has(d.id))throw Error('Invalid Close response.');ids.add(d.id);
      const creators=Object.entries(d).filter(([k,v])=>k.startsWith('custom.')&&Array.isArray(v)).flatMap(([,v])=>(v as unknown[]).filter((x):x is string=>typeof x==='string'));
      facts.push({id:d.id,date_won:d.date_won,value:d.value,value_currency:d.value_currency,value_period:d.value_period,
        lead_name:d.lead_name??'',note:d.note??'',creators});
    }
    if(!p.has_more){deriveCloseDays(facts,date);return facts;}
    if(!p.data.length)throw Error('Incomplete Close response.');
  }
  throw Error('Close capture exceeds safety limit.');
}

export const finishCloseRefresh=internalMutation({args:{lease:v.string(),version:v.number(),baselineId:v.id('revenue_unified_runs'),facts:v.array(closeFact),startedAt:v.string(),fetchedAt:v.string()},handler:async(ctx,a)=>{
  const s=await realtimeState(ctx);
  if(!s||s.mode==='off'||s.lease!==a.lease||(s.leaseUntil??0)<Date.now())return {discarded:true};
  // A baseline change invalidates the capture. New events retain their pending
  // version and cause another pass, without starving publication under traffic.
  if(s.baselineId!==a.baselineId){
    await ctx.db.patch(s._id,{lease:undefined,leaseUntil:undefined});await scheduleRefresh(ctx,0);return {superseded:true};
  }
  const baseline=await ctx.db.get(a.baselineId);
  if(!baseline?.verified||!baseline.evidenceId||!baseline.snapshot)throw Error('baseline_unavailable');
  const evidence=await readEvidence(ctx,baseline.evidenceId),date=chicagoDate();
  assertOverrideEvidenceStable(evidence.items,a.facts,evidence.close);
  const rows=reconcileMonday(evidence.items,a.facts,evidence.creatorAliases,date);
  const platformMonths=[...baseline.platformMonths];
  let month=platformMonths.at(-1)!.month;
  while(month<date.slice(0,7)){const[y,m]=month.split('-').map(Number);month=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;platformMonths.push({month,impactCents:0,redventuresCents:0,adsbymoneyCents:0});}
  const sourceHealth=structuredClone(baseline.sourceHealth);
  for(const key of UNIFIED_SOURCES)sourceHealth[key]={...sourceHealth[key],reused:key!=='close'};
  const input={collectorRunId:transactionUuid(),snapshotDate:date,collectorStartedAt:a.startedAt,collectorCompletedAt:a.fetchedAt,
    mode:s.mode==='live'?'publish' as const:'shadow' as const,goalUsd:baseline.goalUsd,sourceHealth,
    closeDays:deriveCloseDays(a.facts,date),platformMonths,evidenceId:baseline.evidenceId,mondayAuditId:transactionUuid()};
  const derived=deriveUnifiedSnapshot(input,rows);
  sourceHealth.close={status:'success',reused:false,fetchedAt:a.fetchedAt,amountUsd:derived.sources.close};
  for(const key of ['msn','monday_affiliates']as const)sourceHealth[key].amountUsd=derived.sources[key];
  const fetchedAt=baseline.sourceHealth.msn.fetchedAt;
  const baselineAudit=await ctx.db.query('revenue_monday_audits').withIndex('by_audit',q=>q.eq('auditId',baseline.mondayAuditId!)).unique();
  if(!baselineAudit)throw Error('baseline_audit_unavailable');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rows))))).map(n=>n.toString(16).padStart(2,'0')).join('');
  for(let i=0;i<a.facts.length;i+=100)await ctx.db.insert('revenue_close_captures',{runId:input.collectorRunId,index:i/100,facts:a.facts.slice(i,i+100)});
  for(let i=0;i<rows.length;i+=100)await ctx.db.insert('revenue_monday_chunks',{auditId:input.mondayAuditId,index:i/100,rows:rows.slice(i,i+100) as Doc<'revenue_monday_chunks'>['rows']});
  await ctx.db.insert('revenue_monday_audits',{auditId:input.mondayAuditId,snapshotDate:date,fetchedAt,
    ruleVersion:baselineAudit.ruleVersion+':realtime-v1',digest,closeEvidenceCount:a.facts.length,impactEvidenceCount:baselineAudit.impactEvidenceCount??0,
    summary:summarizeMondayRows(rows,date),receivedAt:Date.now()});
  const published=s.mode==='live';
  const id=await ctx.db.insert('revenue_unified_runs',{...input,receivedAt:Date.now(),verified:true,published,issues:[],snapshot:derived,
    provenance:{kind:s.requested===s.processed?'calendar':'close',baselineRunId:baseline.collectorRunId,lastFullRefreshAt:baseline.collectorCompletedAt,closeRefreshedAt:a.fetchedAt}});
  if(published){
    const pointer=await ctx.db.query('revenue_publication').withIndex('by_key',q=>q.eq('key','active')).unique();
    if(!pointer)throw Error('publication_missing');
    await ctx.db.patch(pointer._id,{publishedRunId:id,latestAttemptId:id});
  }
  await ctx.db.patch(s._id,{processed:a.version,lease:undefined,leaseUntil:undefined,retryAt:undefined,error:undefined,failures:0,
    lastSuccessAt:Date.now(),publishedDate:date,...(!published?{shadowRunId:input.collectorRunId}:{})});
  if(s.requested>a.version)await scheduleRefresh(ctx,0);
  return {published,verified:true,runId:input.collectorRunId,totalYtdUsd:derived.totalYtdUsd,totalAllTimeUsd:derived.totalAllTimeUsd};
}});
export const failCloseRefresh=internalMutation({args:{lease:v.string(),rateLimited:v.boolean(),retryAfter:v.optional(v.number())},handler:async(ctx,a)=>{
  const s=await realtimeState(ctx);if(!s||s.lease!==a.lease)return;
  const delay=Math.max([60000,300000,900000][Math.min(s.failures,2)],Math.min(3600000,(a.retryAfter??0)*1000));
  await ctx.db.patch(s._id,{lease:undefined,leaseUntil:undefined,failures:s.failures+1,retryAt:Date.now()+delay,
    error:a.rateLimited?'Close rate limit reached.':'Close refresh failed; retaining last published values.'});
  await scheduleRefresh(ctx,delay);
}});
export const refreshCloseRealtime=internalAction({args:{},handler:async(ctx):Promise<unknown>=>{
  const claim=await ctx.runMutation(internal.revenue.claimCloseRefresh,{});if(!claim)return {skipped:true};
  try{
    const startedAt=new Date().toISOString();
    const facts=await fetchCloseFacts(process.env.CLOSE_API_KEY??'',fetch,claim.organizationId);
    return await ctx.runMutation(internal.revenue.finishCloseRefresh,{lease:claim.lease,version:claim.version,baselineId:claim.baselineId,facts,startedAt,fetchedAt:new Date().toISOString()});
  }catch(error){
    const e=error as Error&{retryAfter?:number};
    await ctx.runMutation(internal.revenue.failCloseRefresh,{lease:claim.lease,rateLimited:e.message==='Close rate limit reached.',...(e.retryAfter?{retryAfter:e.retryAfter}:{})});
    return {failed:true};
  }
}});
export const realtimeStatus=internalQuery({args:{},handler:async(ctx)=>{
  const s=await realtimeState(ctx);if(!s)return {mode:'off'};
  return {mode:s.mode,organizationId:s.organizationId,subscriptionId:s.subscriptionId,pending:s.requested>s.processed,failures:s.failures,error:s.error??null,lastEventAt:s.lastEventAt??null,
    lastSuccessAt:s.lastSuccessAt??null,shadowRunId:s.shadowRunId??null,baselineReady:Boolean(s.baselineId),
    requestedVersion:s.requested,processedVersion:s.processed,leaseUntil:s.leaseUntil??null,retryAt:s.retryAt??null,scheduled:Boolean(s.scheduled)};
}});
export const realtimeShadowReport=internalQuery({args:{},handler:async(ctx)=>{
  const s=await realtimeState(ctx);if(!s?.shadowRunId)return null;
  const run=await ctx.db.query('revenue_unified_runs').withIndex('by_run',q=>q.eq('collectorRunId',s.shadowRunId!)).unique();
  if(!run?.verified||!run.snapshot)return null;
  return {runId:run.collectorRunId,published:run.published,verified:run.verified,mondayAuditId:run.mondayAuditId,
    provenance:run.provenance,snapshot:run.snapshot,closeDays:run.closeDays,sourceHealth:run.sourceHealth};
}});
export const recoverCloseQueue=internalMutation({args:{},handler:async(ctx)=>{
  const s=await realtimeState(ctx);if(!s||s.mode==='off')return;
  if(s.scheduled){const job=await ctx.db.system.get(s.scheduled);if(job&&['pending','inProgress'].includes(job.state.kind))return;await ctx.db.patch(s._id,{scheduled:undefined});}
  if((s.leaseUntil??0)<=Date.now()&&(s.requested>s.processed||s.publishedDate!==chicagoDate()))await scheduleRefresh(ctx,Math.max(0,(s.retryAt??0)-Date.now()));
  // Bound webhook replay storage while preserving Close's full retry/event-log horizon.
  const old=await ctx.db.query('revenue_close_events').withIndex('by_received',q=>q.lt('receivedAt',Date.now()-35*86400000)).take(100);
  for(const row of old)await ctx.db.delete(row._id);
}});
