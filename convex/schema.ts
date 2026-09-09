import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const revenueSourceHealthEntry = v.object({
  status: v.union(v.literal("success"), v.literal("failed")),
  amountUsd: v.optional(v.number()),
  fetchedAt: v.string(),
  reused: v.boolean(),
  error: v.optional(v.string()),
});

const revenueSourceHealth = v.object({
  close: revenueSourceHealthEntry,
  impact: revenueSourceHealthEntry,
  redventures: revenueSourceHealthEntry,
  adsbymoney: revenueSourceHealthEntry,
  msn: revenueSourceHealthEntry,
});

export default defineSchema(
  {
    revenue_all_time_runs: defineTable({
      collectorRunId: v.string(),
      snapshotDate: v.string(),
      collectorStartedAt: v.string(),
      collectorCompletedAt: v.string(),
      sourceHealth: revenueSourceHealth,
      receivedAt: v.number(),
      published: v.boolean(),
      issues: v.array(v.string()),
      totalAllTimeUsd: v.optional(v.number()),
    }).index('by_run', ['collectorRunId'])
      .index('by_received_at', ['receivedAt'])
      .index('by_published_completed', ['published', 'collectorCompletedAt']),
    activity_events: defineTable({
      agent: v.string(),
      type: v.string(),
      title: v.string(),
      description: v.string(),
      status: v.string(),
      source: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      occurredAt: v.optional(v.number()),
    })
      .index("by_agent", ["agent"])
      .index("by_type", ["type"])
      .index("by_occurredAt", ["occurredAt"]),

    agents: defineTable({
      name: v.string(),
      host: v.string(),
      model: v.string(),
      status: v.string(),
      sessionCount: v.number(),
      lastActiveAt: v.number(),
      lastJobName: v.optional(v.string()),
    }).index("by_name", ["name"]),

    cron_jobs: defineTable({
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
      .index("by_jobId", ["jobId"])
      .index("by_agent", ["agent"])
      .index("by_status", ["lastStatus"]),

    // Real table name from prod deployment
    infrastructure_status: defineTable({
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
      topProcesses: v.optional(v.any()),
    }).index("by_host", ["host"]),

    // Real table name from prod deployment (190k+ documents)
    pipeline_metrics: defineTable({
      snapshotAt: v.number(),
      totalChannels: v.number(),
      totalVideos: v.number(),
      brandsInDb: v.number(),
      videosWithSponsors: v.number(),
      newVideos24h: v.number(),
      pendingReview: v.number(),
      sponsorDetectionPct: v.number(),
    }).index("by_snapshotAt", ["snapshotAt"]),

    sponsor_pipeline: defineTable({
      key: v.optional(v.string()),
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
    }).index("by_key", ["key"]),

    revenue_snapshots: defineTable({
      snapshotDate: v.string(),
      totalYtdUsd: v.number(),
      goalUsd: v.number(),
      last30DayUsd: v.number(),
      projectedAnnualUsd: v.number(),
      updatedAt: v.optional(v.number()),
      sources: v.object({
        close: v.optional(v.number()),
        copper: v.optional(v.number()),
        impact: v.optional(v.number()),
        adsbymoney: v.optional(v.number()),
        redventures: v.optional(v.number()),
        msn: v.optional(v.number()),
      }),
      verificationStatus: v.optional(v.literal("verified")),
      verifiedAt: v.optional(v.number()),
      collectorRunId: v.optional(v.string()),
      collectorStartedAt: v.optional(v.string()),
      collectorCompletedAt: v.optional(v.string()),
      closeRefreshedAt: v.optional(v.string()),
      sourceHealth: v.optional(revenueSourceHealth),
    })
      .index("by_date", ["snapshotDate"])
      .index("by_verification_date", ["verificationStatus", "snapshotDate"]),

    revenue_collection_runs: defineTable({
      collectorRunId: v.string(),
      snapshotDate: v.string(),
      collectorStartedAt: v.string(),
      collectorCompletedAt: v.string(),
      receivedAt: v.number(),
      goalUsd: v.number(),
      closeLast30DayUsd: v.optional(v.number()),
      verificationStatus: v.union(
        v.literal("verified"),
        v.literal("degraded"),
      ),
      published: v.boolean(),
      totalYtdUsd: v.optional(v.number()),
      issues: v.array(v.string()),
      sourceHealth: revenueSourceHealth,
      publishedSnapshotId: v.optional(v.id("revenue_snapshots")),
    })
      .index("by_run_id", ["collectorRunId"])
      .index("by_received_at", ["receivedAt"])
      .index("by_verification_received_at", [
        "verificationStatus",
        "receivedAt",
      ]),

    revenue_close_refreshes: defineTable({
      snapshotDate: v.string(),
      recordedAt: v.number(),
      closeYtdUsd: v.number(),
      closeLast30DayUsd: v.number(),
      authoritative: v.literal(false),
      published: v.literal(false),
      baseStatus: v.union(
        v.literal("verified_base"),
        v.literal("no_verified_base"),
        v.literal("different_revenue_year"),
        v.literal("incomplete_verified_base"),
      ),
      baseVerifiedSnapshotId: v.optional(v.id("revenue_snapshots")),
      baseVerifiedSnapshotDate: v.optional(v.string()),
      diagnosticTotalYtdUsd: v.optional(v.number()),
      diagnosticLast30DayUsd: v.optional(v.number()),
      diagnosticProjectedAnnualUsd: v.optional(v.number()),
    }).index("by_recorded_at", ["recordedAt"]),

    needs_apple: defineTable({
      fromAgent: v.string(),
      description: v.string(),
      context: v.optional(v.string()),
      resolved: v.optional(v.number()),
      resolvedAt: v.optional(v.number()),
    }).index("by_resolved", ["resolved"]),

    projects: defineTable({
      slug: v.string(),
      name: v.string(),
      owner: v.string(),
      status: v.string(),
      updatedBy: v.string(),
      description: v.optional(v.string()),
      link: v.optional(v.string()),
      blockingReason: v.optional(v.string()),
    })
      .index("by_slug", ["slug"])
      .index("by_status", ["status"]),

    proposals: defineTable({
      slug: v.string(),
      brandName: v.string(),
      agentOwner: v.string(),
      status: v.string(),
      docUrl: v.optional(v.string()),
      sentAt: v.optional(v.number()),
    })
      .index("by_slug", ["slug"])
      .index("by_status", ["status"]),

    pipeline_stats: defineTable({
      key: v.optional(v.string()),
      proposalValue: v.number(),
      negotiationValue: v.number(),
      contractingValue: v.number(),
      dealCounts: v.object({
        proposal: v.number(),
        negotiation: v.number(),
        contracting: v.number(),
      }),
    }).index("by_key", ["key"]),

    memory_docs: defineTable({
      agent: v.string(),
      filename: v.string(),
      filepath: v.string(),
      content: v.string(),
      sizeBytes: v.optional(v.number()),
    })
      .index("by_agent", ["agent"])
      .index("by_filepath", ["filepath"])
      .searchIndex("search_content", {
        searchField: "content",
        filterFields: ["agent"],
      }),

    memory_write_queue: defineTable({
      agent: v.string(),
      filename: v.string(),
      filepath: v.string(),
      content: v.string(),
      status: v.optional(v.string()),
      errorMsg: v.optional(v.string()),
      resolvedAt: v.optional(v.number()),
    })
      .index("by_status", ["status"])
      .index("by_filepath", ["filepath"]),

    token_usage: defineTable({
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
    }).index("by_profileId", ["profileId"]),

    calendar_events: defineTable({
      eventId: v.string(),
      title: v.string(),
      startMs: v.number(),
      endMs: v.number(),
      allDay: v.boolean(),
      calendarName: v.string(),
      calendarType: v.string(),
      calendarColor: v.string(),
      description: v.optional(v.string()),
      location: v.optional(v.string()),
      htmlLink: v.optional(v.string()),
      attendees: v.optional(v.array(v.string())),
    })
      .index("by_eventId", ["eventId"])
      .index("by_time", ["startMs", "endMs"])
      .index("by_type_start", ["calendarType", "startMs"]),

    cost_tracking: defineTable({
      date: v.optional(v.string()),
      agent: v.optional(v.string()),
      cost: v.optional(v.number()),
      tokens: v.optional(v.number()),
      model: v.optional(v.string()),
    })
      .index("by_date", ["date"])
      .index("by_agent_date", ["agent", "date"]),
  },
  { schemaValidation: false }
);
