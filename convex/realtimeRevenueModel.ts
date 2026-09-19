import { v, type Infer } from 'convex/values';

export const closeFact = v.object({id:v.string(), date_won:v.string(), value:v.number(),
  value_currency:v.string(), value_period:v.string(), lead_name:v.string(), note:v.string(), creators:v.array(v.string())});
export type CloseFact = Infer<typeof closeFact>;
export const reconciliationFact = v.object({itemId:v.string(),name:v.string(),invoice:v.string(),paymentDate:v.string(),periodDate:v.string(),
  grossCents:v.optional(v.number()),basis:v.string(),updatedAt:v.string(),state:v.string(),paid:v.boolean(),impactLabel:v.boolean(),
  impactRefs:v.array(v.string()),closeNotes:v.string(),supplemental:v.boolean(),
  override:v.optional(v.object({matches:v.boolean(),disposition:v.string(),references:v.array(v.string()),source:v.optional(v.string())}))});
export type ReconciliationFact = Infer<typeof reconciliationFact>;
export const realtimeProvenance = v.object({kind:v.union(v.literal('daily'),v.literal('close'),v.literal('calendar')),
  baselineRunId:v.string(), lastFullRefreshAt:v.string(),closeRefreshedAt:v.string()});

export function normalized(value:string) {return value.toLowerCase().replace(/[^a-z0-9]/g,'');}
export function validDate(value:string) {return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function chicagoDate(time=Date.now()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(time);}

// Convex seeds Math.random per transaction, preserving deterministic retries.
export function transactionUuid() {return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
  const r=Math.floor(Math.random()*16);return (c==='x'?r:(r&3)|8).toString(16);
});}
export function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
