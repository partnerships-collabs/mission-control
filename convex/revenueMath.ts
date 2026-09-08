export const REVENUE_SOURCE_NAMES = [
  "close",
  "impact",
  "redventures",
  "adsbymoney",
  "msn",
] as const;

export type RevenueSourceName = (typeof REVENUE_SOURCE_NAMES)[number];

export type RevenueSources = {
  close?: number;
  copper?: number;
  impact?: number;
  adsbymoney?: number;
  redventures?: number;
  msn?: number;
};

export type CompleteRevenueSources = Record<RevenueSourceName, number>;

export type RevenueSourceHealthEntry = {
  status: "success" | "failed";
  amountUsd?: number;
  fetchedAt: string;
  reused: boolean;
  error?: string;
};

export type RevenueSourceHealth = Record<
  RevenueSourceName,
  RevenueSourceHealthEntry
>;

export type RevenueAttemptEvaluation = {
  publishable: boolean;
  issues: string[];
  sources: CompleteRevenueSources | null;
};

export type RevenueSnapshotMetrics = {
  totalYtdUsd: number;
  last30DayUsd: number;
  projectedAnnualUsd: number;
};

export type RevenueScheduleHealth = {
  timeZone: "America/Chicago";
  scheduledRunLocalTime: "12:00";
  retryDeadlineLocalTime: "13:30";
  currentDate: string;
  currentLocalTime: string;
  phase: "before_retry_deadline" | "current_day_required";
  minimumAcceptableAttemptDate: string;
  lastAttemptDate: string | null;
  lastAttemptOnSchedule: boolean;
};

export type RevenueDisplaySelection<T> = {
  snapshot: T | null;
  status: "verified" | "legacy_unverified" | "unavailable";
};

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
export const REVENUE_SOURCE_FRESHNESS_MS = 36 * 60 * 60 * 1000;
export const REVENUE_SCHEDULE_TIME_ZONE = "America/Chicago" as const;
export const REVENUE_SCHEDULED_RUN_LOCAL_TIME = "12:00" as const;
export const REVENUE_RETRY_DEADLINE_LOCAL_TIME = "13:30" as const;

const SAFE_REVENUE_ERROR_MESSAGES = {
  credentialsUnavailable: "Connector credentials are unavailable.",
  authenticationFailed: "Connector authentication failed.",
  timedOut: "Connector request timed out.",
  rateLimited: "Connector rate limit reached.",
  unavailable: "Connector service is unavailable.",
  noData: "Connector returned no revenue data.",
  invalidData: "Connector returned invalid revenue data.",
  requestFailed: "Connector request failed.",
  generic: "Connector collection failed.",
} as const;

export function mergeCloseSource(
  current: RevenueSources,
  closeYtdUsd: number,
): RevenueSources {
  const merged = { ...current, close: closeYtdUsd };
  delete merged.copper;
  return merged;
}

export function deriveCloseRefreshDiagnostic(
  verifiedSources: RevenueSources,
  closeYtdUsd: number,
  closeLast30DayUsd: number,
  observedSnapshotDate: string,
): RevenueSnapshotMetrics | null {
  if (
    !Number.isFinite(closeYtdUsd) ||
    closeYtdUsd < 0 ||
    !Number.isFinite(closeLast30DayUsd) ||
    closeLast30DayUsd < 0
  ) {
    return null;
  }
  const diagnosticSources = mergeCloseSource(verifiedSources, closeYtdUsd);
  if (
    !REVENUE_SOURCE_NAMES.every((sourceName) => {
      const amount = diagnosticSources[sourceName];
      return typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
    })
  ) {
    return null;
  }
  return deriveRevenueSnapshotMetrics(
    diagnosticSources as CompleteRevenueSources,
    observedSnapshotDate,
    closeLast30DayUsd,
  );
}

export function sumRevenueSources(sources: RevenueSources): number {
  return Object.values(sources).reduce(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0,
  );
}

export function calculateLegacyRevenueTotal(
  sources: CompleteRevenueSources,
): number | null {
  if (
    !REVENUE_SOURCE_NAMES.every((sourceName) => {
      const amount = sources[sourceName];
      return Number.isFinite(amount) && amount >= 0;
    })
  ) {
    return null;
  }
  return sumRevenueSources(sources);
}

export function legacyRevenueIngestionAllowed(
  hasVerifiedSnapshot: boolean,
  hasVerifiedRun: boolean,
): boolean {
  return !hasVerifiedSnapshot && !hasVerifiedRun;
}

