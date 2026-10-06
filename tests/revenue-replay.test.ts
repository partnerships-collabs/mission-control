import test from 'node:test';
import assert from 'node:assert/strict';
import {replayCloseEvent} from '../convex/revenueReplay';
import {verifyCloseWebhookSignature} from '../convex/httpSecurity';

const state={mode:'live',organizationId:'orga_test',subscriptionId:'whsub_test',pending:false,error:null};
const env={closeKey:'synthetic-close',signingKey:'ab'.repeat(32),siteUrl:'https://example.convex.site'};
const body={operation:'replay_event',eventId:'ev_test'};
const event={id:'ev_test',organization_id:'orga_test',object_type:'opportunity',action:'updated',date_updated:new Date().toISOString(),data:{value:123}};

test('genuine server-fetched event passes real signature verification; duplicate adds no work',async()=>{
  let requests=0,enqueues=0;
  const mock:typeof fetch=async(url,options)=>{
    requests++;
    if(String(url).startsWith('https://api.close.com/'))return Response.json(event);
    assert.equal(String(url),env.siteUrl+'/revenue/close-webhook');
    assert.equal(options!.redirect,'error');
    const req=new Request(url,options),raw=await req.text();
    assert.deepEqual(JSON.parse(raw),{subscription_id:state.subscriptionId,event});
    if(!await verifyCloseWebhookSignature(req,raw,env.signingKey))return new Response('',{status:401});
    return Response.json(enqueues++===0?{queued:true}:{duplicate:true});
  };
  const result=await replayCloseEvent(body,state,env,mock);
  assert.equal(result.queued,true);assert.equal(result.duplicateDeduplicated,true);assert.equal(requests,4);
  assert.ok(!JSON.stringify(result).includes(env.signingKey));assert.ok(!JSON.stringify(result).includes('data'));
});
test('rejects caller payloads/destinations, unavailable config and busy/off queue before network',async()=>{
  const mock:typeof fetch=async()=>{throw Error('network must not be called');};
  for(const input of [{...body,event},{...body,url:'https://other.test'}, {...body,eventId:'../event'}])
    await assert.rejects(replayCloseEvent(input,state,env,mock),/invalid_replay/);
  for(const patch of [{mode:'off'},{pending:true},{error:'failed'}])
    await assert.rejects(replayCloseEvent(body,{...state,...patch},env,mock),/replay_not_ready/);
  await assert.rejects(replayCloseEvent(body,state,{...env,signingKey:''},mock),/replay_configuration/);
});
test('wrong-organization/fabricated events and Close errors never reach webhook',async()=>{
  for(const bad of [{...event,organization_id:'orga_wrong'},{...event,id:'ev_other'},{...event,date_updated:'invalid'}]){
    let count=0;const mock:typeof fetch=async()=>{count++;return Response.json(bad);};
    await assert.rejects(replayCloseEvent(body,state,env,mock),/replay_event_invalid/);assert.equal(count,1);
  }
  for(const status of [401,404,429,504])await assert.rejects(replayCloseEvent(body,state,env,async()=>new Response('',{status})),/replay_event_unavailable/);
});
test('already accepted event is harmless; delivery/signature/deduplication failures are explicit',async()=>{
  const mock=(results:Response[]):typeof fetch=>async()=>results.shift()!;
  const success=await replayCloseEvent(body,state,env,mock([Response.json(event),new Response('',{status:401}),Response.json({duplicate:true}),Response.json({duplicate:true})]));
  assert.equal(success.queued,false);assert.equal(success.alreadyAccepted,true);
  await assert.rejects(replayCloseEvent(body,state,env,mock([Response.json(event),Response.json({})])),/signature_check/);
  await assert.rejects(replayCloseEvent(body,state,env,mock([Response.json(event),new Response('',{status:401}),new Response('',{status:503})])),/delivery_failed/);
  await assert.rejects(replayCloseEvent(body,state,env,mock([Response.json(event),new Response('',{status:401}),Response.json({queued:true}),Response.json({queued:true})])),/dedupe_failed/);
});
