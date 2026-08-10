import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const GOAL_USD = 25_000_000;

// ── Queries ──────────────────────────────────────────────────────────────────

export const latestSnapshot = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("revenue_snapshots")
      .order("desc")
      .first();
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

export const upsertSnapshot = mutation({
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
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("revenue_snapshots", args);
    }
  },
});

// Internal version for use by actions
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
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("revenue_snapshots", args);
    }
  },
});

export const latestSnapshotInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("revenue_snapshots").order("desc").first();
  },
});

export const migrateRemoveCopper = mutation({
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
  handler: async (ctx) => {
    console.log("[revenue.refreshFromClose] starting Close API fetch");

    const apiKey = process.env.CLOSE_API_KEY;
    if (!apiKey) {
      console.error("[revenue.refreshFromClose] CLOSE_API_KEY env var not set");
      throw new Error("CLOSE_API_KEY not configured");
    }

    const authHeader = "Basic " + btoa(`${apiKey}:`);
    let allOpps: Array<{ date_won?: string; value?: number }> = [];
    let skip = 0;
    const limit = 100;

    while (true) {
      console.log(`[revenue.refreshFromClose] fetching page skip=${skip}`);
      const resp = await fetch(
        `https://api.close.com/api/v1/opportunity/?status_type=won&_limit=${limit}&_skip=${skip}`,
        { headers: { Authorization: authHeader, "Content-Type": "application/json" } }
      );

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error(`[revenue.refreshFromClose] Close API error status=${resp.status} body=${body.slice(0, 200)}`);
        throw new Error(`Close API returned ${resp.status}`);
      }

      const data = await resp.json();
      console.log(`[revenue.refreshFromClose] got ${data.data?.length ?? 0} opps, has_more=${data.has_more}`);
      allOpps.push(...(data.data ?? []));
      if (!data.has_more || (data.data?.length ?? 0) < limit) break;
      skip += limit;
    }

    console.log(`[revenue.refreshFromClose] total won opps fetched: ${allOpps.length}`);

    const now = new Date();
    const currentYear = now.getFullYear();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let totalYtdUsd = 0;
    let last30DayUsd = 0;

    for (const opp of allOpps) {
      if (!opp.date_won) continue;
      const dateWon = new Date(opp.date_won);
      if (dateWon.getFullYear() !== currentYear) continue;
      const val = opp.value ?? 0;
      totalYtdUsd += val;
      if (dateWon >= thirtyDaysAgo) last30DayUsd += val;
    }

    const projectedAnnualUsd =
      last30DayUsd > 0 ? Math.round((last30DayUsd / 30) * 365) : 0;
    const snapshotDate = now.toISOString().split("T")[0];

    console.log(
      `[revenue.refreshFromClose] totalYtdUsd=${totalYtdUsd} last30Day=${last30DayUsd} projected=${projectedAnnualUsd}`
    );

    await ctx.runMutation(internal.revenue.upsertSnapshotInternal, {
      snapshotDate,
      totalYtdUsd,
      goalUsd: GOAL_USD,
      last30DayUsd,
      projectedAnnualUsd,
      sources: { close: totalYtdUsd },
    });

    console.log("[revenue.refreshFromClose] snapshot saved successfully");
    return { totalYtdUsd, last30DayUsd, projectedAnnualUsd };
  },
});
