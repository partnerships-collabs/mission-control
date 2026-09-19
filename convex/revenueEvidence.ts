import {internalMutation} from './_generated/server';
import type {MutationCtx,QueryCtx} from './_generated/server';
import {v} from 'convex/values';
import {canonical,closeFact,reconciliationFact} from './realtimeRevenueModel';
type ReadCtx=Pick<QueryCtx,'db'>|Pick<MutationCtx,'db'>;
export const evidenceChunk=internalMutation({args:{auditId:v.string(),kind:v.union(v.literal('monday'),v.literal('close')),index:v.number(),items:v.array(reconciliationFact),close:v.array(closeFact)},handler:async(ctx,a)=>{
  if(!/^[a-f0-9-]{36}$/.test(a.auditId)||!Number.isSafeInteger(a.index)||a.index<0||a.index>=200||a.items.length+a.close.length>100||!(a.items.length+a.close.length)||JSON.stringify(a).length>500000||(a.kind==='monday'?a.close.length:a.items.length))throw Error('invalid_evidence_chunk');
  const existing=await ctx.db.query('revenue_reconciliation_chunks').withIndex('by_audit_kind_index',q=>q.eq('auditId',a.auditId).eq('kind',a.kind).eq('index',a.index)).unique();
  if(existing){if(canonical({auditId:existing.auditId,kind:existing.kind,index:existing.index,items:existing.items,close:existing.close})!==canonical(a))throw Error('conflicting_evidence');return;}
  if(await ctx.db.query('revenue_reconciliation').withIndex('by_audit',q=>q.eq('auditId',a.auditId)).unique())throw Error('sealed_evidence');
  await ctx.db.insert('revenue_reconciliation_chunks',a);
}});
export async function readEvidence(ctx:ReadCtx,auditId:string){
  const manifest=await ctx.db.query('revenue_reconciliation').withIndex('by_audit',q=>q.eq('auditId',auditId)).unique();
  if(!manifest)throw Error('evidence_missing');
  const chunks=await ctx.db.query('revenue_reconciliation_chunks').withIndex('by_audit_kind_index',q=>q.eq('auditId',auditId)).collect();
  const take=(kind:'monday'|'close',count:number)=>{const rows=chunks.filter(c=>c.kind===kind).sort((a,b)=>a.index-b.index);if(rows.length!==count||rows.some((r,i)=>r.index!==i))throw Error('incomplete_evidence');return rows;};
  return {items:take('monday',manifest.itemChunks).flatMap(c=>c.items),close:take('close',manifest.closeChunks).flatMap(c=>c.close),creatorAliases:manifest.creatorAliases};
}
export const evidenceComplete=internalMutation({args:{auditId:v.string(),itemChunks:v.number(),closeChunks:v.number(),creatorAliases:v.record(v.string(),v.string())},handler:async(ctx,a)=>{
  if(a.itemChunks<1||![a.itemChunks,a.closeChunks].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=200)||JSON.stringify(a.creatorAliases).length>100000)throw Error('invalid_evidence_manifest');
  const prior=await ctx.db.query('revenue_reconciliation').withIndex('by_audit',q=>q.eq('auditId',a.auditId)).unique();
  if(prior){if(prior.itemChunks!==a.itemChunks||prior.closeChunks!==a.closeChunks||canonical(prior.creatorAliases)!==canonical(a.creatorAliases))throw Error('conflicting_manifest');}
  else await ctx.db.insert('revenue_reconciliation',a);
  const facts=await readEvidence(ctx,a.auditId);
  return {items:facts.items.length,close:facts.close.length};
}});
