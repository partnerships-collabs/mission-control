import { monthlyRevenueValidator } from './monthlyRevenueValidator';
import { activePublication, unifiedReport, unifiedYtdSnapshot, unifiedHealthReport } from './unifiedRevenue';
export { recordUnifiedRunInternal } from './unifiedRevenue';
export {evidenceChunk,evidenceComplete} from './revenueEvidence';
export {configureRealtime,enqueueCloseEvent,claimCloseRefresh,finishCloseRefresh,failCloseRefresh,refreshCloseRealtime,realtimeStatus,recoverCloseQueue} from './realtimeRevenue';
import { validMonthlyRevenue } from './monthlyRevenueMath';
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { fetchCloseWonTotal } from "./closeRevenue";
import { evaluateAllTimeRevenue } from './allTimeRevenueMath';
import {
  revenueSourceNames,
  augmentRevenueAttemptWithLastVerified,
  calculateLegacyRevenueTotal,
  chicagoDateString,
  dayOfYearForDate,
  deriveCloseRefreshDiagnostic,
  deriveRevenueSnapshotMetrics,
  evaluateRevenueAttempt,
  isSameRevenueYear,
  legacyRevenueIngestionAllowed,
  revenueSourceFreshness,
  revenueScheduleHealth,
  safeRevenueSourceError,
  selectRevenueDisplaySnapshot,
  shiftDate,
  type CompleteRevenueSources,
  type RevenueSourceHealth,
} from "./revenueMath";

type CloseDiagnosticBaseStatus =
  | "verified_base"
  | "no_verified_base"
  | "different_revenue_year"
  | "incomplete_verified_base";

type CloseRefreshResult = {
  authoritative: false;
  published: false;
  snapshotDate: string;
  recordedAt: number;
  closeYtdUsd: number;
  closeLast30DayUsd: number;
  baseStatus: CloseDiagnosticBaseStatus;
  baseVerifiedSnapshotDate: string | null;
  diagnosticTotalYtdUsd: number | null;
  diagnosticLast30DayUsd: number | null;
  diagnosticProjectedAnnualUsd: number | null;
};

type CollectorRunResult = {
  runId: string;
  published: boolean;
  verificationStatus: "verified" | "degraded";
  totalYtdUsd?: number;
  issues: string[];
};

type LegacySnapshotResult = {
  totalYtdUsd: number;
};

const revenueSourceHealthEntryValidator = v.object({
  status: v.union(v.literal("success"), v.literal("failed")),
  amountUsd: v.optional(v.number()),
  fetchedAt: v.string(),
  reused: v.boolean(),
  error: v.optional(v.string()),
});

const revenueSourceHealthValidator = v.object({
  close: revenueSourceHealthEntryValidator,
  impact: revenueSourceHealthEntryValidator,
  redventures: revenueSourceHealthEntryValidator,
  adsbymoney: revenueSourceHealthEntryValidator,
  msn: revenueSourceHealthEntryValidator,
  monday_affiliates: v.optional(revenueSourceHealthEntryValidator),
});

const completeRevenueSourcesValidator = v.object({
  close: v.number(),
  impact: v.number(),
  redventures: v.number(),
  adsbymoney: v.number(),
  msn: v.number(),
  monday_affiliates: v.optional(v.number()),
});

async function validateMondayAudit(ctx: MutationCtx, args: {mondayAuditId?:string; snapshotDate:string; sourceHealth:RevenueSourceHealth}, period:'totalYtdUsd'|'totalAllTimeUsd', required:boolean) {
  const health = args.sourceHealth.monday_affiliates;
  if (!health) return required ? ['monday_affiliates_required'] : args.mondayAuditId ? ['monday_audit_without_source'] : [];
  if (health.status !== 'success') return [];
  if (!args.mondayAuditId) return ['monday_audit_missing'];
  const audit = await ctx.db.query('revenue_monday_audits').withIndex('by_audit', q => q.eq('auditId', args.mondayAuditId!)).unique();
  if (!audit || audit.snapshotDate !== args.snapshotDate || audit.fetchedAt !== health.fetchedAt
    || health.amountUsd === undefined || Math.round(health.amountUsd*100) !== Math.round(audit.summary[period]*100)) return ['monday_audit_mismatch'];
  return [];
}

