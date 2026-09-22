import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {reconcileMonday,deriveCloseDays,assertOverrideEvidenceStable} from '../convex/reconcileMonday';
import {chicagoDate,canonical} from '../convex/realtimeRevenueModel';
import {configureRealtime,enqueueCloseEvent,claimCloseRefresh,finishCloseRefresh,failCloseRefresh,recoverCloseQueue,fetchCloseFacts} from '../convex/realtimeRevenue';
import {evidenceChunk,evidenceComplete} from '../convex/revenueEvidence';
import {recordUnifiedRunInternal,recordIngestionReceipt,unifiedReport,unifiedHealthReport} from '../convex/unifiedRevenue';
import {deriveUnifiedSnapshot,UNIFIED_SOURCES} from '../convex/unifiedRevenueMath';
import {summarizeMondayRows} from '../convex/mondayRevenueMath';

const call=(fn:any,ctx:any,args:any={})=>fn._handler(ctx,args);
const fact=(values:any={})=>({id:'oppo_one',date_won:chicagoDate(),value:10000,value_currency:'USD',value_period:'one_time',lead_name:'Snap',note:'Snap x Creator',creators:[],...values});
const item=(values:any={})=>({itemId:'1',name:'MSN x Creator',invoice:'1',paymentDate:chicagoDate(),periodDate:'',grossCents:10000,basis:'gross',updatedAt:'',state:'active',paid:true,impactLabel:false,impactRefs:[],closeNotes:'',supplemental:false,...values});
const identity={organizationId:'orga_test',subscriptionId:'whsub_test'};
const event=(values:any={})=>({...identity,eventId:'ev_test',revision:new Date().toISOString(),objectType:'opportunity',action:'updated',...values});

test('override evidence preparation is linear rather than repeated per Monday exception',()=>{
  let reads=0;
  const facts=Array.from({length:1500},(_,i)=>{
    const row=fact({id:'oppo_'+i});
    Object.defineProperty(row,'lead_name',{enumerable:true,get(){reads++;return 'Snap';}});
    return row;
  });
  const items=Array.from({length:250},(_,i)=>item({itemId:String(i),name:'Snap x Creator',override:{matches:true,
    disposition:'included',references:['reviewed:'+i]}}));
  assertOverrideEvidenceStable(items,facts,facts);
  assert.ok(reads<=facts.length*6,'each fact is normalized/canonicalized only once per capture');
  assert.throws(()=>assertOverrideEvidenceStable(items,[...facts,fact({id:'new'})],facts),/requires_review/);
  assert.doesNotThrow(()=>assertOverrideEvidenceStable(items,[...facts,fact({id:'unrelated',lead_name:'Other',note:'Other'})],facts));
});

test('a fresh Close publication cannot hide a failed daily upload receipt',async()=>{
  const dev=store();await dev.initialize();await call(configureRealtime,dev.ctx,{...identity,mode:'live'});await dev.refresh();
  await call(recordIngestionReceipt,dev.ctx,{collectorRunId:crypto.randomUUID(),startedAt:Date.now(),status:'rejected',code:'execution_limit',origin:'scheduled'});
  await call(enqueueCloseEvent,dev.ctx,event({eventId:'ev_later'}));await dev.refresh();
  const report=await unifiedReport(dev.ctx);
  assert.ok(report!.issues.includes('collection_upload_failed'));
  assert.equal(report!.snapshot.refresh!.allSourcesCurrent,false);
});

