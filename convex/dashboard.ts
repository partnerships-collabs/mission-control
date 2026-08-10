import { query } from "./_generated/server";
import { v } from "convex/values";

export const getAgents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});

export const getCronSummary = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("cron_jobs").collect();
    const total = jobs.length;
    const healthy = jobs.filter((j) => j.lastStatus === "ok" || j.lastStatus === "success").length;
    const errored = jobs.filter((j) => j.errorCount24h > 0).length;
    return { total, healthy, errored };
  },
});

export const getCronJobs = query({
  args: { agent: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.agent) {
      return await ctx.db
        .query("cron_jobs")
        .withIndex("by_agent", (q) => q.eq("agent", args.agent!))
        .collect();
    }
    return await ctx.db.query("cron_jobs").collect();
  },
});

export const getRecentCronRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("cron_jobs")
      .order("desc")
      .take(limit);
  },
});

export const getLatestPipelineMetrics = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pipeline_metrics").order("desc").first();
  },
});

export const getInfrastructure = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("infrastructure_status").collect();
  },
});

export const getTokenUsage = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("token_usage").collect();
  },
});

export const getSponsorPipeline = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sponsor_pipeline").order("desc").first();
  },
});

export const getRecentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db.query("activity_events").order("desc").take(limit);
  },
});