export const recordAllTimeRunInternal = internalMutation({
  args: {
    monthly: v.optional(monthlyRevenueValidator),
    collectorRunId: v.string(), snapshotDate: v.string(),
    collectorStartedAt: v.string(), collectorCompletedAt: v.string(),
    sourceHealth: revenueSourceHealthValidator,
    mondayAuditId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (await activePublication(ctx)) throw new Error('Use unified revenue ingestion');
    const existing = await ctx.db.query('revenue_all_time_runs')
      .withIndex('by_run', q => q.eq('collectorRunId', args.collectorRunId)).first();
    if (existing) return { published: existing.published, issues: existing.issues, totalAllTimeUsd: existing.totalAllTimeUsd ?? null };
    const sourceHealth = sanitizeSourceHealth(args.sourceHealth);
    const receivedAt = Date.now();
    const evaluation = evaluateAllTimeRevenue({ ...args, sourceHealth }, receivedAt);
    const prior = await ctx.db.query('revenue_all_time_runs').withIndex('by_published_completed', q => q.eq('published', true)).order('desc').first();
    const mondayIssues = await validateMondayAudit(ctx, args, 'totalAllTimeUsd', Boolean(prior?.sourceHealth.monday_affiliates));
    if (mondayIssues.length) { evaluation.published = false; evaluation.totalAllTimeUsd = null; evaluation.issues.push(...mondayIssues); }
    if (args.monthly && !validMonthlyRevenue(args.monthly,
      Object.fromEntries(revenueSourceNames(sourceHealth).map(key => [key, sourceHealth[key]!.amountUsd])), args.snapshotDate)) {
      evaluation.published = false;
      evaluation.totalAllTimeUsd = null;
      evaluation.issues.push('monthly_invalid');
    }
    await ctx.db.insert('revenue_all_time_runs', {
      ...args, sourceHealth, receivedAt, published: evaluation.published, issues: evaluation.issues,
      ...(evaluation.totalAllTimeUsd === null ? {} : { totalAllTimeUsd: evaluation.totalAllTimeUsd }),
    });
    return evaluation;
  },
});

export const allTimeRevenueInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const unified = await unifiedReport(ctx);
    if (unified) return unified;
    const [lastAttempt, verified] = await Promise.all([
      ctx.db.query('revenue_all_time_runs').withIndex('by_received_at').order('desc').first(),
      ctx.db.query('revenue_all_time_runs').withIndex('by_published_completed', q => q.eq('published', true)).order('desc').first(),
    ]);
    const schedule = revenueScheduleHealth(verified?.snapshotDate ?? null, new Date());
    const sources = verified ? Object.fromEntries(revenueSourceNames(verified.sourceHealth).map(key => [key, verified.sourceHealth[key]!.amountUsd])) : null;
    const mondayAudit = verified?.mondayAuditId ? await ctx.db.query('revenue_monday_audits').withIndex('by_audit', q => q.eq('auditId', verified.mondayAuditId!)).unique() : null;
    return {
      healthy: Boolean(verified && lastAttempt?.published && schedule.lastAttemptOnSchedule
        && revenueSourceNames(verified.sourceHealth).every(key => revenueSourceFreshness(verified.sourceHealth[key]!, Date.now()) === 'fresh')),
      issues: lastAttempt?.issues ?? ['no_complete_history'],
      snapshot: verified ? {
        snapshotDate: verified.snapshotDate, collectorCompletedAt: verified.collectorCompletedAt,
        totalAllTimeUsd: verified.totalAllTimeUsd, sources,
        ...(verified.monthly ? { monthly: verified.monthly } : {}),
        ...(mondayAudit ? {monday: {auditId:mondayAudit.auditId, fetchedAt:mondayAudit.fetchedAt,
          ruleVersion:mondayAudit.ruleVersion, summary:mondayAudit.summary}} : {}),
      } : null,
    };
  },
});

