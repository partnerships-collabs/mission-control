import { v } from 'convex/values';
import { monthlyRevenueValidator } from './monthlyRevenueValidator';

const healthEntry = v.object({ status:v.union(v.literal('success'),v.literal('failed')),
  amountUsd:v.optional(v.number()), fetchedAt:v.string(), reused:v.boolean(), error:v.optional(v.string()) });
export const unifiedSources = v.object({close:v.number(),impact:v.number(),redventures:v.number(),
  adsbymoney:v.number(),msn:v.number(),monday_affiliates:v.number()});
export const unifiedHealth = v.object({close:healthEntry,impact:healthEntry,redventures:healthEntry,
  adsbymoney:healthEntry,msn:healthEntry,monday_affiliates:healthEntry});
export const unifiedRunFields = {
  collectorRunId:v.string(), snapshotDate:v.string(), collectorStartedAt:v.string(), collectorCompletedAt:v.string(),
  mode:v.union(v.literal('shadow'),v.literal('publish')), goalUsd:v.number(), sourceHealth:unifiedHealth,
  mondayAuditId:v.optional(v.string()),
  closeDays:v.array(v.object({date:v.string(),amountCents:v.number()})),
  platformMonths:v.array(v.object({month:v.string(),impactCents:v.number(),redventuresCents:v.number(),adsbymoneyCents:v.number()})),
};
export const unifiedSnapshotValidator = v.object({
  sources:unifiedSources, ytdSources:unifiedSources, monthly:monthlyRevenueValidator,
  totalAllTimeUsd:v.number(),totalYtdUsd:v.number(),closeLast30DayUsd:v.number(),
  last30DayUsd:v.number(),projectedAnnualUsd:v.number(),
});
