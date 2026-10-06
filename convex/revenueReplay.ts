// Operator-only verification. Never accepts event contents or a destination.
// The existing Close key and signing key stay inside the deployed backend.
export async function replayCloseEvent(
  body: unknown,
  state: {mode:string;organizationId?:string;subscriptionId?:string;pending?:boolean;error?:string|null},
  env: {closeKey?:string;signingKey?:string;siteUrl?:string},
  request: typeof fetch = fetch,
) {
  const input=body as Record<string,unknown>;
  if(!input||input.operation!=='replay_event'||typeof input.eventId!=='string'
    ||!/^ev_[a-zA-Z0-9]+$/.test(input.eventId)||Object.keys(input).some(k=>!['operation','eventId'].includes(k)))throw Error('invalid_replay');
  if(!['shadow','live'].includes(state.mode)||state.pending||state.error||!state.organizationId||!state.subscriptionId)throw Error('replay_not_ready');
  if(!env.closeKey||!env.signingKey||!/^[a-fA-F0-9]{64}$/.test(env.signingKey)||!env.siteUrl)throw Error('replay_configuration');
  const site=new URL(env.siteUrl);
  if(site.username||site.password||site.pathname!=='/'||site.search||site.hash
    ||!(site.protocol==='https:'||(site.protocol==='http:'&&['localhost','127.0.0.1'].includes(site.hostname))))throw Error('replay_configuration');
  const response=await request(`https://api.close.com/api/v1/event/${input.eventId}/`,{
    headers:{Authorization:`Basic ${btoa(env.closeKey+':')}`},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('replay_event_unavailable');
  const event=await response.json();
  if(event.id!==input.eventId||event.organization_id!==state.organizationId
    ||!['opportunity','lead'].includes(event.object_type)||!['created','updated','deleted','merged'].includes(event.action)
    ||!Number.isFinite(Date.parse(event.date_updated??event.date_created)))throw Error('replay_event_invalid');
  const payload=JSON.stringify({subscription_id:state.subscriptionId,event});
  const timestamp=String(Math.floor(Date.now()/1000));
  const keyBytes=new Uint8Array(env.signingKey.match(/../g)!.map(byte=>parseInt(byte,16)));
  const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+payload))))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  const deliver=(hash:string)=>request(new URL('/revenue/close-webhook',site),{method:'POST',body:payload,redirect:'error',
    headers:{'Content-Type':'application/json','close-sig-timestamp':timestamp,'close-sig-hash':hash},signal:AbortSignal.timeout(15000)});
  if((await deliver('00')).status!==401)throw Error('replay_signature_check_failed');
  const receivedAfter=Date.now();
  const first=await deliver(signature);
  if(!first.ok)throw Error('replay_delivery_failed');
  const accepted=await first.json();
  if(accepted.queued!==true&&accepted.duplicate!==true)throw Error('replay_not_accepted');
  const second=await deliver(signature);
  if(!second.ok||(await second.json()).duplicate!==true)throw Error('replay_dedupe_failed');
  return {eventId:input.eventId,receivedAfter,queued:accepted.queued===true,alreadyAccepted:accepted.duplicate===true,
    invalidSignatureDenied:true,duplicateDeduplicated:true};
}
