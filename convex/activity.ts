import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listActivityEvents = query({
  args: {
    agentFilter: v.optional(v.string()),
    eventType: v.optional(v.string()),
    timeframe: v.optional(v.union(v.literal("all"), v.literal("today"))),
  },
  handler: async (ctx, args) => {
    let events = await ctx.db.query("activity_events").order("desc").take(200);

    if (args.agentFilter) {
      events = events.filter((e) => e.agent === args.agentFilter);
    }
    if (args.eventType) {
      events = events.filter((e) => e.type === args.eventType);
    }
    if (args.timeframe === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startMs = startOfDay.getTime();
      events = events.filter((e) => (e.occurredAt ?? e._creationTime) >= startMs);
    }

    return events;
  },
});

export const logActivityEvent = mutation({
  args: {
    agent: v.string(),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    status: v.string(),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    occurredAt: v.optional(v.number()),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    await ctx.db.insert("activity_events", data);
  },
});

export const logActivityEventInternal = internalMutation({
  args: {
    agent: v.string(),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    status: v.string(),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    occurredAt: v.optional(v.number()),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    await ctx.db.insert("activity_events", data);
  },
});

export const seedActivityEvents = mutation({
  args: {},
  handler: async (ctx) => {
    // Seed is a no-op in production; data is collected live
    return null;
  },
});
