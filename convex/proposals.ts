import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByStatus = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("proposals")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    return await ctx.db.query("proposals").collect();
  },
});

export const upsertProposal = mutation({
  args: {
    slug: v.string(),
    brandName: v.string(),
    agentOwner: v.string(),
    status: v.string(),
    docUrl: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("proposals")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("proposals", args);
    }
  },
});

export const upsertProposalInternal = internalMutation({
  args: {
    slug: v.string(),
    brandName: v.string(),
    agentOwner: v.string(),
    status: v.string(),
    docUrl: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("proposals")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("proposals", args);
    }
  },
});
