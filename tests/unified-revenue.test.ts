import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveUnifiedSnapshot, evaluateUnifiedAttempt, UNIFIED_SOURCES } from '../convex/unifiedRevenueMath';
import { recordUnifiedRunInternal, recordIngestionReceipt, unifiedReport, unifiedHealthReport } from '../convex/unifiedRevenue';
import { allTimeRevenueInternal, latestSnapshotInternal, revenueHealthInternal, recordCollectionRunInternal, recordAllTimeRunInternal } from '../convex/revenue';
import { summarizeMondayRows } from '../convex/mondayRevenueMath';

function fixture(offset=0) {
  const now=Date.now()+offset;
  const snapshotDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date(now));
  const year=snapshotDate.slice(0,4);
  const time=new Date(now).toISOString();
  const rows=[{itemId:'1',name:'Microsoft Start x Creator',invoice:'MSN1',paymentDate:year+'-01-01',periodDate:'',grossCents:12345,
    basis:'gross',disposition:'included',source:'msn',reason:'msn_paid_monday',references:[],updatedAt:time,state:'active'},
    {itemId:'2',name:'Other affiliate',invoice:'OTHER',paymentDate:year+'-01-01',periodDate:'',grossCents:10000,
    basis:'gross',disposition:'included',reason:'supplemental_affiliate',references:[],updatedAt:time,state:'active'},
    {itemId:'3',name:'Microsoft Start - Deficit',invoice:'MSN2',paymentDate:year+'-01-01',periodDate:'',grossCents:-45,
    basis:'gross',disposition:'included',source:'msn',reason:'msn_paid_monday',references:[],updatedAt:time,state:'active'}];
  const months=[];
  for (let y=2020;y<=Number(year);y++) for (let m=1;m<=12;m++) {
    const month=`${y}-${String(m).padStart(2,'0')}`;
    if (month<=snapshotDate.slice(0,7)) months.push({month,impactCents:100,redventuresCents:0,adsbymoneyCents:10});
  }
  const args={collectorRunId:crypto.randomUUID(),snapshotDate,collectorStartedAt:new Date(now-60000).toISOString(),collectorCompletedAt:time,
    mode:'publish' as 'publish'|'shadow',goalUsd:25_000_000,mondayAuditId:crypto.randomUUID(),
    closeDays:[{date:'2021-01-01',amountCents:10000},{date:snapshotDate,amountCents:20000}],platformMonths:months,
    sourceHealth:Object.fromEntries(UNIFIED_SOURCES.map(k=>[k,{status:'success',amountUsd:0,fetchedAt:time,reused:false}])) as any};
  const derived=deriveUnifiedSnapshot(args,rows);
  for(const source of UNIFIED_SOURCES) args.sourceHealth[source].amountUsd=derived.sources[source];
  return {args,rows,now};
}

function store() {
  const tables=new Map<string,any[]>();
  const table=(name:string)=>{if(!tables.has(name))tables.set(name,[]);return tables.get(name)!;};
  const db={
    query(name:string) {
      const filters:Array<[string,unknown]>=[];let fields:string[]=[];let descending=false;
      const query={
        withIndex(index:string,filter?:(q:any)=>void) {
          fields=index==='by_audit_chunk'?['auditId','index']:index==='by_received_at'?['receivedAt']:index==='by_started'?['startedAt']:[];
          const q={eq(k:string,v:unknown){filters.push([k,v]);return q;}};filter?.(q);return query;
        },
        order(order:string){descending=order==='desc';return query;},
        async collect(){return table(name).filter(r=>filters.every(([k,v])=>r[k]===v)).sort((a,b)=>{
          for(const k of fields)if(a[k]!==b[k])return (a[k]<b[k]?-1:1)*(descending?-1:1);return 0;
        });},
        async first(){return (await query.collect())[0]??null;},
        async unique(){const rows=await query.collect();assert.ok(rows.length<2);return rows[0]??null;},
      };return query;
    },
    async insert(name:string,row:any){const id=name+':'+table(name).length;table(name).push({...structuredClone(row),_id:id});return id;},
    async get(id:string){return table(id.split(':')[0]).find(r=>r._id===id)??null;},
    async patch(id:string,values:any){Object.assign(await db.get(id),structuredClone(values));},
  };
  const ctx={db} as any;
  async function seed(f:ReturnType<typeof fixture>) {
    await db.insert('revenue_monday_chunks',{auditId:f.args.mondayAuditId,index:0,rows:f.rows});
    await db.insert('revenue_monday_audits',{auditId:f.args.mondayAuditId,snapshotDate:f.args.snapshotDate,
      fetchedAt:f.args.collectorCompletedAt,ruleVersion:'2026-09-18.msn-paid:test',summary:summarizeMondayRows(f.rows,f.args.snapshotDate)});
  }
  return {ctx,table,seed};
}
const record=(recordUnifiedRunInternal as any)._handler;
const receipt=(recordIngestionReceipt as any)._handler;

