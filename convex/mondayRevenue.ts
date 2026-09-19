import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

import { mondayRowValidator, mondaySummaryValidator, summarizeMondayRows } from './mondayRevenueMath';

export const recordChunkInternal = internalMutation({
  args: { auditId: v.string(), index: v.number(), rows: v.array(mondayRowValidator) },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9-]{36}$/.test(args.auditId) || !Number.isSafeInteger(args.index) || args.index < 0 || args.rows.length < 1 || args.rows.length > 100) throw new Error('Invalid chunk');
    const existing = await ctx.db.query('revenue_monday_chunks').withIndex('by_audit_chunk', q => q.eq('auditId', args.auditId).eq('index', args.index)).unique();
    if (existing) {
      if (JSON.stringify(existing.rows.map(row => Object.fromEntries(Object.entries(row).sort()))) !== JSON.stringify(args.rows.map(row => Object.fromEntries(Object.entries(row).sort())))) throw new Error('Audit chunk conflict');
      return {ok:true};
    }
    const finished = await ctx.db.query('revenue_monday_audits').withIndex('by_audit', q => q.eq('auditId', args.auditId)).unique();
    if (finished) throw new Error('Audit already completed');
    await ctx.db.insert('revenue_monday_chunks', args);
    return {ok:true};
  },
});

export const completeAuditInternal = internalMutation({
  args: { auditId: v.string(), snapshotDate: v.string(), fetchedAt: v.string(), ruleVersion: v.string(), digest: v.string(),
    closeEvidenceCount: v.number(), impactEvidenceCount: v.number(), summary: mondaySummaryValidator },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('revenue_monday_audits').withIndex('by_audit', q => q.eq('auditId', args.auditId)).unique();
    if (existing) {
      if (existing.digest !== args.digest) throw new Error('Audit conflict');
      return {summary:existing.summary};
    }
    const fetched = Date.parse(args.fetchedAt);
    if (!/^[a-f0-9]{64}$/.test(args.digest) || !Number.isFinite(fetched) || fetched > Date.now()+300_000 || fetched < Date.now()-3_600_000
      || !Number.isSafeInteger(args.closeEvidenceCount) || args.closeEvidenceCount < 0 || args.impactEvidenceCount < 1 || !args.ruleVersion) throw new Error('Incomplete evidence');
    const chunks = await ctx.db.query('revenue_monday_chunks').withIndex('by_audit_chunk', q => q.eq('auditId', args.auditId)).collect();
    if (!chunks.length || chunks.some((c,i) => c.index !== i || (i < chunks.length-1 && c.rows.length !== 100))) throw new Error('Incomplete chunks');
    const summary = summarizeMondayRows(chunks.flatMap(c => c.rows), args.snapshotDate);
    if (Object.entries(summary).some(([k,v]) => args.summary[k as keyof typeof summary] !== v)) throw new Error('Audit total mismatch');
    await ctx.db.insert('revenue_monday_audits', {...args, summary, receivedAt:Date.now()});
    return {summary};
  },
});

export const auditInternal = internalQuery({
  args: { auditId: v.string(), page: v.number(), disposition: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.page) || args.page < 0 || (args.disposition && !['included','covered','review','unpaid','future'].includes(args.disposition))) throw new Error('Invalid page');
    const audit = await ctx.db.query('revenue_monday_audits').withIndex('by_audit', q => q.eq('auditId', args.auditId)).unique();
    if (!audit) return null;
    const chunks = await ctx.db.query('revenue_monday_chunks').withIndex('by_audit_chunk', q => q.eq('auditId', args.auditId)).collect();
    const rows = chunks.flatMap(c => c.rows).filter(r => !args.disposition || r.disposition === args.disposition);
    return {auditId:audit.auditId, snapshotDate:audit.snapshotDate, fetchedAt:audit.fetchedAt, ruleVersion:audit.ruleVersion,
      summary:audit.summary, total:rows.length, page:args.page, hasMore:(args.page+1)*100 < rows.length,
      rows:rows.slice(args.page*100, (args.page+1)*100)};
  },
});
