import { v } from 'convex/values';
const sources = v.object({ close:v.optional(v.number()), impact:v.optional(v.number()), redventures:v.optional(v.number()),
  adsbymoney:v.optional(v.number()), msn:v.optional(v.number()), monday_affiliates:v.optional(v.number()) });
export const monthlyRevenueValidator = v.object({ months:v.array(v.object({month:v.string(), sources})), undatedSources:sources });