// Isolated transactional handler harness: no live deployment or credentials.
function store(){
  const tables=new Map<string,any[]>();let serial=0;
  const table=(name:string)=>{if(!tables.has(name))tables.set(name,[]);return tables.get(name)!;};
  const db:any={
    query(name:string){const filters:Array<(r:any)=>boolean>=[];const q:any={
      withIndex(_index:string,apply?:(q:any)=>void){const range:any={eq(k:string,v:any){filters.push(r=>r[k]===v);return range;},lt(k:string,v:any){filters.push(r=>r[k]<v);return range;}};apply?.(range);return q;},
      async collect(){return table(name).filter(r=>filters.every(f=>f(r)));},
      order(){return q;},async first(){return (await q.collect())[0]??null;},
      async unique(){const rows=await q.collect();assert.ok(rows.length<=1);return rows[0]??null;},
      async take(n:number){return (await q.collect()).slice(0,n);}};return q;},
    async insert(name:string,row:any){const id=name+':'+(++serial);table(name).push({...structuredClone(row),_id:id});return id;},
    async get(id:string){return table(id.split(':')[0]).find(r=>r._id===id)??null;},
    async patch(id:string,values:any){Object.assign(await db.get(id),structuredClone(values));},
    async delete(id:string){const rows=table(id.split(':')[0]);rows.splice(rows.findIndex(r=>r._id===id),1);},
  };db.system={get:db.get};
  const scheduler={async runAfter(delay:number,_fn:any,args:any){return db.insert('_scheduled_functions',{delay,args,state:{kind:'pending'}});},async cancel(id:string){await db.patch(id,{state:{kind:'canceled'}});}};
  const ctx={db,scheduler};
  const state=()=>table('revenue_realtime')[0];
  async function seed(offset=0){
    const time=new Date(Date.now()+offset).toISOString(),date=chicagoDate(),facts=[fact()],items=[item()];
    const rows=reconcileMonday(items,facts,{},date),auditId=crypto.randomUUID();
    await call(evidenceChunk,ctx,{auditId,kind:'monday',index:0,items,close:[]});
    await call(evidenceChunk,ctx,{auditId,kind:'close',index:0,items:[],close:facts});
    await call(evidenceComplete,ctx,{auditId,itemChunks:1,closeChunks:1,creatorAliases:{}});
    await db.insert('revenue_monday_chunks',{auditId,index:0,rows});
    await db.insert('revenue_monday_audits',{auditId,snapshotDate:date,fetchedAt:time,ruleVersion:'2026-09-18.msn-paid:test',summary:summarizeMondayRows(rows,date)});
    const platformMonths=[];
    for(let y=2020;y<=Number(date.slice(0,4));y++)for(let m=1;m<=12;m++){const month=`${y}-${String(m).padStart(2,'0')}`;if(month<=date.slice(0,7))platformMonths.push({month,impactCents:100,redventuresCents:1,adsbymoneyCents:2});}
    const args={collectorRunId:crypto.randomUUID(),snapshotDate:date,collectorStartedAt:time,collectorCompletedAt:time,mode:'publish',goalUsd:25000000,mondayAuditId:auditId,evidenceId:auditId,closeDays:deriveCloseDays(facts,date),platformMonths,
      sourceHealth:Object.fromEntries(UNIFIED_SOURCES.map(k=>[k,{status:'success',amountUsd:0,reused:false,fetchedAt:time}])) as any};
    const derived=deriveUnifiedSnapshot(args,rows);for(const k of UNIFIED_SOURCES)args.sourceHealth[k].amountUsd=derived.sources[k];
    return args;
  }
  async function refresh(facts=[fact()]){const claim=await call(claimCloseRefresh,ctx);assert.ok(claim);return call(finishCloseRefresh,ctx,{lease:claim.lease,version:claim.version,baselineId:claim.baselineId,facts,startedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()});}
  async function initialize(){await call(configureRealtime,ctx,{...identity,mode:'shadow'});const args=await seed();assert.equal((await call(recordUnifiedRunInternal,ctx,args)).published,true);await refresh();return args;}
  return {ctx,db,table,state,seed,refresh,initialize};
}

