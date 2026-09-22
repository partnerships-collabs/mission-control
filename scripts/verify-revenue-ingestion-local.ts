/** Disposable loopback database only. Capture/config are private, never committed. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {ConvexHttpClient} from 'convex/browser';
import {internal} from '../convex/_generated/api';
import {chicagoDate} from '../convex/realtimeRevenueModel';

async function main(){
  const config=JSON.parse(readFileSync(process.env.REVENUE_TEST_CONFIG!,'utf8'));
  assert.equal(config.ports.cloud,3281);assert.equal(config.ports.site,3282);
  const client:any=new ConvexHttpClient('http://127.0.0.1:3281');client.setAdminAuth(config.adminKey);
  await client.mutation(internal.revenue.configureRealtime,{mode:'off',organizationId:'orga_staging',subscriptionId:'whsub_staging'});
  const headers={'Content-Type':'application/json','x-activity-secret':'local-staging-only'};
  const post=(payload:any,authenticated=true)=>fetch('http://127.0.0.1:3282/revenue/unified/collection-run',{
    method:'POST',headers:authenticated?headers:{},body:JSON.stringify(payload)});
  let latest:any;
  for(let pass=0;pass<2;pass++){
    const {payload,audit}=JSON.parse(readFileSync(process.env.REVENUE_TEST_CAPTURE!,'utf8'));
    const time=new Date().toISOString();payload.collectorRunId=crypto.randomUUID();
    payload.mondayAuditId=crypto.randomUUID();payload.evidenceId=payload.mondayAuditId;payload.mode='publish';
    payload.snapshotDate=chicagoDate();payload.collectorStartedAt=time;payload.collectorCompletedAt=time;
    for(const h of Object.values(payload.sourceHealth)as any[])h.fetchedAt=time;
    audit.auditId=payload.mondayAuditId;audit.snapshotDate=payload.snapshotDate;audit.fetchedAt=time;
    const {rows,reconciliationInputs,closeFacts,...manifest}=audit;
    for(let i=0;i<rows.length;i+=100)await client.mutation(internal.mondayRevenue.recordChunkInternal,{auditId:audit.auditId,index:i/100,rows:rows.slice(i,i+100)});
    await client.mutation(internal.mondayRevenue.completeAuditInternal,manifest);
    for(const [kind,data]of [['monday',reconciliationInputs.items],['close',closeFacts]]as const)
      for(let i=0;i<data.length;i+=100)await client.mutation(internal.revenue.evidenceChunk,{auditId:audit.auditId,kind,index:i/100,
        items:kind==='monday'?data.slice(i,i+100):[],close:kind==='close'?data.slice(i,i+100):[]});
    await client.mutation(internal.revenue.evidenceComplete,{auditId:audit.auditId,itemChunks:Math.ceil(rows.length/100),
      closeChunks:Math.ceil(closeFacts.length/100),creatorAliases:reconciliationInputs.creatorAliases});
    const response=await post(payload);assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.published,true,JSON.stringify(result));
    assert.deepEqual(await(await post(payload)).json(),result);
    latest=payload;console.log(JSON.stringify({pass:pass+1,published:true,rows:rows.length,closeFacts:closeFacts.length}));
  }
  const before=await client.query(internal.revenue.allTimeRevenueInternal,{});
  const bad={...latest,collectorRunId:crypto.randomUUID(),collectorStartedAt:new Date().toISOString(),goalUsd:'PRIVATE_INVALID_INPUT'};
  assert.equal((await post(bad,false)).status,401);
  assert.equal((await client.query(internal.revenue.allTimeRevenueInternal,{})).collection.collectorRunId,latest.collectorRunId);
  const failed=await post(bad);assert.equal(failed.status,422);
  const detail=await failed.json();assert.equal(detail.code,'argument_validation');
  assert.ok(!JSON.stringify(detail).includes('PRIVATE_INVALID_INPUT'));
  const after=await client.query(internal.revenue.allTimeRevenueInternal,{});
  assert.equal(after.healthy,false);assert.ok(after.issues.includes('collection_upload_failed'));
  assert.equal(after.snapshot.datasetId,before.snapshot.datasetId);
  assert.equal(after.collection.collectorRunId,bad.collectorRunId);
  const publicResponse=await fetch('http://127.0.0.1:3282/revenue/smiirl');
  assert.equal(publicResponse.headers.get('X-Revenue-Dataset'),before.snapshot.datasetId);
  assert.deepEqual(await publicResponse.json(),{number:Math.round(before.snapshot.totalYtdUsd)});
  console.log(JSON.stringify({durableFailure:true,unchangedVerifiedDataset:true,publicContract:true,unauthorizedCannotPoisonHealth:true}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Local verification failed');process.exitCode=1;});