export function safeRevenueSourceError(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.toLowerCase();
  if (/credential|not configured|secret (?:is )?unavailable/.test(normalized)) {
    return SAFE_REVENUE_ERROR_MESSAGES.credentialsUnavailable;
  }
  if (/\b(?:401|403|unauthorized|forbidden|authentication|permission denied)\b/.test(normalized)) {
    return SAFE_REVENUE_ERROR_MESSAGES.authenticationFailed;
  }
  if (/\b(?:timeout|timed out)\b/.test(normalized)) {
    return SAFE_REVENUE_ERROR_MESSAGES.timedOut;
  }
  if (/\b(?:429|rate limit|too many requests)\b/.test(normalized)) {
    return SAFE_REVENUE_ERROR_MESSAGES.rateLimited;
  }
  if (/\b(?:502|503|504|service unavailable)\b/.test(normalized)) {
    return SAFE_REVENUE_ERROR_MESSAGES.unavailable;
  }
  if (/\b(?:blank|empty|no revenue data|no (?:daily )?records|no campaigns|no commission rows|no won opportunities)\b/.test(normalized)) {
    return SAFE_REVENUE_ERROR_MESSAGES.noData;
  }
  if (/\b(?:invalid|malformed|missing|non-numeric|non-usd|duplicate)\b/.test(normalized)) {
    return SAFE_REVENUE_ERROR_MESSAGES.invalidData;
  }
  if (/\b(?:request failed|http error|connection error)\b/.test(normalized)) {
    return SAFE_REVENUE_ERROR_MESSAGES.requestFailed;
  }
  return SAFE_REVENUE_ERROR_MESSAGES.generic;
}

function parseIsoTimestamp(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateRevenueAttempt(
  sourceHealth: RevenueSourceHealth,
  collectorStartedAt: string,
  collectorCompletedAt: string,
  snapshotDate: string,
  closeLast30DayUsd?: number,
): RevenueAttemptEvaluation {
  const issues: string[] = [];
  const startedAt = parseIsoTimestamp(collectorStartedAt);
  const completedAt = parseIsoTimestamp(collectorCompletedAt);

  if (startedAt === null) issues.push("collector_started_at_invalid");
  if (completedAt === null) issues.push("collector_completed_at_invalid");
  if (startedAt !== null && completedAt !== null) {
    if (completedAt < startedAt) {
      issues.push("collector_completed_before_started");
    }
    if (chicagoDateString(new Date(completedAt)) !== snapshotDate) {
      issues.push("snapshot_date_mismatch");
    }
  }

  if (!Number.isFinite(closeLast30DayUsd) || (closeLast30DayUsd as number) < 0) {
    issues.push("close_last_30_day_missing_or_invalid");
  }

  const amounts: Partial<CompleteRevenueSources> = {};
  for (const sourceName of REVENUE_SOURCE_NAMES) {
    const health = sourceHealth[sourceName];
    if (health.status !== "success") {
      issues.push(`${sourceName}_failed`);
    }
    if (health.reused) {
      issues.push(`${sourceName}_reused`);
    }
    if (health.error) {
      issues.push(`${sourceName}_reported_error`);
    }

    if (
      typeof health.amountUsd !== "number" ||
      !Number.isFinite(health.amountUsd) ||
      health.amountUsd < 0
    ) {
      issues.push(`${sourceName}_amount_missing_or_invalid`);
    } else {
      amounts[sourceName] = health.amountUsd;
    }

    const fetchedAt = parseIsoTimestamp(health.fetchedAt);
    if (fetchedAt === null) {
      issues.push(`${sourceName}_fetched_at_invalid`);
    } else if (startedAt !== null && completedAt !== null) {
      if (fetchedAt < startedAt - CLOCK_SKEW_TOLERANCE_MS) {
        issues.push(`${sourceName}_fetched_before_run`);
      }
      if (fetchedAt > completedAt + CLOCK_SKEW_TOLERANCE_MS) {
        issues.push(`${sourceName}_fetched_after_run`);
      }
    }
  }

  const sources = REVENUE_SOURCE_NAMES.every(
    (sourceName) => typeof amounts[sourceName] === "number",
  )
    ? (amounts as CompleteRevenueSources)
    : null;

  return {
    publishable: issues.length === 0 && sources !== null,
    issues,
    sources,
  };
}

export function augmentRevenueAttemptWithLastVerified(
  sourceHealth: RevenueSourceHealth,
  lastVerifiedSources?: RevenueSources,
): RevenueSourceHealth {
  return Object.fromEntries(
    REVENUE_SOURCE_NAMES.map((sourceName) => {
      const health = sourceHealth[sourceName];
      const amountIsUsable =
        typeof health.amountUsd === "number" &&
        Number.isFinite(health.amountUsd) &&
        health.amountUsd >= 0;
      if (health.status === "success" && amountIsUsable) {
        return [sourceName, { ...health }];
      }

      const recorded = { ...health };
      delete recorded.amountUsd;
      const priorAmount = lastVerifiedSources?.[sourceName];
      if (
        typeof priorAmount === "number" &&
        Number.isFinite(priorAmount) &&
        priorAmount >= 0
      ) {
        return [sourceName, { ...recorded, amountUsd: priorAmount, reused: true }];
      }
      return [sourceName, { ...recorded, reused: false }];
    }),
  ) as RevenueSourceHealth;
}

export function selectRevenueDisplaySnapshot<
  T extends { verificationStatus?: string },
>(snapshotsNewestFirst: T[]): RevenueDisplaySelection<T> {
  const verified = snapshotsNewestFirst.find(
    (snapshot) => snapshot.verificationStatus === "verified",
  );
  if (verified) return { snapshot: verified, status: "verified" };

  const legacy = snapshotsNewestFirst.find(
    (snapshot) => snapshot.verificationStatus === undefined,
  );
  if (legacy) return { snapshot: legacy, status: "legacy_unverified" };
  return { snapshot: null, status: "unavailable" };
}

export function revenueSourceFreshness(
  health: RevenueSourceHealthEntry,
  nowMs: number,
  maxAgeMs = REVENUE_SOURCE_FRESHNESS_MS,
): "fresh" | "stale" | "failed" | "reused" | "unknown" {
  if (health.status === "failed") return "failed";
  if (health.reused) return "reused";
  const fetchedAt = parseIsoTimestamp(health.fetchedAt);
  if (fetchedAt === null || fetchedAt > nowMs + CLOCK_SKEW_TOLERANCE_MS) {
    return "unknown";
  }
  return nowMs - fetchedAt <= maxAgeMs ? "fresh" : "stale";
}

function chicagoDateTimeParts(date: Date): {
  date: string;
  time: string;
  minutesAfterMidnight: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REVENUE_SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    minutesAfterMidnight: hour * 60 + minute,
  };
}

