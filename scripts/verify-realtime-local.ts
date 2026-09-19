/** Real Convex staging test. Hard-pinned to loopback; never sends writes to production. */
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {ConvexHttpClient} from 'convex/browser';
import {internal} from '../convex/_generated/api';
import {reconcileMonday,deriveCloseDays} from '../convex/reconcileMonday';
import {canonical} from '../convex/realtimeRevenueModel';
import {deriveUnifiedSnapshot} from '../convex/unifiedRevenueMath';

async function main(){
  const config=JSON.parse(readFileSync('.convex/local/default/config.json','utf8'));
  assert.equal(config.ports.cloud,3281);
  // The admin-only SDK methods intentionally accept internal function refs.
  const client:any=new ConvexHttpClient('http://127.0.0.1:3281');
  (client as any).setAdminAuth(config.adminKey);
  const file='.convex/realtime-private-capture.json';
  if(process.argv.includes('--mini-capture')){
    const stagingDirectory=process.env.REVENUE_STAGING_DIR;
    assert.ok(stagingDirectory&&/^\/Users\/ari\/Services\/revenue-realtime-stage\.[a-zA-Z0-9]+$/.test(stagingDirectory),'Set REVENUE_STAGING_DIR to the isolated Mini staging directory');
    // Fresh read-only capture on the approved service identity; no credential
    // leaves the Mini and no collector state or production dataset is written.
    const capture=execFileSync('ssh',['-o','BatchMode=yes','mini',
      'cd '+stagingDirectory+' && PYTHONPATH=/Users/ari/.openclaw/workspace /Users/ari/Services/venvs/mission-control-revenue/bin/python -c '+
      "'import collect_all_revenue as c,json; p,a,s,ok=c.collect_payload(dry_run=True); assert ok; print(json.dumps({\"payload\":p,\"audit\":a}))'"],
      {encoding:'utf8',maxBuffer:32*1024*1024,timeout:300000,stdio:['ignore','pipe','inherit']});
    writeFileSync(file,capture,{mode:0o600});
  }
  const {payload,audit}=JSON.parse(readFileSync(file,'utf8'));
  const facts=audit.closeFacts,inputs=audit.reconciliationInputs;
  const start=performance.now();
  const rows=reconcileMonday(inputs.items,facts,inputs.creatorAliases,payload.snapshotDate);
  assert.equal(canonical(rows),canonical(audit.rows),'Python/TS exact live-input parity');
  assert.equal(canonical(deriveCloseDays(facts,payload.snapshotDate)),canonical(payload.closeDays));
  const expected=deriveUnifiedSnapshot(payload,rows);
  console.log(JSON.stringify({stage:'real-input-parity',rows:rows.length,opportunities:facts.length,milliseconds:Math.round(performance.now()-start),ytd:expected.totalYtdUsd,lifetime:expected.totalAllTimeUsd}));
  await client.mutation(internal.revenue.configureRealtime,{mode:'off',organizationId:'orga_staging',subscriptionId:'whsub_staging'});
  // These synthetic credentials belong only to this disposable loopback server.
  for(const [key,value]of [['ACTIVITY_LOG_SECRET','local-staging-only'],['CLOSE_WEBHOOK_SIGNATURE_KEY','ab'.repeat(32)]]){
    execFileSync('./node_modules/.bin/convex',['env','set',key,value],{stdio:'pipe'});
  }
  const body=JSON.stringify({subscription_id:'whsub_staging',event:{id:'ev_'+Date.now(),organization_id:'orga_staging',date_updated:new Date().toISOString(),object_type:'opportunity',action:'updated'}});
  const timestamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',Buffer.from('ab'.repeat(32),'hex')).update(timestamp+body).digest('hex');
  const send=(hash:string)=>fetch('http://127.0.0.1:3282/revenue/close-webhook',{method:'POST',headers:{'close-sig-hash':hash,'close-sig-timestamp':timestamp},body});
  assert.equal((await send('00')).status,401);
  assert.equal((await send(signature)).status,200);
  assert.equal((await (await send(signature)).json()).duplicate,true);
  assert.equal((await fetch('http://127.0.0.1:3282/revenue/realtime/status')).status,401);
  // Fresh local run identity makes staging repeatable without changing capture.
  payload.collectorRunId=crypto.randomUUID();payload.mondayAuditId=crypto.randomUUID();payload.evidenceId=payload.mondayAuditId;
  audit.auditId=payload.mondayAuditId;
  const now=new Date().toISOString();payload.collectorStartedAt=now;payload.collectorCompletedAt=now;audit.fetchedAt=now;
  for(const h of Object.values(payload.sourceHealth) as any[])h.fetchedAt=now;
  for(let i=0;i<rows.length;i+=100)await client.mutation(internal.mondayRevenue.recordChunkInternal,{auditId:audit.auditId,index:i/100,rows:rows.slice(i,i+100)});
  const {reconciliationInputs,closeFacts,...complete}=audit;delete complete.rows;
  await client.mutation(internal.mondayRevenue.completeAuditInternal,complete);
  for(const [kind,data]of [['monday',inputs.items],['close',facts]] as const){
    for(let i=0;i<data.length;i+=100)await client.mutation(internal.revenue.evidenceChunk,{auditId:audit.auditId,kind,index:i/100,items:kind==='monday'?data.slice(i,i+100):[],close:kind==='close'?data.slice(i,i+100):[]});
  }
  await client.mutation(internal.revenue.evidenceComplete,{auditId:audit.auditId,itemChunks:Math.ceil(rows.length/100),closeChunks:Math.ceil(facts.length/100),creatorAliases:inputs.creatorAliases});
  const seeded=await client.mutation(internal.revenue.recordUnifiedRunInternal,payload);assert.equal(seeded.published,true,JSON.stringify(seeded));
  await client.mutation(internal.revenue.configureRealtime,{mode:'shadow',organizationId:'orga_staging',subscriptionId:'whsub_staging'});
  const claim=await client.mutation(internal.revenue.claimCloseRefresh,{});assert.ok(claim);
  const result=await client.mutation(internal.revenue.finishCloseRefresh,{lease:claim.lease,version:claim.version,baselineId:claim.baselineId,facts,startedAt:now,fetchedAt:new Date().toISOString()});
  assert.equal(result.published,false);assert.equal(result.totalYtdUsd,expected.totalYtdUsd);assert.equal(result.totalAllTimeUsd,expected.totalAllTimeUsd);
  const before=await client.query(internal.revenue.allTimeRevenueInternal,{});assert.equal(before.snapshot!.datasetId,payload.collectorRunId);
  await client.mutation(internal.revenue.configureRealtime,{mode:'live',organizationId:'orga_staging',subscriptionId:'whsub_staging'});
  const liveClaim=await client.mutation(internal.revenue.claimCloseRefresh,{});assert.ok(liveClaim);
  const published=await client.mutation(internal.revenue.finishCloseRefresh,{lease:liveClaim.lease,version:liveClaim.version,baselineId:liveClaim.baselineId,facts,startedAt:now,fetchedAt:new Date().toISOString()});
  assert.equal(published.published,true);
  const after=await client.query(internal.revenue.allTimeRevenueInternal,{});
  const health=await client.query(internal.revenue.revenueHealthInternal,{});
  const response=await fetch('http://127.0.0.1:3282/revenue/smiirl');
  assert.equal(response.headers.get('X-Revenue-Dataset'),after.snapshot!.datasetId);
  assert.deepEqual(await response.json(),{number:Math.round(expected.totalYtdUsd)});
  assert.equal(health.datasetId,after.snapshot!.datasetId);
  assert.equal(after.snapshot!.sourceHealth.impact.fetchedAt,now);
  await client.mutation(internal.revenue.configureRealtime,{mode:'off',organizationId:'orga_staging',subscriptionId:'whsub_staging'});
  console.log(JSON.stringify({stage:'actual-local-convex',published:true,sharedDataset:true,shadowParity:true,sourceTimestampsPreserved:true,signedWebhookAndDedupe:true}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Staging verification failed');process.exitCode=1;});
