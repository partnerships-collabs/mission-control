import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const statsArgs = {
  proposalValue: v.number(),
  negotiationValue: v.number(),
  contractingValue: v.number(),
  dealCounts: v.object({
    proposal: v.number(),
    negotiation: v.number(),
    contracting: v.number(),
  }),
} as const;

export const upsertPipelineStats = mutation({
  args: statsArgs,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("pipeline_stats").order("desc").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("pipeline_stats", args);
    }
  },
});

export const upsertPipelineStatsInternal = internalMutation({
  args: statsArgs,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("pipeline_stats").order("desc").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("pipeline_stats", args);
    }
  },
});

export const getLatestPipelineStats = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pipeline_stats").order("desc").first();
  },
});
