import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMondayRows } from '../convex/mondayRevenueMath';
import { recordChunkInternal, completeAuditInternal, auditInternal } from '../convex/mondayRevenue';
import { recordCollectionRunInternal, recordAllTimeRunInternal, allTimeRevenueInternal } from '../convex/revenue';

// Execute the production handlers against an isolated development database.
function database() {
  const tables: Record<string, any[]> = {};
  const indexes: Record<string,string[]> = {by_audit:['auditId'],by_audit_chunk:['auditId','index'],by_run:['collectorRunId'],by_run_id:['collectorRunId'],
    by_date:['snapshotDate'],by_verification_date:['verificationStatus','snapshotDate'],by_received_at:['receivedAt'],by_published_completed:['published','collectorCompletedAt']};
  return {tables, db:{
    async insert(table:string, doc:any) {const id=`${table}:${(tables[table]??=[]).length}`;tables[table].push(structuredClone({...doc,_id:id}));return id},
    async patch(id:string, doc:any) {const row=Object.values(tables).flat().find(r=>r._id===id);Object.assign(row,structuredClone(doc))},
    query(table:string) {
      const equal:Record<string,unknown>={};let index='', direction=1;
      const query={
        withIndex(name:string, callback?:any){index=name;const q={eq(k:string,v:unknown){equal[k]=v;return q}};callback?.(q);return query},
        order(order:string){direction=order==='desc'?-1:1;return query},
        async collect(){return (tables[table]??[]).filter(row=>Object.entries(equal).every(([k,v])=>row[k]===v)).slice().sort((a,b)=>{
          for(const key of indexes[index]??[]){if(a[key]<b[key])return -direction;if(a[key]>b[key])return direction}return 0
        }).map(row=>structuredClone(row))},
        async first(){return (await query.collect())[0]??null},async unique(){const rows=await query.collect();assert.ok(rows.length<=1);return rows[0]??null},
      };return query;
    },
  }};
}
const invoke = (fn:any, ctx:any, args:any) => fn._handler(ctx,args);
const row = (id='1', extra={}) => ({itemId:id,name:'Example x Creator',invoice:'A1',paymentDate:'2026-01-02',periodDate:'2025-12-31',grossCents:10000,
  basis:'gross',disposition:'included',reason:'supplemental_affiliate',references:[],updatedAt:'',state:'active',...extra});

test('Monday audit counts signed cents, receipt years, estimates, and excludes review rows',()=>{
  const summary=summarizeMondayRows([row(),row('2',{paymentDate:'2025-12-31',basis:'ca_net_20pct'}),row('3',{grossCents:-1000}),row('4',{disposition:'review'})],'2026-09-09');
  assert.equal(summary.totalAllTimeUsd,190);assert.equal(summary.totalYtdUsd,90);assert.equal(summary.estimatedAllTimeUsd,100);assert.equal(summary.reviewRows,1);
  assert.throws(()=>summarizeMondayRows([row(),row()],'2026-09-09'));
  assert.throws(()=>summarizeMondayRows([row('1',{paymentDate:'2026-02-30'})],'2026-09-09'));
});

test('staged audit is immutable, reconciles both totals, and permanently gates five-source regressions',async()=>{
  const ctx=database();const now=Date.now();const snapshotDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(now);
  const fetchedAt=new Date(now-2000).toISOString(), started=new Date(now-5000).toISOString(), completed=new Date(now).toISOString();
  const auditId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';const rows=[row('1',{paymentDate:snapshotDate})];
  const summary=summarizeMondayRows(rows,snapshotDate);
  const chunk={auditId,index:0,rows};await invoke(recordChunkInternal,ctx,chunk);await invoke(recordChunkInternal,ctx,chunk);
  await assert.rejects(invoke(recordChunkInternal,ctx,{...chunk,rows:[row('2')]}));
  const finish={auditId,snapshotDate,fetchedAt,ruleVersion:'test',digest:'a'.repeat(64),closeEvidenceCount:1,impactEvidenceCount:1,summary};
  assert.deepEqual(await invoke(completeAuditInternal,ctx,finish),{summary});
  assert.deepEqual(await invoke(completeAuditInternal,ctx,finish),{summary});
  await assert.rejects(invoke(recordChunkInternal,ctx,{auditId,index:1,rows:[row('2')]}));
  const sourceHealth=Object.fromEntries(['close','impact','redventures','adsbymoney','msn','monday_affiliates'].map(key=>[key,{status:'success',amountUsd:key==='monday_affiliates'?100:10,fetchedAt,reused:false}]));
  const args={snapshotDate,collectorRunId:'run1',collectorStartedAt:started,collectorCompletedAt:completed,sourceHealth,mondayAuditId:auditId};
  const ytd=await invoke(recordCollectionRunInternal,ctx,{...args,goalUsd:1000,closeLast30DayUsd:1});
  assert.equal(ytd.published,true);assert.equal(ytd.totalYtdUsd,150);
  const lifetime=await invoke(recordAllTimeRunInternal,ctx,args);assert.equal(lifetime.published,true);assert.equal(lifetime.totalAllTimeUsd,150);
  assert.deepEqual(await invoke(recordAllTimeRunInternal,ctx,args),lifetime);
  const legacy={...args,sourceHealth:{...sourceHealth}};delete legacy.sourceHealth.monday_affiliates;delete (legacy as any).mondayAuditId;
  const rejectedYtd=await invoke(recordCollectionRunInternal,ctx,{...legacy,collectorRunId:'run2',goalUsd:1000,closeLast30DayUsd:1});assert.equal(rejectedYtd.published,false);
  const rejectedLifetime=await invoke(recordAllTimeRunInternal,ctx,{...legacy,collectorRunId:'run2'});assert.equal(rejectedLifetime.published,false);
  assert.ok(rejectedLifetime.issues.includes('monday_affiliates_required'));
  const wrong={...args,collectorRunId:'run3',sourceHealth:{...sourceHealth,monday_affiliates:{...sourceHealth.monday_affiliates,amountUsd:200}}};
  assert.equal((await invoke(recordAllTimeRunInternal,ctx,wrong)).published,false);
  assert.equal(ctx.tables.revenue_snapshots[0].totalYtdUsd,150);
  const display=await invoke(allTimeRevenueInternal,ctx,{});assert.equal(display.snapshot.totalAllTimeUsd,150);assert.equal(display.snapshot.monday.auditId,auditId);
  const audit=await invoke(auditInternal,ctx,{auditId,page:0,disposition:'included'});assert.equal(audit.rows.length,1);
  assert.equal((await invoke(auditInternal,ctx,{auditId,page:0,disposition:'review'})).total,0);
});

test('incomplete audit upload cannot finalize',async()=>{
  const ctx=database(),auditId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  await invoke(recordChunkInternal,ctx,{auditId,index:1,rows:[row()]});
  await assert.rejects(invoke(completeAuditInternal,ctx,{auditId,snapshotDate:'2026-09-09',fetchedAt:new Date().toISOString(),ruleVersion:'test',digest:'b'.repeat(64),closeEvidenceCount:1,impactEvidenceCount:1,summary:summarizeMondayRows([row()],'2026-09-09')}));
});
