import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── upsertAgent ───────────────────────────────────────────────────────────────

export const upsertAgent = mutation({
  args: {
    name: v.string(),
    host: v.string(),
    model: v.string(),
    status: v.string(),
    sessionCount: v.number(),
    lastActiveAt: v.number(),
    lastJobName: v.optional(v.string()),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", data.name))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("agents", data);
    }
  },
});

// ── upsertCronJob ─────────────────────────────────────────────────────────────

export const upsertCronJob = mutation({
  args: {
    jobId: v.string(),
    name: v.string(),
    agent: v.string(),
    schedule: v.string(),
    lastStatus: v.string(),
    runCount24h: v.number(),
    errorCount24h: v.number(),
    lastRunAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    avgDurationSec: v.optional(v.number()),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    const existing = await ctx.db
      .query("cron_jobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", data.jobId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("cron_jobs", data);
    }
  },
});

// ── upsertInfrastructure ──────────────────────────────────────────────────────

export const upsertInfrastructure = mutation({
  args: {
    host: v.string(),
    online: v.boolean(),
    cpuPct: v.optional(v.number()),
    memUsedGb: v.optional(v.number()),
    memTotalGb: v.optional(v.number()),
    diskUsedGb: v.optional(v.number()),
    activeProcesses: v.optional(v.number()),
    ollamaRunning: v.optional(v.boolean()),
    ollamaLoadedModels: v.optional(v.array(v.string())),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    const existing = await ctx.db
      .query("infrastructure_status")
      .withIndex("by_host", (q) => q.eq("host", data.host))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("infrastructure_status", data);
    }
  },
});

// ── addPipelineSnapshot ───────────────────────────────────────────────────────

export const addPipelineSnapshot = mutation({
  args: {
    snapshotAt: v.number(),
    totalChannels: v.number(),
    totalVideos: v.number(),
    brandsInDb: v.number(),
    videosWithSponsors: v.number(),
    newVideos24h: v.number(),
    pendingReview: v.number(),
    sponsorDetectionPct: v.number(),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    await ctx.db.insert("pipeline_metrics", data);
  },
});

// ── upsertSponsorPipeline ─────────────────────────────────────────────────────

const sponsorPipelineArgs = {
  authToken: v.optional(v.string()),
  channelsDiscovered: v.number(),
  videoIdsHarvested: v.number(),
  descriptionsFetched: v.number(),
  detectionShardsDone: v.optional(v.number()),
  totalDescriptionShards: v.number(),
  totalBrands: v.number(),
  brands5plusChannels: v.number(),
  brands10plusChannels: v.number(),
  qualityChannels: v.number(),
  sponsoredVideos: v.optional(v.number()),
  topBrandsJson: v.optional(v.string()),
  pipelineFlowStatus: v.optional(v.string()),
  pipelineFlowQueueDepth: v.optional(v.number()),
  pipelineFlowLastActive: v.optional(v.string()),
  pipelineFlowCycles: v.optional(v.number()),
  step4bStatus: v.optional(v.string()),
  step4bRuns: v.optional(v.number()),
  step4bOngoingRuns: v.optional(v.number()),
  step4bOngoingShards: v.optional(v.number()),
  step4bOngoingVideos: v.optional(v.number()),
  step4bOngoingSponsored: v.optional(v.number()),
  step4bSponsoredCount: v.optional(v.number()),
  step4bTotalShards: v.optional(v.number()),
  step4bTotalVideos: v.optional(v.number()),
  step4bCompletedShards: v.optional(v.number()),
  step4bLastActive: v.optional(v.string()),
  step4bApiCalls: v.optional(v.number()),
  step4bApiCostUsd: v.optional(v.number()),
} as const;

export const upsertSponsorPipeline = mutation({
  args: sponsorPipelineArgs,
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    const existing = await ctx.db.query("sponsor_pipeline").order("desc").first();
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("sponsor_pipeline", data);
    }
  },
});

export const upsertSponsorPipelineInternal = internalMutation({
  args: sponsorPipelineArgs,
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    const existing = await ctx.db.query("sponsor_pipeline").order("desc").first();
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("sponsor_pipeline", data);
    }
  },
});

// ── updateTokenCapacity ───────────────────────────────────────────────────────

export const updateTokenCapacity = mutation({
  args: {
    profileId: v.string(),
    capacityPct: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("token_usage")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { capacityPct: args.capacityPct });
    }
  },
});

export const updateTokenCapacityInternal = internalMutation({
  args: {
    profileId: v.string(),
    capacityPct: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("token_usage")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { capacityPct: args.capacityPct });
    }
  },
});

// ── cleanupDuplicates ─────────────────────────────────────────────────────────

export const cleanupDuplicates = mutation({
  args: {},
  handler: async (ctx) => {
    // Remove all but the latest sponsor_pipeline row
    const rows = await ctx.db.query("sponsor_pipeline").order("desc").collect();
    for (const row of rows.slice(1)) {
      await ctx.db.delete(row._id);
    }
    // Remove all but the latest pipeline_stats row
    const stats = await ctx.db.query("pipeline_stats").order("desc").collect();
    for (const stat of stats.slice(1)) {
      await ctx.db.delete(stat._id);
    }
  },
});

// ── batchUpdate ───────────────────────────────────────────────────────────────