test('Python/TypeScript parity for captured policy, dates, networks, aliases, duplicate lines and overrides',()=>{
  const fixtures=JSON.parse(execFileSync('python3',['scripts/realtime_parity_fixtures.py'],{encoding:'utf8'}));
  for(const f of fixtures)assert.deepEqual(reconcileMonday(f.items,f.facts,f.creatorAliases,f.date),f.expected);
  assert.ok(fixtures.length>=25);
});
test('wins, edits, reopen/delete, backdating, date boundaries and invalid Close facts',()=>{
  const d='2026-09-19';
  assert.deepEqual(deriveCloseDays([fact({date_won:d,value:23456})],d),[{date:d,amountCents:23456}]);
  assert.deepEqual(deriveCloseDays([],d),[{date:d,amountCents:0}]);
  assert.deepEqual(deriveCloseDays([fact({date_won:'2025-12-31'})],d),[{date:'2025-12-31',amountCents:10000}]);
  for(const values of [{value:-1},{value:1.1},{value_currency:'EUR'},{value_period:'monthly'},{date_won:'2026-02-30'}])assert.throws(()=>deriveCloseDays([fact({...values,date_won:values.date_won??d})],d));
  assert.equal(chicagoDate(Date.parse('2027-01-01T05:59:59Z')),'2026-12-31');
  assert.equal(chicagoDate(Date.parse('2027-01-01T06:00:00Z')),'2027-01-01');
  assert.equal(chicagoDate(Date.parse('2026-07-01T05:00:00Z')),'2026-07-01');
});
test('Monday exclusions change with Close; reviewed overrides cannot silently cover new facts',()=>{
  const row=item({name:'Snap x Creator',supplemental:true,closeNotes:'oppo_one'});
  assert.equal(reconcileMonday([row],[],{},chicagoDate())[0].disposition,'included');
  assert.equal(reconcileMonday([row],[fact()],{},chicagoDate())[0].disposition,'covered');
  const reviewed={...row,override:{matches:true,disposition:'included',references:['reviewed invoice']}};
  assertOverrideEvidenceStable([reviewed],[fact()],[fact()]);
  assert.throws(()=>assertOverrideEvidenceStable([reviewed],[fact()],[]),/requires_review/);
  assert.throws(()=>assertOverrideEvidenceStable([reviewed],[fact({value:20000})],[fact()]),/requires_review/);
});
test('durable dedupe by event/revision, out-of-order events, identity checks and 10-second batching',async()=>{
  const s=store();await call(configureRealtime,s.ctx,{...identity,mode:'off'});
  const e=event();assert.deepEqual(await call(enqueueCloseEvent,s.ctx,e),{queued:true});
  assert.deepEqual(await call(enqueueCloseEvent,s.ctx,e),{duplicate:true});
  await call(enqueueCloseEvent,s.ctx,{...e,revision:'2026-01-01T00:00:00Z'});
  assert.equal(s.table('revenue_close_events').length,2);
  await assert.rejects(()=>call(enqueueCloseEvent,s.ctx,{...e,organizationId:'orga_wrong'}),/identity/);
  await s.db.patch(s.state()._id,{mode:'shadow'});
  await call(enqueueCloseEvent,s.ctx,event({eventId:'ev_next'}));
  assert.equal(s.table('_scheduled_functions').at(-1).delay,10000);
  await call(enqueueCloseEvent,s.ctx,event({eventId:'ev_last'}));
  assert.equal(s.table('_scheduled_functions').length,1);
});
test('shadow never changes display; activation requires fresh matching shadow and performs catchup',async()=>{
  const s=store();const baseline=await s.initialize();
  assert.equal((await unifiedReport(s.ctx))!.snapshot.datasetId,baseline.collectorRunId);
  await assert.rejects(()=>call(configureRealtime,s.ctx,{...identity,subscriptionId:'whsub_changed',mode:'live'}),/shadow/);
  await call(configureRealtime,s.ctx,{...identity,mode:'live'});const r=await s.refresh([fact({value:20000})]);
  const report=await unifiedReport(s.ctx);assert.equal(report!.snapshot.datasetId,r.runId);assert.equal(report!.snapshot.sources.close,200);
  assert.equal(report!.snapshot.sourceHealth.impact.fetchedAt,baseline.sourceHealth.impact.fetchedAt);
  assert.equal(report!.snapshot.sourceHealth.impact.reused,true);assert.equal(report!.snapshot.sourceHealth.impact.freshness,'fresh');
  assert.equal((await unifiedHealthReport(s.ctx))!.datasetId,r.runId);
  assert.equal(s.table('revenue_close_captures').at(-1).facts[0].value,20000);
});
test('one worker, events during refresh trigger next pass, retries and stuck-job recovery',async()=>{
  const s=store();await s.initialize();await call(configureRealtime,s.ctx,{...identity,mode:'live'});
  const claim=await call(claimCloseRefresh,s.ctx);assert.equal(await call(claimCloseRefresh,s.ctx),null);
  await call(enqueueCloseEvent,s.ctx,event());
  await call(finishCloseRefresh,s.ctx,{...claim,facts:[fact()],startedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()});
  assert.ok(s.state().requested>s.state().processed);assert.ok(s.state().scheduled);
  const next=await call(claimCloseRefresh,s.ctx);
  await call(failCloseRefresh,s.ctx,{lease:next.lease,rateLimited:true,retryAfter:180});
  assert.ok(s.state().retryAt>=Date.now()+179000);assert.equal(s.state().failures,1);
  const job=s.state().scheduled;await s.db.patch(job,{state:{kind:'failed'}});
  await call(recoverCloseQueue,s.ctx);assert.notEqual(s.state().scheduled,job);
});
test('slow daily publication stages baseline; concurrent worker cannot overwrite it with mixed versions',async()=>{
  const s=store();await s.initialize();await call(configureRealtime,s.ctx,{...identity,mode:'live'});
  const claim=await call(claimCloseRefresh,s.ctx),before=(await unifiedReport(s.ctx))!.snapshot.datasetId;
  const daily=await s.seed(1000);const staged=await call(recordUnifiedRunInternal,s.ctx,daily);assert.equal(staged.queued,true);assert.equal(staged.published,false);
  const old=await call(finishCloseRefresh,s.ctx,{...claim,facts:[fact()],startedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()});
  assert.equal(old.superseded,true);assert.equal((await unifiedReport(s.ctx))!.snapshot.datasetId,before);
  await s.refresh([fact({value:33333})]);assert.equal((await unifiedReport(s.ctx))!.snapshot.sources.close,333.33);
});
test('failed daily affiliate capture does not stop Close or refresh old affiliate timestamps',async()=>{
  const s=store();const baseline=await s.initialize();await call(configureRealtime,s.ctx,{...identity,mode:'live'});await s.refresh();
  const failed=await s.seed(1000);failed.sourceHealth.impact.status='failed';assert.equal((await call(recordUnifiedRunInternal,s.ctx,failed)).published,false);
  await call(enqueueCloseEvent,s.ctx,event());await s.refresh([fact({value:44444})]);
  const report=await unifiedReport(s.ctx);assert.equal(report!.snapshot.sources.close,444.44);assert.equal(report!.healthy,false);
  assert.equal(report!.snapshot.refresh!.allSourcesCurrent,false);assert.equal(report!.snapshot.sourceHealth.impact.lastDailyStatus,'failed');
  assert.equal(report!.snapshot.sourceHealth.impact.fetchedAt,baseline.sourceHealth.impact.fetchedAt);
});
test('evidence is immutable, key-order independent, sealed, and empty Close capture is supported',async()=>{
  const s=store(),auditId=crypto.randomUUID();const a={auditId,kind:'monday',index:0,items:[item()],close:[]};
  await call(evidenceChunk,s.ctx,a);await call(evidenceChunk,s.ctx,JSON.parse(canonical(a)));
  await assert.rejects(()=>call(evidenceChunk,s.ctx,{...a,items:[item({grossCents:1})]}),/conflicting/);
  await call(evidenceComplete,s.ctx,{auditId,itemChunks:1,closeChunks:0,creatorAliases:{}});
  await assert.rejects(()=>call(evidenceChunk,s.ctx,{...a,index:1}),/sealed/);
});
test('Close pagination fetches current data, rejects partial/corrupt replies and preserves Retry-After',async()=>{
  let page=0;
  const data=await fetchCloseFacts('test',async(url:any)=>{assert.equal(new URL(url).searchParams.get('status_type'),'won');return new Response(JSON.stringify({data:[fact({id:'oppo_'+page++})],has_more:page<2}));});
  assert.equal(data.length,2);
  await assert.rejects(()=>fetchCloseFacts('test',async()=>new Response('{}',{status:429,headers:{'Retry-After':'180'}})),(e:any)=>e.retryAfter===180);
  await assert.rejects(()=>fetchCloseFacts('test',async()=>new Response(JSON.stringify({data:[],has_more:true}))),/Incomplete/);
  assert.deepEqual(await fetchCloseFacts('test',async()=>new Response(JSON.stringify({data:[],has_more:false}))),[]);
});
test('invalid Close capture and expired lease preserve the publication; recovery replaces abandoned worker',async()=>{
  const s=store();await s.initialize();await call(configureRealtime,s.ctx,{...identity,mode:'live'});
  const claim=await call(claimCloseRefresh,s.ctx),before=(await unifiedReport(s.ctx))!.snapshot.datasetId;
  const args={lease:claim.lease,version:claim.version,baselineId:claim.baselineId,facts:[fact({value_currency:'EUR'})],startedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()};
  await assert.rejects(()=>call(finishCloseRefresh,s.ctx,args),/invalid_close/);
  assert.equal((await unifiedReport(s.ctx))!.snapshot.datasetId,before);
  await s.db.patch(s.state()._id,{leaseUntil:Date.now()-1});
  assert.equal((await call(finishCloseRefresh,s.ctx,{...args,facts:[fact()]})).discarded,true);
  await call(recoverCloseQueue,s.ctx);assert.ok(s.state().scheduled);
  const next=await call(claimCloseRefresh,s.ctx);assert.notEqual(next.lease,claim.lease);
});
test('midnight Central rolls YTD and appends a month without freshly dating affiliate history',async(t)=>{
  const s=store();const base=await s.initialize();await call(configureRealtime,s.ctx,{...identity,mode:'live'});await s.refresh();
  const oldDate=base.snapshotDate,nextYear=Number(oldDate.slice(0,4))+1;
  t.mock.method(Date,'now',()=>Date.parse(`${nextYear}-01-01T06:00:01Z`));
  await call(recoverCloseQueue,s.ctx);assert.ok(s.state().scheduled);
  const claim=await call(claimCloseRefresh,s.ctx);assert.ok(claim);
  const now=new Date(Date.now()).toISOString();
  await call(finishCloseRefresh,s.ctx,{lease:claim.lease,version:claim.version,baselineId:claim.baselineId,facts:[fact({date_won:oldDate})],startedAt:now,fetchedAt:now});
  const r=await unifiedReport(s.ctx);assert.equal(r!.snapshot.totalYtdUsd,0);assert.equal(r!.snapshot.sources.close,100);
  assert.equal(r!.snapshot.monthly.months.at(-1)!.month,`${nextYear}-01`);assert.equal(r!.snapshot.refresh!.kind,'calendar');
  assert.equal(r!.snapshot.sourceHealth.impact.fetchedAt,base.sourceHealth.impact.fetchedAt);assert.equal(r!.healthy,false);
});