function sanitizeSourceHealth(
  sourceHealth: RevenueSourceHealth,
): RevenueSourceHealth {
  return Object.fromEntries(
    revenueSourceNames(sourceHealth).map((sourceName) => {
      const health = sourceHealth[sourceName]!;
      const error = safeRevenueSourceError(health.error);
      const withoutError = { ...health };
      delete withoutError.error;
      return [
        sourceName,
        error ? { ...withoutError, error } : withoutError,
      ];
    }),
  ) as RevenueSourceHealth;
}

function summarizeSourceHealth(
  sourceHealth: RevenueSourceHealth | undefined,
  nowMs: number,
) {
  if (!sourceHealth) return null;
  return Object.fromEntries(
    revenueSourceNames(sourceHealth).map((sourceName) => {
      const health = sourceHealth[sourceName]!;
      return [
        sourceName,
        {
          status: health.status,
          amountUsd: health.amountUsd ?? null,
          fetchedAt: health.fetchedAt,
          reused: health.reused,
          hasError: Boolean(health.error),
          error: safeRevenueSourceError(health.error) ?? null,
          freshness: revenueSourceFreshness(health, nowMs),
        },
      ];
    }),
  );
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export const recordCollectionRunInternal = internalMutation({
  args: {
    snapshotDate: v.string(),
    goalUsd: v.number(),
    collectorRunId: v.string(),
    collectorStartedAt: v.string(),
    collectorCompletedAt: v.string(),
    closeLast30DayUsd: v.optional(v.number()),
    sourceHealth: revenueSourceHealthValidator,
    mondayAuditId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CollectorRunResult> => {
    if (await activePublication(ctx)) throw new Error('Use unified revenue ingestion');
    const priorRun = await ctx.db
      .query("revenue_collection_runs")
      .withIndex("by_run_id", (q) => q.eq("collectorRunId", args.collectorRunId))
      .first();
    if (priorRun) {
      return {
        runId: priorRun.collectorRunId,
        published: priorRun.published,
        verificationStatus: priorRun.verificationStatus,
        issues: priorRun.issues,
        ...(priorRun.totalYtdUsd === undefined
          ? {}
          : { totalYtdUsd: priorRun.totalYtdUsd }),
      };
    }

    const receivedAt = Date.now();
    const sourceHealth = sanitizeSourceHealth(args.sourceHealth);
    const evaluation = evaluateRevenueAttempt(
      sourceHealth,
      args.collectorStartedAt,
      args.collectorCompletedAt,
      args.snapshotDate,
      args.closeLast30DayUsd,
    );
    const priorVerified = await ctx.db.query('revenue_snapshots').withIndex('by_verification_date', q => q.eq('verificationStatus', 'verified')).order('desc').first();
    const issues = [...evaluation.issues, ...await validateMondayAudit(ctx, args, 'totalYtdUsd', Boolean(priorVerified?.sourceHealth?.monday_affiliates))];
    if (!args.collectorRunId.trim() || args.collectorRunId.length > 128) {
      issues.push("collector_run_id_invalid");
    }
    if (!Number.isFinite(args.goalUsd) || args.goalUsd <= 0) {
      issues.push("goal_usd_invalid");
    }
    const completedAtMs = Date.parse(args.collectorCompletedAt);
    if (Number.isFinite(completedAtMs)) {
      if (completedAtMs > receivedAt + 5 * 60 * 1000) {
        issues.push("collector_completed_in_future");
      }
      if (completedAtMs < receivedAt - 60 * 60 * 1000) {
        issues.push("collector_attempt_too_old");
      }
    }

    const publishable = evaluation.publishable && issues.length === 0;
    const verificationStatus = publishable ? "verified" : "degraded";
    let storedSourceHealth = sourceHealth;
    if (!publishable) {
      const lastVerifiedSnapshot = await ctx.db
        .query("revenue_snapshots")
        .withIndex("by_verification_date", (q) =>
          q.eq("verificationStatus", "verified"),
        )
        .order("desc")
        .first();
      storedSourceHealth = augmentRevenueAttemptWithLastVerified(
        sourceHealth,
        lastVerifiedSnapshot?.sources,
      );
      for (const sourceName of revenueSourceNames(storedSourceHealth)) {
        if (
          storedSourceHealth[sourceName]!.reused &&
          !issues.includes(`${sourceName}_reused`)
        ) {
          issues.push(`${sourceName}_reused`);
        }
      }
    }
    let totalYtdUsd: number | undefined;
    let publishedSnapshotId: Id<"revenue_snapshots"> | undefined;

    if (publishable) {
      const sources = evaluation.sources as CompleteRevenueSources;
      const metrics = deriveRevenueSnapshotMetrics(
        sources,
        args.snapshotDate,
        args.closeLast30DayUsd as number,
      );
      totalYtdUsd = metrics.totalYtdUsd;
      const verifiedAt = receivedAt;
      const snapshot = {
        snapshotDate: args.snapshotDate,
        totalYtdUsd,
        goalUsd: args.goalUsd,
        last30DayUsd: metrics.last30DayUsd,
        projectedAnnualUsd: metrics.projectedAnnualUsd,
        sources,
        verificationStatus: "verified" as const,
        verifiedAt,
        collectorRunId: args.collectorRunId,
        collectorStartedAt: args.collectorStartedAt,
        collectorCompletedAt: args.collectorCompletedAt,
        sourceHealth,
        ...(args.mondayAuditId ? {mondayAuditId:args.mondayAuditId} : {}),
        updatedAt: receivedAt,
      };
      const existingSnapshot = await ctx.db
        .query("revenue_snapshots")
        .withIndex("by_date", (q) => q.eq("snapshotDate", args.snapshotDate))
        .first();
      if (existingSnapshot) {
        await ctx.db.patch(existingSnapshot._id, {
          ...snapshot,
          // A complete five-source run supersedes any prior Close-only refresh.
          closeRefreshedAt: undefined,
        });
        publishedSnapshotId = existingSnapshot._id;
      } else {
        publishedSnapshotId = await ctx.db.insert("revenue_snapshots", snapshot);
      }
    }

    await ctx.db.insert("revenue_collection_runs", {
      collectorRunId: args.collectorRunId,
      snapshotDate: args.snapshotDate,
      collectorStartedAt: args.collectorStartedAt,
      collectorCompletedAt: args.collectorCompletedAt,
      receivedAt,
      goalUsd: args.goalUsd,
      verificationStatus,
      published: publishable,
      issues,
      sourceHealth: storedSourceHealth,
      ...(args.mondayAuditId ? {mondayAuditId:args.mondayAuditId} : {}),
      ...(args.closeLast30DayUsd === undefined
        ? {}
        : { closeLast30DayUsd: args.closeLast30DayUsd }),
      ...(totalYtdUsd === undefined ? {} : { totalYtdUsd }),
      ...(publishedSnapshotId === undefined ? {} : { publishedSnapshotId }),
    });

    return {
      runId: args.collectorRunId,
      published: publishable,
      verificationStatus,
      issues,
      ...(totalYtdUsd === undefined ? {} : { totalYtdUsd }),
    };
  },
});

export const upsertLegacySnapshotInternal = internalMutation({
  args: {
    snapshotDate: v.string(),
    totalYtdUsd: v.number(),
    goalUsd: v.number(),
    last30DayUsd: v.number(),
    projectedAnnualUsd: v.number(),
    sources: completeRevenueSourcesValidator,
  },
  handler: async (ctx, args): Promise<LegacySnapshotResult> => {
    if (await activePublication(ctx)) throw new Error('Use unified revenue ingestion');
    const [verifiedSnapshot, verifiedRun] = await Promise.all([
      ctx.db
        .query("revenue_snapshots")
        .withIndex("by_verification_date", (q) =>
          q.eq("verificationStatus", "verified"),
        )
        .first(),
      ctx.db
        .query("revenue_collection_runs")
        .withIndex("by_verification_received_at", (q) =>
          q.eq("verificationStatus", "verified"),
        )
        .first(),
    ]);
    if (
      !legacyRevenueIngestionAllowed(
        Boolean(verifiedSnapshot),
        Boolean(verifiedRun),
      )
    ) {
      throw new Error("Legacy revenue ingestion ended after verified cutover");
    }

    const totalYtdUsd = calculateLegacyRevenueTotal(args.sources);
    const parsedDate = Date.parse(`${args.snapshotDate}T00:00:00Z`);
    const snapshotDateIsValid =
      /^\d{4}-\d{2}-\d{2}$/.test(args.snapshotDate) &&
      Number.isFinite(parsedDate) &&
      new Date(parsedDate).toISOString().slice(0, 10) === args.snapshotDate;
    if (
      totalYtdUsd === null ||
      !snapshotDateIsValid ||
      !Number.isFinite(args.goalUsd) ||
      args.goalUsd <= 0 ||
      !Number.isFinite(args.last30DayUsd) ||
      args.last30DayUsd < 0
    ) {
      throw new Error("Legacy revenue snapshot is invalid");
    }

    const dayOfYear = dayOfYearForDate(args.snapshotDate);
    const snapshot = {
      snapshotDate: args.snapshotDate,
      totalYtdUsd,
      goalUsd: args.goalUsd,
      last30DayUsd: args.last30DayUsd,
      projectedAnnualUsd: (totalYtdUsd / dayOfYear) * 365,
      sources: args.sources,
      updatedAt: Date.now(),
    };
    const existingSnapshot = await ctx.db
      .query("revenue_snapshots")
      .withIndex("by_date", (q) => q.eq("snapshotDate", args.snapshotDate))
      .first();
    if (existingSnapshot) {
      await ctx.db.patch(existingSnapshot._id, {
        ...snapshot,
        verificationStatus: undefined,
        verifiedAt: undefined,
        collectorRunId: undefined,
        collectorStartedAt: undefined,
        collectorCompletedAt: undefined,
        closeRefreshedAt: undefined,
        sourceHealth: undefined,
      });
    } else {
      await ctx.db.insert("revenue_snapshots", snapshot);
    }
    return { totalYtdUsd };
  },
});

export const latestSnapshotInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const unified = await unifiedYtdSnapshot(ctx);
    if (unified) return unified;
    const snapshots = await ctx.db
      .query("revenue_snapshots")
      .withIndex("by_date")
      .order("desc")
      .collect();
    return selectRevenueDisplaySnapshot(snapshots).snapshot;
  },
});

export const latestVerifiedSnapshotInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const unified = await unifiedYtdSnapshot(ctx);
    if (unified) return unified;
    return await ctx.db
      .query("revenue_snapshots")
      .withIndex("by_verification_date", (q) =>
        q.eq("verificationStatus", "verified"),
      )
      .order("desc")
      .first();
  },
});

export const revenueHealthInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const unified = await unifiedHealthReport(ctx);
    if (unified) return unified;
    const nowMs = Date.now();
    const [lastAttempt, lastVerifiedSnapshot, snapshots, lastCloseDiagnostic] =
      await Promise.all([
        ctx.db
          .query("revenue_collection_runs")
          .withIndex("by_received_at")
          .order("desc")
          .first(),
        ctx.db
          .query("revenue_snapshots")
          .withIndex("by_verification_date", (q) =>
            q.eq("verificationStatus", "verified"),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("revenue_snapshots")
          .withIndex("by_date")
          .order("desc")
          .collect(),
        ctx.db
          .query("revenue_close_refreshes")
          .withIndex("by_recorded_at")
          .order("desc")
          .first(),
      ]);
    const display = selectRevenueDisplaySnapshot(snapshots);
    const schedule = revenueScheduleHealth(
      lastAttempt?.snapshotDate ?? null,
      new Date(nowMs),
    );
    const verifiedSourceHealth = lastVerifiedSnapshot?.sourceHealth;
    const verifiedSourceSummary = summarizeSourceHealth(verifiedSourceHealth, nowMs);
    const everyVerifiedSourceIsFresh =
      verifiedSourceHealth !== undefined &&
      revenueSourceNames(verifiedSourceHealth).every(
        (sourceName) =>
          revenueSourceFreshness(verifiedSourceHealth[sourceName]!, nowMs) === "fresh",
      );

    return {
      healthy: Boolean(
        lastAttempt?.published &&
          schedule.lastAttemptOnSchedule &&
          lastVerifiedSnapshot &&
          everyVerifiedSourceIsFresh,
      ),
      schedule,
      displayStatus: display.status,
      displaySnapshot: display.snapshot
        ? {
            snapshotDate: display.snapshot.snapshotDate,
            totalYtdUsd: display.snapshot.totalYtdUsd,
            updatedAt: display.snapshot.updatedAt ?? display.snapshot._creationTime,
          }
        : null,
      lastAttempt: lastAttempt
        ? {
            collectorRunId: lastAttempt.collectorRunId,
            snapshotDate: lastAttempt.snapshotDate,
            collectorStartedAt: lastAttempt.collectorStartedAt,
            collectorCompletedAt: lastAttempt.collectorCompletedAt,
            receivedAt: lastAttempt.receivedAt,
            verificationStatus: lastAttempt.verificationStatus,
            published: lastAttempt.published,
            totalYtdUsd: lastAttempt.totalYtdUsd ?? null,
            issues: lastAttempt.issues,
            sourceHealth: summarizeSourceHealth(lastAttempt.sourceHealth, nowMs),
          }
        : null,
      lastVerifiedSnapshot: lastVerifiedSnapshot
        ? {
            snapshotDate: lastVerifiedSnapshot.snapshotDate,
            totalYtdUsd: lastVerifiedSnapshot.totalYtdUsd,
            verifiedAt: lastVerifiedSnapshot.verifiedAt ?? null,
            collectorRunId: lastVerifiedSnapshot.collectorRunId ?? null,
            collectorStartedAt: lastVerifiedSnapshot.collectorStartedAt ?? null,
            collectorCompletedAt: lastVerifiedSnapshot.collectorCompletedAt ?? null,
            sourceHealth: verifiedSourceSummary,
          }
        : null,
      lastNonAuthoritativeCloseDiagnostic: lastCloseDiagnostic
        ? {
            authoritative: false,
            published: false,
            snapshotDate: lastCloseDiagnostic.snapshotDate,
            recordedAt: lastCloseDiagnostic.recordedAt,
            freshness:
              nowMs - lastCloseDiagnostic.recordedAt <= 36 * 60 * 60 * 1000
                ? "fresh"
                : "stale",
            closeYtdUsd: lastCloseDiagnostic.closeYtdUsd,
            closeLast30DayUsd: lastCloseDiagnostic.closeLast30DayUsd,
            baseStatus: lastCloseDiagnostic.baseStatus,
            baseVerifiedSnapshotDate:
              lastCloseDiagnostic.baseVerifiedSnapshotDate ?? null,
            diagnosticTotalYtdUsd:
              lastCloseDiagnostic.diagnosticTotalYtdUsd ?? null,
            diagnosticLast30DayUsd:
              lastCloseDiagnostic.diagnosticLast30DayUsd ?? null,
            diagnosticProjectedAnnualUsd:
              lastCloseDiagnostic.diagnosticProjectedAnnualUsd ?? null,
          }
        : null,
    };
  },
});

