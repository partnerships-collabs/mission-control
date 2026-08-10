import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertEvent = mutation({
  args: {
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
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    const existing = await ctx.db
      .query("calendar_events")
      .withIndex("by_eventId", (q) => q.eq("eventId", data.eventId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("calendar_events", data);
    }
  },
});

export const upsertEventInternal = internalMutation({
  args: {
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
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    const existing = await ctx.db
      .query("calendar_events")
      .withIndex("by_eventId", (q) => q.eq("eventId", data.eventId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("calendar_events", data);
    }
  },
});

export const deleteStaleEvents = mutation({
  args: {
    activeEventIds: v.array(v.string()),
    calendarType: v.optional(v.string()),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = new Set(args.activeEventIds);
    let events = await ctx.db.query("calendar_events").collect();
    if (args.calendarType) {
      events = events.filter((e) => e.calendarType === args.calendarType);
    }
    for (const event of events) {
      if (!active.has(event.eventId)) {
        await ctx.db.delete(event._id);
      }
    }
  },
});

export const deleteStaleEventsInternal = internalMutation({
  args: {
    activeEventIds: v.array(v.string()),
    calendarType: v.optional(v.string()),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = new Set(args.activeEventIds);
    let events = await ctx.db.query("calendar_events").collect();
    if (args.calendarType) {
      events = events.filter((e) => e.calendarType === args.calendarType);
    }
    for (const event of events) {
      if (!active.has(event.eventId)) {
        await ctx.db.delete(event._id);
      }
    }
  },
});

export const listEvents = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
    calendarType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let events = await ctx.db
      .query("calendar_events")
      .withIndex("by_time", (q) =>
        q.gte("startMs", args.startMs).lte("startMs", args.endMs)
      )
      .collect();
    if (args.calendarType) {
      events = events.filter((e) => e.calendarType === args.calendarType);
    }
    return events;
  },
});
