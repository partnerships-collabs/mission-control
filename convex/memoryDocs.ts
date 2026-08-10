import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertDoc = mutation({
  args: {
    agent: v.string(),
    filename: v.string(),
    filepath: v.string(),
    content: v.string(),
    sizeBytes: v.number(),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    const existing = await ctx.db
      .query("memory_docs")
      .withIndex("by_filepath", (q) => q.eq("filepath", data.filepath))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("memory_docs", data);
    }
  },
});

export const upsertDocInternal = internalMutation({
  args: {
    agent: v.string(),
    filename: v.string(),
    filepath: v.string(),
    content: v.string(),
    sizeBytes: v.optional(v.number()),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { authToken, ...data } = args;
    const existing = await ctx.db
      .query("memory_docs")
      .withIndex("by_filepath", (q) => q.eq("filepath", data.filepath))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("memory_docs", data);
    }
  },
});

export const searchDocs = query({
  args: {
    term: v.string(),
    agent: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    let results = await ctx.db
      .query("memory_docs")
      .withSearchIndex("search_content", (q) => {
        let sq = q.search("content", args.term);
        if (args.agent) sq = sq.eq("agent", args.agent);
        return sq;
      })
      .take(limit);
    return results;
  },
});

export const listDocs = query({
  args: { agent: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.agent) {
      return await ctx.db
        .query("memory_docs")
        .withIndex("by_agent", (q) => q.eq("agent", args.agent!))
        .collect();
    }
    return await ctx.db.query("memory_docs").collect();
  },
});

export const queueWrite = mutation({
  args: {
    agent: v.string(),
    filename: v.string(),
    filepath: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("memory_write_queue", { ...args, status: "pending" });
  },
});

export const getPendingWrites = query({
  args: { authToken: v.optional(v.string()) },
  handler: async (ctx) => {
    return await ctx.db
      .query("memory_write_queue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

export const getPendingWritesInternal = internalQuery({
  args: { authToken: v.optional(v.string()) },
  handler: async (ctx) => {
    return await ctx.db
      .query("memory_write_queue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

export const resolveWrite = mutation({
  args: {
    id: v.id("memory_write_queue"),
    success: v.boolean(),
    errorMsg: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.success ? "done" : "error",
      errorMsg: args.errorMsg,
      resolvedAt: Date.now(),
    });
  },
});

export const resolveWriteInternal = internalMutation({
  args: {
    id: v.id("memory_write_queue"),
    success: v.boolean(),
    errorMsg: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.success ? "done" : "error",
      errorMsg: args.errorMsg,
      resolvedAt: Date.now(),
    });
  },
});

export const getWriteStatus = query({
  args: { id: v.id("memory_write_queue") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const deleteStaleDocs = mutation({
  args: {
    activeFilepaths: v.array(v.string()),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = new Set(args.activeFilepaths);
    const all = await ctx.db.query("memory_docs").collect();
    for (const doc of all) {
      if (!active.has(doc.filepath)) {
        await ctx.db.delete(doc._id);
      }
    }
  },
});