export const recordCloseRefreshInternal = internalMutation({
  args: {
    snapshotDate: v.string(),
    closeYtdUsd: v.number(),
    closeLast30DayUsd: v.number(),
  },
  handler: async (ctx, args): Promise<CloseRefreshResult> => {
    const latest = await ctx.db
      .query("revenue_snapshots")
      .withIndex("by_verification_date", (q) =>
        q.eq("verificationStatus", "verified"),
      )
      .order("desc")
      .first();
    if (
      !Number.isFinite(args.closeYtdUsd) ||
      args.closeYtdUsd < 0 ||
      !Number.isFinite(args.closeLast30DayUsd) ||
      args.closeLast30DayUsd < 0
    ) {
      throw new Error("Close returned an invalid revenue amount");
    }

    let baseStatus: CloseDiagnosticBaseStatus;
    let diagnostic: ReturnType<typeof deriveCloseRefreshDiagnostic> = null;
    if (!latest) {
      baseStatus = "no_verified_base";
    } else if (!isSameRevenueYear(latest.snapshotDate, args.snapshotDate)) {
      baseStatus = "different_revenue_year";
    } else {
      diagnostic = deriveCloseRefreshDiagnostic(
        latest.sources,
        args.closeYtdUsd,
        args.closeLast30DayUsd,
        args.snapshotDate,
      );
      baseStatus = diagnostic
        ? "verified_base"
        : "incomplete_verified_base";
    }

    const recordedAt = Date.now();
    await ctx.db.insert("revenue_close_refreshes", {
      snapshotDate: args.snapshotDate,
      recordedAt,
      closeYtdUsd: args.closeYtdUsd,
      closeLast30DayUsd: args.closeLast30DayUsd,
      authoritative: false,
      published: false,
      baseStatus,
      ...(latest
        ? {
            baseVerifiedSnapshotId: latest._id,
            baseVerifiedSnapshotDate: latest.snapshotDate,
          }
        : {}),
      ...(diagnostic
        ? {
            diagnosticTotalYtdUsd: diagnostic.totalYtdUsd,
            diagnosticLast30DayUsd: diagnostic.last30DayUsd,
            diagnosticProjectedAnnualUsd: diagnostic.projectedAnnualUsd,
          }
        : {}),
    });

    return {
      authoritative: false,
      published: false,
      snapshotDate: args.snapshotDate,
      recordedAt,
      closeYtdUsd: args.closeYtdUsd,
      closeLast30DayUsd: args.closeLast30DayUsd,
      baseStatus,
      baseVerifiedSnapshotDate: latest?.snapshotDate ?? null,
      diagnosticTotalYtdUsd: diagnostic?.totalYtdUsd ?? null,
      diagnosticLast30DayUsd: diagnostic?.last30DayUsd ?? null,
      diagnosticProjectedAnnualUsd: diagnostic?.projectedAnnualUsd ?? null,
    };
  },
});