test('rejected ingestion is durable and immediately unhealthy without replacing the verified number',async()=>{
  const dev=store(),good=fixture();await dev.seed(good);await record(dev.ctx,good.args);
  const failed={collectorRunId:crypto.randomUUID(),startedAt:Date.parse(good.args.collectorStartedAt)+100};
  await receipt(dev.ctx,{...failed,status:'processing'});
  await receipt(dev.ctx,{...failed,status:'rejected',code:'execution_limit',retryable:false});
  const report=await unifiedReport(dev.ctx);
  assert.equal(report!.snapshot.datasetId,good.args.collectorRunId);
  assert.equal(report!.healthy,false);assert.ok(report!.issues.includes('collection_upload_failed'));
  assert.equal(report!.collection!.code,'execution_limit');
  const next=fixture(1000);await dev.seed(next);await record(dev.ctx,next.args);
  assert.ok(!(await unifiedReport(dev.ctx))!.issues.includes('collection_upload_failed'));
});

test('receipt retries cannot downgrade an already committed successful run',async()=>{
  const dev=store(),good=fixture();await dev.seed(good);await record(dev.ctx,good.args);
  const identity={collectorRunId:good.args.collectorRunId,startedAt:Date.parse(good.args.collectorStartedAt)};
  await receipt(dev.ctx,{...identity,status:'rejected',code:'internal_error',retryable:false});
  assert.equal((await unifiedReport(dev.ctx))!.collection!.status,'verified');
  await assert.rejects(()=>receipt(dev.ctx,{...identity,startedAt:identity.startedAt+1,status:'processing'}),/Conflicting/);
});

test('manual collection cannot satisfy the scheduled noon reconciliation gate',async()=>{
  const original=Date.now;Date.now=()=>Date.parse('2026-09-22T19:00:00Z');
  try{
    const dev=store(),manual=fixture();await dev.seed(manual);await record(dev.ctx,manual.args);
    await receipt(dev.ctx,{collectorRunId:manual.args.collectorRunId,startedAt:Date.parse(manual.args.collectorStartedAt),status:'verified',origin:'manual'});
    assert.ok((await unifiedReport(dev.ctx))!.issues.includes('scheduled_update_missing'));
    const scheduled=fixture(1000);await dev.seed(scheduled);await record(dev.ctx,scheduled.args);
    await receipt(dev.ctx,{collectorRunId:scheduled.args.collectorRunId,startedAt:Date.parse(scheduled.args.collectorStartedAt),status:'verified',origin:'scheduled'});
    const report=await unifiedReport(dev.ctx);assert.ok(!report!.issues.includes('scheduled_update_missing'));
    assert.equal(report!.scheduledCollection!.collectorRunId,scheduled.args.collectorRunId);
  }finally{Date.now=original;}
});

test('abandoned upload becomes incomplete; an older rejected receipt cannot obscure a newer receipt',async()=>{
  const dev=store(),good=fixture();await dev.seed(good);await record(dev.ctx,good.args);
  await receipt(dev.ctx,{collectorRunId:crypto.randomUUID(),startedAt:Date.now(),status:'processing'});
  dev.table('revenue_ingestion_receipts')[0].updatedAt=Date.now()-900_001;
  assert.ok((await unifiedReport(dev.ctx))!.issues.includes('collection_upload_incomplete'));
  await receipt(dev.ctx,{collectorRunId:crypto.randomUUID(),startedAt:Date.now()-100_000,status:'rejected',code:'internal_error'});
  assert.equal((await unifiedReport(dev.ctx))!.collection!.status,'processing');
});

