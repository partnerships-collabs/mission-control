import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { fetchCloseWonTotal } from "./closeRevenue";
import {
  chicagoDateString,
  dayOfYearForDate,
  estimateLast30DayRevenue,
  isSameRevenueYear,
  mergeCloseSource,
  shiftDate,
  sumRevenueSources,
} from "./revenueMath";

type CloseRefreshResult = {
  closeYtdUsd: number;
  totalYtdUsd: number;
  last30DayUsd: number;
  projectedAnnualUsd: number;
};

// ── Mutations ─────────────────────────────────────────────────────────────────

export const upsertSnapshotInternal = internalMutation({
  args: {
    snapshotDate: v.string(),
    totalYtdUsd: v.number(),
    goalUsd: v.number(),
    last30DayUsd: v.number(),
    projectedAnnualUsd: v.number(),
    sources: v.object({
      close: v.optional(v.number()),
      copper: v.optional(v.number()),
      impact: v.optional(v.number()),
      adsbymoney: v.optional(v.number()),
      redventures: v.optional(v.number()),
      msn: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("revenue_snapshots")
      .withIndex("by_date", (q) => q.eq("snapshotDate", args.snapshotDate))
      .first();
    const snapshot = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, snapshot);
    } else {
      await ctx.db.insert("revenue_snapshots", snapshot);
    }
  },
});

export const latestSnapshotInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("revenue_snapshots")
      .withIndex("by_date")
      .order("desc")
      .first();
  },
});

export const mergeCloseSnapshotInternal = internalMutation({
  args: {
    snapshotDate: v.string(),
    closeYtdUsd: v.number(),
    closeLast30DayUsd: v.number(),
  },
  handler: async (ctx, args): Promise<CloseRefreshResult> => {
    // Read and merge inside one mutation so a concurrent full collector write
    // cannot be overwritten with older non-Close source values.
    const latest = await ctx.db
      .query("revenue_snapshots")
      .withIndex("by_date")
      .order("desc")
      .first();
    if (!latest) {
      throw new Error("Run the daily revenue collector before refreshing Close");
    }
    if (!isSameRevenueYear(latest.snapshotDate, args.snapshotDate)) {
      throw new Error("Run the current-year revenue collector before refreshing Close");
    }

    const sources = mergeCloseSource(latest.sources, args.closeYtdUsd);
    const totalYtdUsd = sumRevenueSources(sources);
    const dayOfYear = dayOfYearForDate(args.snapshotDate);
    const last30DayUsd = estimateLast30DayRevenue(
      totalYtdUsd,
      args.closeYtdUsd,
      args.closeLast30DayUsd,
      dayOfYear,
    );
    const projectedAnnualUsd = (totalYtdUsd / dayOfYear) * 365;
    const snapshot = {
      snapshotDate: args.snapshotDate,
      totalYtdUsd,
      goalUsd: latest.goalUsd,
      last30DayUsd,
      projectedAnnualUsd,
      sources,
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("revenue_snapshots")
      .withIndex("by_date", (q) => q.eq("snapshotDate", args.snapshotDate))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, snapshot);
    } else {
      await ctx.db.insert("revenue_snapshots", snapshot);
    }

    return {
      closeYtdUsd: args.closeYtdUsd,
      totalYtdUsd,
      last30DayUsd,
      projectedAnnualUsd,
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

export const refreshFromCloseInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<CloseRefreshResult> => {
    console.log("[revenue.refreshFromClose] starting Close API fetch");

    const apiKey = process.env.CLOSE_API_KEY;
    if (!apiKey) throw new Error("CLOSE_API_KEY not configured");

    const snapshotDate = chicagoDateString();
    const yearStart = `${snapshotDate.slice(0, 4)}-01-01`;
    const [closeYtdUsd, closeLast30DayUsd] = await Promise.all([
      fetchCloseWonTotal(apiKey, yearStart, snapshotDate),
      // Both Close date filters are inclusive, so today through -29 is 30 days.
      fetchCloseWonTotal(apiKey, shiftDate(snapshotDate, -29), snapshotDate),
    ]);

    const result: CloseRefreshResult = await ctx.runMutation(
      internal.revenue.mergeCloseSnapshotInternal,
      {
      snapshotDate,
      closeYtdUsd,
      closeLast30DayUsd,
      },
    );

    console.log(
      `[revenue.refreshFromClose] closeYtdUsd=${closeYtdUsd} totalYtdUsd=${result.totalYtdUsd}`
    );

    console.log("[revenue.refreshFromClose] snapshot saved successfully");
    return result;
  },
});