export const migrateRemoveCopper = internalMutation({
  args: {},
  handler: async (ctx) => {
    const snapshots = await ctx.db.query("revenue_snapshots").collect();
    for (const snap of snapshots) {
      if (snap.sources?.copper !== undefined) {
        const { copper, ...rest } = snap.sources;
        await ctx.db.patch(snap._id, {
          sources: { ...rest, close: copper },
        });
      }
    }
  },
});

// ── Internal action: fetch revenue from Close API ─────────────────────────────

export const refreshCloseDiagnosticInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<CloseRefreshResult> => {
    console.log("[revenue.refreshCloseDiagnostic] starting Close API fetch");

    const apiKey = process.env.CLOSE_API_KEY;
    if (!apiKey) throw new Error("CLOSE_API_KEY not configured");

    const snapshotDate = chicagoDateString();
    const yearStart = `${snapshotDate.slice(0, 4)}-01-01`;
    const [closeYtdUsd, closeLast30DayUsd] = await Promise.all([
      fetchCloseWonTotal(apiKey, yearStart, snapshotDate),
      // Both Close date filters are inclusive, so today through -29 is 30 days.
      fetchCloseWonTotal(
        apiKey,
        shiftDate(snapshotDate, -29),
        snapshotDate,
        fetch,
        false,
      ),
    ]);

    const result: CloseRefreshResult = await ctx.runMutation(
      internal.revenue.recordCloseRefreshInternal,
      {
        snapshotDate,
        closeYtdUsd,
        closeLast30DayUsd,
      },
    );

    console.log(
      `[revenue.refreshCloseDiagnostic] closeYtdUsd=${closeYtdUsd} ` +
        `baseStatus=${result.baseStatus} published=false`,
    );

    console.log(
      "[revenue.refreshCloseDiagnostic] diagnostic saved; public snapshot unchanged",
    );
    return result;
  },
});