test('one canonical dataset: exact monthly/year/lifetime cents, MSN split, and Close 30 days',()=>{
  const f=fixture();const result=deriveUnifiedSnapshot(f.args,f.rows);
  assert.equal(result.sources.msn,123);assert.equal(result.sources.monday_affiliates,100);
  assert.equal(result.closeLast30DayUsd,200);assert.equal(result.sources.close,300);assert.equal(result.ytdSources.close,200);
  const year=f.args.snapshotDate.slice(0,4);
  const ytd=result.monthly.months.filter(r=>r.month.startsWith(year)).reduce((sum,r)=>sum+Object.values(r.sources).reduce((s,v)=>s+Math.round(v*100),0),0);
  assert.equal(ytd,Math.round(result.totalYtdUsd*100));assert.deepEqual(result.monthly.undatedSources,{});
});
test('missing, duplicate, future months and noninteger cents fail verification',()=>{
  for (const change of [(a:any)=>a.platformMonths.splice(1,1),(a:any)=>a.platformMonths.push(a.platformMonths[0]),
    (a:any)=>a.platformMonths[0].impactCents=1.1,(a:any)=>a.closeDays.push(a.closeDays[0]),
    (a:any)=>a.closeDays[0].date='2021-02-30',(a:any)=>a.sourceHealth.impact.amountUsd+=1]) {
    const f=fixture();change(f.args);assert.equal(evaluateUnifiedAttempt(f.args,f.rows,f.now).verified,false);
  }
});
test('every required source fails closed, including reused values and MSN ambiguity',()=>{
  for(const source of UNIFIED_SOURCES){const f=fixture();f.args.sourceHealth[source].status='failed';assert.equal(evaluateUnifiedAttempt(f.args,f.rows,f.now).verified,false);}
  const reused=fixture();reused.args.sourceHealth.close.reused=true;assert.equal(evaluateUnifiedAttempt(reused.args,reused.rows,reused.now).verified,false);
  const f=fixture();f.rows[0].disposition='review';assert.equal(evaluateUnifiedAttempt(f.args,f.rows,f.now).verified,false);
});
test('year boundary moves payments only by their payment date',()=>{
  const f=fixture();f.args.snapshotDate='2027-01-01';f.args.closeDays=[{date:'2026-12-31',amountCents:100},{date:'2027-01-01',amountCents:200}];
  for(let m=Number(f.args.platformMonths.at(-1)!.month.slice(5))+1;m<=12;m++)f.args.platformMonths.push({month:`2026-${String(m).padStart(2,'0')}`,impactCents:0,redventuresCents:0,adsbymoneyCents:0});
  f.args.platformMonths.push({month:'2027-01',impactCents:0,redventuresCents:0,adsbymoneyCents:0});
  f.rows[0].paymentDate='2026-12-31';f.rows[1].paymentDate='2027-01-01';f.rows[2].paymentDate='2026-12-31';
  const result=deriveUnifiedSnapshot(f.args,f.rows);assert.equal(result.ytdSources.msn,0);assert.equal(result.sources.msn,123);assert.equal(result.closeLast30DayUsd,3);
});
test('atomic pointer: all readers share one version; failed run keeps both last-good and unhealthy',async()=>{
  const dev=store();const good=fixture();await dev.seed(good);
  assert.equal((await record(dev.ctx,good.args)).published,true);
  const ytd=await (latestSnapshotInternal as any)._handler(dev.ctx,{});
  const all=await (allTimeRevenueInternal as any)._handler(dev.ctx,{});
  const health=await (revenueHealthInternal as any)._handler(dev.ctx,{});
  assert.equal(ytd.collectorRunId,all.snapshot.datasetId);assert.equal(health.datasetId,all.snapshot.datasetId);
  assert.equal(ytd.totalYtdUsd,all.snapshot.totalYtdUsd);assert.equal(health.healthy,all.healthy);
  const bad=fixture(1000);bad.args.sourceHealth.impact.status='failed';await dev.seed(bad);
  assert.equal((await record(dev.ctx,bad.args)).published,false);
  const failed=await unifiedReport(dev.ctx);assert.equal(failed!.healthy,false);assert.equal(failed!.snapshot.datasetId,good.args.collectorRunId);
  assert.equal((await unifiedHealthReport(dev.ctx))!.healthy,false);
  assert.equal(dev.table('revenue_snapshots').length,0);assert.equal(dev.table('revenue_all_time_runs').length,0);
  await assert.rejects(()=>(recordCollectionRunInternal as any)._handler(dev.ctx,{}),/unified/);
  await assert.rejects(()=>(recordAllTimeRunInternal as any)._handler(dev.ctx,{}),/unified/);
});
test('retries are idempotent, conflicting IDs rejected, and late older runs cannot replace newer failures',async()=>{
  const dev=store();const f=fixture();await dev.seed(f);await record(dev.ctx,f.args);await record(dev.ctx,f.args);
  assert.equal(dev.table('revenue_unified_runs').length,1);
  await assert.rejects(()=>record(dev.ctx,{...f.args,goalUsd:1}),/Conflicting/);
  const failure=fixture(3000);failure.args.sourceHealth.msn.status='failed';await dev.seed(failure);await record(dev.ctx,failure.args);
  const late=fixture(1000);await dev.seed(late);const result=await record(dev.ctx,late.args);
  assert.equal(result.published,false);assert.ok(result.issues.includes('out_of_order_run'));
  assert.equal((await unifiedReport(dev.ctx))!.lastAttempt.collectorRunId,failure.args.collectorRunId);
});
test('shadow verification cannot activate or alter the published dataset; missing/old-rule audit cannot publish',async()=>{
  const dev=store();const f=fixture();await dev.seed(f);f.args.mode='shadow';
  assert.equal((await record(dev.ctx,f.args)).verified,true);assert.equal(await unifiedReport(dev.ctx),null);
  const bad=fixture();await dev.seed(bad);dev.table('revenue_monday_audits')[1].ruleVersion='legacy-sheet';
  assert.equal((await record(dev.ctx,bad.args)).published,false);assert.equal(await unifiedReport(dev.ctx),null);
});

test('an invalid future clock cannot lock out subsequent valid runs',async()=>{
  const dev=store();const first=fixture();await dev.seed(first);await record(dev.ctx,first.args);
  const future=fixture(86_400_000);await dev.seed(future);
  assert.equal((await record(dev.ctx,future.args)).published,false);
  const next=fixture(1000);await dev.seed(next);
  assert.equal((await record(dev.ctx,next.args)).published,true);
  assert.equal((await unifiedReport(dev.ctx))!.snapshot.datasetId,next.args.collectorRunId);
});