export function revenueScheduleHealth(
  lastAttemptDate: string | null,
  now = new Date(),
): RevenueScheduleHealth {
  const current = chicagoDateTimeParts(now);
  const deadlineMinutes = 13 * 60 + 30;
  const currentDayRequired = current.minutesAfterMidnight >= deadlineMinutes;
  const minimumAcceptableAttemptDate = currentDayRequired
    ? current.date
    : shiftDate(current.date, -1);
  const lastAttemptOnSchedule = Boolean(
    lastAttemptDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(lastAttemptDate) &&
      lastAttemptDate >= minimumAcceptableAttemptDate &&
      lastAttemptDate <= current.date,
  );

  return {
    timeZone: REVENUE_SCHEDULE_TIME_ZONE,
    scheduledRunLocalTime: REVENUE_SCHEDULED_RUN_LOCAL_TIME,
    retryDeadlineLocalTime: REVENUE_RETRY_DEADLINE_LOCAL_TIME,
    currentDate: current.date,
    currentLocalTime: current.time,
    phase: currentDayRequired
      ? "current_day_required"
      : "before_retry_deadline",
    minimumAcceptableAttemptDate,
    lastAttemptDate,
    lastAttemptOnSchedule,
  };
}

export function estimateLast30DayRevenue(
  totalYtdUsd: number,
  closeYtdUsd: number,
  closeLast30DayUsd: number,
  dayOfYear: number,
): number {
  if (closeYtdUsd > 0) {
    const nonCloseYtdUsd = totalYtdUsd - closeYtdUsd;
    return closeLast30DayUsd + nonCloseYtdUsd * (closeLast30DayUsd / closeYtdUsd);
  }
  return dayOfYear > 0 ? (totalYtdUsd / dayOfYear) * 30 : 0;
}

export function deriveRevenueSnapshotMetrics(
  sources: CompleteRevenueSources,
  snapshotDate: string,
  closeLast30DayUsd: number,
): RevenueSnapshotMetrics {
  const totalYtdUsd = sumRevenueSources(sources);
  const dayOfYear = dayOfYearForDate(snapshotDate);
  return {
    totalYtdUsd,
    last30DayUsd: estimateLast30DayRevenue(
      totalYtdUsd,
      sources.close,
      closeLast30DayUsd,
      dayOfYear,
    ),
    projectedAnnualUsd: (totalYtdUsd / dayOfYear) * 365,
  };
}

export function chicagoDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayOfYearForDate(dateString: string): number {
  const yearStart = Date.parse(`${dateString.slice(0, 4)}-01-01T00:00:00Z`);
  const date = Date.parse(`${dateString}T00:00:00Z`);
  return Math.floor((date - yearStart) / 86_400_000) + 1;
}

export function isSameRevenueYear(leftDate: string, rightDate: string): boolean {
  return leftDate.slice(0, 4) === rightDate.slice(0, 4);
}
