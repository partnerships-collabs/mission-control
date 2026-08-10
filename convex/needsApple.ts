import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listUnresolved = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("needs_apple")
      .filter((q) => q.eq(q.field("resolvedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const listUnresolvedInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("needs_apple")
      .filter((q) => q.eq(q.field("resolvedAt"), undefined))
      .order("desc")
      .collect();
  },
});

export const addItem = mutation({
  args: {
    fromAgent: v.string(),
    description: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("needs_apple", args);
  },
});

// Alias to match spec
export const addNeedsApple = mutation({
  args: {
    fromAgent: v.string(),
    description: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("needs_apple", args);
  },
});

export const addItemInternal = internalMutation({
  args: {
    fromAgent: v.string(),
    description: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("needs_apple", args);
  },
});

export const resolveItem = mutation({
  args: {
    id: v.id("needs_apple"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { resolvedAt: Date.now() });
  },
});

// Alias to match spec
export const resolveNeedsApple = mutation({
  args: {
    id: v.id("needs_apple"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { resolvedAt: Date.now() });
  },
});

export const resolveItemInternal = internalMutation({
  args: {
    id: v.id("needs_apple"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { resolvedAt: Date.now() });
  },
});
