import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").collect();
  },
});

export const upsertProject = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    owner: v.string(),
    status: v.string(),
    updatedBy: v.string(),
    description: v.optional(v.string()),
    link: v.optional(v.string()),
    blockingReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("projects", args);
    }
  },
});

export const upsertProjectInternal = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
    owner: v.string(),
    status: v.string(),
    updatedBy: v.string(),
    description: v.optional(v.string()),
    link: v.optional(v.string()),
    blockingReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("projects", args);
    }
  },
});

export const updateProjectStatus = mutation({
  args: {
    slug: v.string(),
    status: v.string(),
    updatedBy: v.string(),
    blockingReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        updatedBy: args.updatedBy,
        blockingReason: args.blockingReason,
      });
    }
  },
});

export const seedProjects = mutation({
  args: {},
  handler: async () => {
    return null;
  },
});