export const batchUpdate = mutation({
  args: {
    authToken: v.optional(v.string()),
    agents: v.optional(
      v.array(
        v.object({
          name: v.string(),
          host: v.string(),
          model: v.string(),
          status: v.string(),
          sessionCount: v.number(),
          lastActiveAt: v.number(),
          lastJobName: v.optional(v.string()),
        })
      )
    ),
    cronJobs: v.optional(
      v.array(
        v.object({
          jobId: v.string(),
          name: v.string(),
          agent: v.string(),
          schedule: v.string(),
          lastStatus: v.string(),
          runCount24h: v.number(),
          errorCount24h: v.number(),
          lastRunAt: v.optional(v.number()),
          lastError: v.optional(v.string()),
          avgDurationSec: v.optional(v.number()),
          description: v.optional(v.string()),
        })
      )
    ),
    infrastructure: v.optional(
      v.array(
        v.object({
          host: v.string(),
          online: v.boolean(),
          cpuPct: v.optional(v.number()),
          memUsedGb: v.optional(v.number()),
          memTotalGb: v.optional(v.number()),
          memCachedGb: v.optional(v.number()),
          diskUsedGb: v.optional(v.number()),
          activeProcesses: v.optional(v.number()),
          ollamaRunning: v.optional(v.boolean()),
          ollamaLoadedModels: v.optional(v.array(v.string())),
          topProcesses: v.optional(
            v.array(
              v.object({
                pid: v.number(),
                name: v.string(),
                cpuPct: v.number(),
                memMb: v.number(),
                memPct: v.number(),
                description: v.optional(v.string()),
              })
            )
          ),
        })
      )
    ),
    pipelineMetrics: v.optional(
      v.object({
        snapshotAt: v.number(),
        totalChannels: v.number(),
        totalVideos: v.number(),
        brandsInDb: v.number(),
        videosWithSponsors: v.number(),
        newVideos24h: v.number(),
        pendingReview: v.number(),
        sponsorDetectionPct: v.number(),
      })
    ),
    tokenUsage: v.optional(
      v.array(
        v.object({
          profileId: v.string(),
          label: v.string(),
          ending: v.string(),
          resetDay: v.string(),
          resetHourCt: v.number(),
          capacityPct: v.number(),
          rateLimitHits: v.number(),
          inCooldown: v.boolean(),
          cooldownMinutesLeft: v.number(),
          lastManualUpdate: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const { agents, cronJobs, infrastructure, pipelineMetrics, tokenUsage } = args;

    if (agents) {
      for (const agent of agents) {
        const existing = await ctx.db
          .query("agents")
          .withIndex("by_name", (q) => q.eq("name", agent.name))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, agent);
        } else {
          await ctx.db.insert("agents", agent);
        }
      }
    }

    if (cronJobs) {
      for (const job of cronJobs) {
        const { description, ...data } = job;
        const existing = await ctx.db
          .query("cron_jobs")
          .withIndex("by_jobId", (q) => q.eq("jobId", job.jobId))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, data);
        } else {
          await ctx.db.insert("cron_jobs", data);
        }
      }
    }

    if (infrastructure) {
      for (const infra of infrastructure) {
        const existing = await ctx.db
          .query("infrastructure_status")
          .withIndex("by_host", (q) => q.eq("host", infra.host))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, infra);
        } else {
          await ctx.db.insert("infrastructure_status", infra);
        }
      }
    }

    if (pipelineMetrics) {
      await ctx.db.insert("pipeline_metrics", pipelineMetrics);
    }

    if (tokenUsage) {
      for (const tu of tokenUsage) {
        const existing = await ctx.db
          .query("token_usage")
          .withIndex("by_profileId", (q) => q.eq("profileId", tu.profileId))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, tu);
        } else {
          await ctx.db.insert("token_usage", tu);
        }
      }
    }
  },
});

export const batchUpdateInternal = internalMutation({
  args: {
    authToken: v.optional(v.string()),
    agents: v.optional(v.any()),
    cronJobs: v.optional(v.any()),
    infrastructure: v.optional(v.any()),
    pipelineMetrics: v.optional(v.any()),
    tokenUsage: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { agents, cronJobs, infrastructure, pipelineMetrics, tokenUsage } = args;

    if (agents) {
      for (const agent of agents) {
        const existing = await ctx.db
          .query("agents")
          .withIndex("by_name", (q: any) => q.eq("name", agent.name))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, agent);
        } else {
          await ctx.db.insert("agents", agent);
        }
      }
    }

    if (cronJobs) {
      for (const job of cronJobs) {
        const existing = await ctx.db
          .query("cron_jobs")
          .withIndex("by_jobId", (q: any) => q.eq("jobId", job.jobId))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, job);
        } else {
          await ctx.db.insert("cron_jobs", job);
        }
      }
    }

    if (infrastructure) {
      for (const infra of infrastructure) {
        const existing = await ctx.db
          .query("infrastructure_status")
          .withIndex("by_host", (q: any) => q.eq("host", infra.host))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, infra);
        } else {
          await ctx.db.insert("infrastructure_status", infra);
        }
      }
    }

    if (pipelineMetrics) {
      await ctx.db.insert("pipeline_metrics", pipelineMetrics);
    }

    if (tokenUsage) {
      for (const tu of tokenUsage) {
        const existing = await ctx.db
          .query("token_usage")
          .withIndex("by_profileId", (q: any) => q.eq("profileId", tu.profileId))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, tu);
        } else {
          await ctx.db.insert("token_usage", tu);
        }
      }
    }
  },
});
