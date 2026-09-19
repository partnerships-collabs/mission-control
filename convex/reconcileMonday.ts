import {type CloseFact,type ReconciliationFact,canonical,normalized,validDate} from './realtimeRevenueModel';
import {summarizeMondayRows,type MondayRow} from './mondayRevenueMath';

const split=(name:string)=>{const match=/\s+[xX]\s+/.exec(name);return match?[name.slice(0,match.index).trim(),name.slice(match.index+match[0].length).trim()]:[name.trim(),''];};
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const brandMatches=(brand:string,value:string)=>Boolean(brand&&(normalized(brand)===normalized(value)||new RegExp('^'+escape(brand)+'(?:\\b|\\s|\\()','i').test(value)));

export function assertOverrideEvidenceStable(items:ReconciliationFact[],facts:CloseFact[],previous:CloseFact[]) {
  for(const item of items){
    const o=item.override;
    if(!o?.matches||!(o.disposition==='included'||o.source==='close'))continue;
    const brand=split(item.name)[0];
    const related=(rows:CloseFact[])=>rows.filter(d=>brandMatches(brand,d.lead_name)||brandMatches(brand,d.note)||o.references.includes(d.id)).sort((a,b)=>a.id.localeCompare(b.id));
    // Existing reviewed exceptions remain valid only against the reviewed Close
    // evidence. Never let a later win silently bypass duplicate detection.
    if(canonical(related(facts))!==canonical(related(previous)))throw Error('monday_override_requires_review');
  }
}

/** Same accounting contract as the Python collector, using immutable captured inputs. */
export function reconcileMonday(items:ReconciliationFact[], opportunities:CloseFact[], aliases:Record<string,string>, date:string):MondayRow[] {
  const creatorName=(v:string)=>{const clean=normalized(v.replace(/\([^)]*\)|\[[^]]*\]/g,''));return aliases[clean]??clean;};
  const prepared=opportunities.map(d=>({deal:d,lead:normalized(d.lead_name),note:normalized(d.note),
    names:[split(d.note)[1],...d.creators].filter(Boolean).map(creatorName)}));
  const candidateCache=new Map<string,CloseFact[]>();
  const findCandidates=(brand:string,creator:string)=>{
    const key=brand+'\0'+creator;if(candidateCache.has(key))return candidateCache.get(key)!;
    const target=creatorName(creator),normalBrand=normalized(brand),pattern=new RegExp('^'+escape(brand)+'(?:\\b|\\s|\\()','i');
    const candidates=prepared.filter(p=>p.deal.value&&brand&&(normalBrand===p.lead||normalBrand===p.note||pattern.test(p.deal.lead_name)||pattern.test(p.deal.note))
      &&(!p.names.length||p.names.some(v=>v&&(v==='ca'||v==='creatorsagency'||v.includes(target)||target.includes(v))))).map(p=>p.deal);
    candidateCache.set(key,candidates);return candidates;
  };
  const originals=new Map(items.map(i=>[i.itemId,i]));
  if(originals.size!==items.length||!items.length||items.length>20000)throw Error('invalid_reconciliation_inputs');
  const rows:MondayRow[]=items.map(item=>{
    const {paid,impactLabel,impactRefs,closeNotes,supplemental,override,...base}=item;
    const [brand,creator]=split(item.name), program=normalized(brand), msn=program.startsWith('microsoftstart')||program==='msn';
    const row:MondayRow={...base,disposition:'review',reason:'unclassified_program',references:[],...(msn?{source:'msn'}:{})};
    if(!paid) {row.disposition='unpaid';row.reason='not_paid_in_full';}
    else if(!validDate(row.paymentDate))row.reason='missing_or_invalid_payment_date';
    else if(row.paymentDate>date){row.disposition='future';row.reason='future_payment';}
    else {
      let covered:string|undefined;
      if(impactLabel){if(impactRefs.length){covered='impact';row.references=impactRefs;}else row.reason='impact_coverage_unconfirmed';}
      else if(msn){row.reason=item.grossCents===undefined?item.basis:'msn_paid_monday';if(item.grossCents!==undefined)row.disposition='included';return row;}
      else if(program.startsWith('moneycom')){covered='adsbymoney';row.references=['adsbymoney:publisher_dashboard/campaigns'];}
      else if(/red\s*ventures|bankrate|creditcards\.com/i.test(item.name)){covered='redventures';row.references=['redventures:property:50812'];}
      if(covered){row.disposition='covered';row.reason='already_in_direct_feed';row.source=covered;}
      else if(!impactLabel){
        if(impactRefs.length){row.reason='possible_impact_overlap';row.references=impactRefs;}
        else {
          const candidates=findCandidates(brand,creator);
          const exact=candidates.filter(d=>closeNotes.includes(d.id));
          if(exact.length){row.disposition='covered';row.reason='linked_close_contract';row.source='close';row.references=exact.map(d=>d.id);}
          else if(candidates.length){row.reason='possible_close_overlap';row.references=candidates.map(d=>d.id);}
          else if(item.grossCents===undefined)row.reason=item.basis;
          else if(supplemental){row.disposition='included';row.reason='supplemental_affiliate';}
        }
      }
    }
    return row;
  });
  const fingerprint=(r:MondayRow)=>JSON.stringify([normalized(r.name),r.invoice,r.paymentDate,r.periodDate,r.grossCents??null]);
  const counts=new Map<string,number>();
  for(const r of rows)if(['included','review'].includes(r.disposition))counts.set(fingerprint(r),(counts.get(fingerprint(r))??0)+1);
  for(const r of rows){
    if(r.disposition==='included'&&(counts.get(fingerprint(r))??0)>1){r.disposition='review';r.reason='possible_duplicate_monday_line';}
    const o=originals.get(r.itemId)!.override;
    if(r.source==='msn'||!o||['unpaid','future'].includes(r.disposition))continue;
    if(!o.matches){r.disposition='review';r.reason='override_input_changed';continue;}
    if(o.disposition==='included'&&(r.grossCents===undefined||!validDate(r.paymentDate)))continue;
    if(!['included','covered','review'].includes(o.disposition)||!o.references.length)throw Error('invalid_override');
    r.disposition=o.disposition;r.references=o.references;delete r.source;
    if(o.disposition==='included')r.reason='supplemental_affiliate';
    else if(o.disposition==='covered'){r.source=o.source;r.reason=o.source==='close'?'linked_close_contract':'already_in_direct_feed';}
    else r.reason='coverage_review';
  }
  rows.sort((a,b)=>Number(a.itemId)-Number(b.itemId));
  summarizeMondayRows(rows,date);
  if(rows.some(r=>r.source==='msn'&&r.disposition==='review'))throw Error('msn_payment_review');
  return rows;
}

export function deriveCloseDays(facts:CloseFact[], date:string) {
  const ids=new Set<string>(),days=new Map<string,number>();
  for(const r of facts){
    const day=r.date_won.slice(0,10);
    if(!r.id||ids.has(r.id)||!validDate(day)||day>date||r.value_currency!=='USD'||r.value_period!=='one_time'||!Number.isSafeInteger(r.value)||r.value<0)throw Error('invalid_close_capture');
    ids.add(r.id);const amount=(days.get(day)??0)+r.value;if(!Number.isSafeInteger(amount))throw Error('invalid_close_capture');days.set(day,amount);
  }
  // An authoritative empty list can legitimately result from reopening/deleting
  // the final won deal. Keep a zero day so the existing aggregate validator works.
  if(!days.size)days.set(date,0);
  return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,amountCents])=>({date,amountCents}));
}
