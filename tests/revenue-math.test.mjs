import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fetchCloseWonTotal } from "../convex/closeRevenue.ts";
import {
  hasValidActivityToken,
  verifyCloseWebhookSignature,
} from "../convex/httpSecurity.ts";
import {
  REVENUE_SOURCE_NAMES,
  augmentRevenueAttemptWithLastVerified,
  calculateLegacyRevenueTotal,
  dayOfYearForDate,
  deriveCloseRefreshDiagnostic,
  deriveRevenueSnapshotMetrics,
  evaluateRevenueAttempt,
  estimateLast30DayRevenue,
  isSameRevenueYear,
  legacyRevenueIngestionAllowed,
  mergeCloseSource,
  revenueSourceFreshness,
  revenueScheduleHealth,
  safeRevenueSourceError,
  selectRevenueDisplaySnapshot,
  shiftDate,
  sumRevenueSources,
} from "../convex/revenueMath.ts";

function successfulSourceHealth(overrides = {}) {
  const fetchedAt = "2026-09-08T17:00:30.000Z";
  return Object.fromEntries(
    REVENUE_SOURCE_NAMES.map((sourceName, index) => [
      sourceName,
      {
        status: "success",
        amountUsd: (index + 1) * 100,
        fetchedAt,
        reused: false,
        ...overrides[sourceName],
      },
    ]),
  );
}

test("activity auth fails closed and accepts supported secret headers", () => {
  assert.equal(hasValidActivityToken(new Request("https://example.test"), undefined), false);
  assert.equal(
    hasValidActivityToken(
      new Request("https://example.test", {
        headers: { "x-activity-secret": "expected" },
      }),
      "expected",
    ),
    true,
  );
  assert.equal(
    hasValidActivityToken(
      new Request("https://example.test", {
        headers: { authorization: "Bearer expected" },
      }),
      "expected",
    ),
    true,
  );
});

test("verifies Close's hex-key timestamp-plus-body HMAC contract", async () => {
  const signatureKey =
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
  const timestamp = "1544271440";
  const body = '{"event":{"object_type":"opportunity"}}';
  const signature =
    "fd214c8e984fa3a9b1b95b1c9ffe14992c923b83c85044db7f8ede77c952e655";
  const request = new Request("https://example.test", {
    headers: {
      "close-sig-hash": signature,
      "close-sig-timestamp": timestamp,
    },
  });

  assert.equal(await verifyCloseWebhookSignature(request, body, signatureKey), true);
  assert.equal(await verifyCloseWebhookSignature(request, `${body} `, signatureKey), false);
  assert.equal(
    await verifyCloseWebhookSignature(
      new Request("https://example.test"),
      body,
      signatureKey,
    ),
    false,
  );
});

test("paginates filtered Close results and converts every page from cents", async () => {
  const calls = [];
  const pages = [
    {
      data: [
        {
          id: "one",
          value: 123456,
          value_currency: "USD",
          value_period: "one_time",
        },
      ],
      has_more: true,
    },
    {
      data: [
        {
          id: "two",
          value: null,
          value_currency: "USD",
          value_period: "one_time",
        },
      ],
      has_more: false,
    },
  ];
  const request = async (input) => {
    calls.push(new URL(input));
    return new Response(JSON.stringify(pages[calls.length - 1]), { status: 200 });
  };

  const total = await fetchCloseWonTotal(
    "api-key",
    "2026-01-01",
    "2026-08-25",
    request,
  );

  assert.equal(total, 1234.56);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get("status_type"), "won");
  assert.equal(calls[0].searchParams.get("date_won__gte"), "2026-01-01");
  assert.equal(calls[0].searchParams.get("date_won__lte"), "2026-08-25");
  assert.equal(calls[0].searchParams.get("_skip"), "0");
  assert.equal(calls[1].searchParams.get("_skip"), "100");
  assert.equal(
    calls[0].searchParams.get("_fields"),
    "id,value,value_currency,value_period",
  );
});

test("Close aggregation rejects non-USD and recurring opportunities with counts", async () => {
  const request = async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            id: "missing-currency",
            value: 100,
            value_period: "one_time",
          },
          {
            id: "wrong-semantics",
            value: 200,
            value_currency: "EUR",
            value_period: "monthly",
          },
        ],
        has_more: false,
      }),
      { status: 200 },
    );

  await assert.rejects(
    fetchCloseWonTotal("api-key", "2026-01-01", "2026-09-08", request),
    (error) => {
      assert.match(error.message, /opportunities=2/);
      assert.match(error.message, /invalidCurrency=2/);
      assert.match(error.message, /invalidValuePeriod=1/);
      assert.doesNotMatch(error.message, /missing-currency|wrong-semantics|EUR/);
      return true;
    },
  );
});

test("Close aggregation permits an empty rolling window only when requested", async () => {
  const request = async () =>
    new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });

  await assert.rejects(
    fetchCloseWonTotal("api-key", "2026-01-01", "2026-09-08", request),
    /no won opportunities/,
  );
  assert.equal(
    await fetchCloseWonTotal(
      "api-key",
      "2026-08-10",
      "2026-09-08",
      request,
      false,
    ),
    0,
  );
});

test("replaces Close while preserving every non-Close source", () => {
  const merged = mergeCloseSource(
    {
      copper: 10,
      close: 20,
      impact: 30,
      adsbymoney: 40,
      redventures: 50,
      msn: 60,
    },
    1234.56,
  );

  assert.deepEqual(merged, {
    close: 1234.56,
    impact: 30,
    adsbymoney: 40,
    redventures: 50,
    msn: 60,
  });
  assert.equal(sumRevenueSources(merged), 1414.56);
});

test("Close-only diagnostics leave the public verified snapshot unchanged", () => {
  const publicVerifiedSnapshot = {
    totalYtdUsd: 2_400,
    sources: {
      close: 1_000,
      impact: 200,
      redventures: 300,
      adsbymoney: 400,
      msn: 500,
    },
    verificationStatus: "verified",
  };
  const before = structuredClone(publicVerifiedSnapshot);

  const diagnostic = deriveCloseRefreshDiagnostic(
    publicVerifiedSnapshot.sources,
    1_250,
    100,
    "2026-09-08",
  );

  assert.deepEqual(publicVerifiedSnapshot, before);
  assert.equal(diagnostic?.totalYtdUsd, 2_650);
  assert.equal(
    deriveCloseRefreshDiagnostic(
      { ...publicVerifiedSnapshot.sources, msn: undefined },
      1_250,
      100,
      "2026-09-08",
    ),
    null,
  );
});

test("Close-only persistence cannot write or patch public snapshots", () => {
  const source = readFileSync(
    new URL("../convex/revenue.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("export const recordCloseRefreshInternal");
  const end = source.indexOf("export const migrateRemoveCopper", start);
  assert.ok(start >= 0 && end > start);
  const closeOnlyMutation = source.slice(start, end);

  assert.match(
    closeOnlyMutation,
    /ctx\.db\.insert\("revenue_close_refreshes"/,
  );
  assert.doesNotMatch(closeOnlyMutation, /ctx\.db\.(?:patch|replace|delete)\(/);
  assert.doesNotMatch(
    closeOnlyMutation,
    /ctx\.db\.insert\("revenue_snapshots"/,
  );
});

test("estimates non-Close last-30-day revenue from the Close pace", () => {
  assert.equal(estimateLast30DayRevenue(1500, 1000, 100, 200), 150);
  assert.equal(estimateLast30DayRevenue(1000, 0, 0, 200), 150);
});

test("date helpers handle year and leap-day boundaries", () => {
  assert.equal(shiftDate("2026-01-01", -30), "2025-12-02");
  assert.equal(shiftDate("2026-01-30", -29), "2026-01-01");
  assert.equal(dayOfYearForDate("2024-02-29"), 60);
  assert.equal(dayOfYearForDate("2026-12-31"), 365);
  assert.equal(isSameRevenueYear("2026-12-31", "2027-01-01"), false);
  assert.equal(isSameRevenueYear("2026-01-01", "2026-12-31"), true);
});

test("publishes only a complete fresh five-source collector attempt", () => {
  const evaluation = evaluateRevenueAttempt(
    successfulSourceHealth(),
    "2026-09-08T17:00:00.000Z",
    "2026-09-08T17:01:00.000Z",
    "2026-09-08",
    25,
  );

  assert.equal(evaluation.publishable, true);
  assert.deepEqual(evaluation.issues, []);
  assert.deepEqual(evaluation.sources, {
    close: 100,
    impact: 200,
    redventures: 300,
    adsbymoney: 400,
    msn: 500,
  });
  assert.equal(sumRevenueSources(evaluation.sources), 1500);
});

test("derives every published metric from the five source amounts", () => {
  const sources = {
    close: 1_000,
    impact: 200,
    redventures: 300,
    adsbymoney: 400,
    msn: 500,
  };
  const metrics = deriveRevenueSnapshotMetrics(
    sources,
    "2026-01-10",
    100,
  );

  assert.equal(metrics.totalYtdUsd, 2_400);
  assert.equal(metrics.last30DayUsd, 240);
  assert.equal(metrics.projectedAnnualUsd, 87_600);
});

test("legacy snapshots derive their total from five valid source amounts", () => {
  const sources = {
    close: 100,
    impact: 200,
    redventures: 300,
    adsbymoney: 400,
    msn: 500,
  };

  assert.equal(calculateLegacyRevenueTotal(sources), 1_500);
  assert.equal(
    calculateLegacyRevenueTotal({ ...sources, msn: -1 }),
    null,
  );
  assert.equal(
    calculateLegacyRevenueTotal({ ...sources, impact: Number.NaN }),
    null,
  );
});

test("legacy ingestion closes permanently at either verified cutover signal", () => {
  assert.equal(legacyRevenueIngestionAllowed(false, false), true);
  assert.equal(legacyRevenueIngestionAllowed(true, false), false);
  assert.equal(legacyRevenueIngestionAllowed(false, true), false);
  assert.equal(legacyRevenueIngestionAllowed(true, true), false);
});

test("failed and carried-forward sources cannot publish", () => {
  const evaluation = evaluateRevenueAttempt(
    successfulSourceHealth({
      impact: {
        status: "failed",
        amountUsd: undefined,
        reused: false,
        error: "request failed",
      },
      msn: { reused: true },
    }),
    "2026-09-08T17:00:00.000Z",
    "2026-09-08T17:01:00.000Z",
    "2026-09-08",
    25,
  );

  assert.equal(evaluation.publishable, false);
  assert.equal(evaluation.sources, null);
  assert.ok(evaluation.issues.includes("impact_failed"));
  assert.ok(evaluation.issues.includes("impact_reported_error"));
  assert.ok(evaluation.issues.includes("impact_amount_missing_or_invalid"));
  assert.ok(evaluation.issues.includes("msn_reused"));
});

test("failed source runs record the last verified amount as reused", () => {
  const failed = successfulSourceHealth({
    impact: {
      status: "failed",
      amountUsd: undefined,
      fetchedAt: "2026-09-08T17:00:45.000Z",
      reused: false,
      error: "request failed",
    },
  });
  const recorded = augmentRevenueAttemptWithLastVerified(failed, {
    close: 10,
    impact: 999,
    redventures: 30,
    adsbymoney: 40,
    msn: 50,
  });

  assert.deepEqual(recorded.impact, {
    status: "failed",
    amountUsd: 999,
    fetchedAt: "2026-09-08T17:00:45.000Z",
    reused: true,
    error: "request failed",
  });
  assert.equal(recorded.close.reused, false);
});

test("failed source runs omit an amount when no verified value exists", () => {
  const failed = successfulSourceHealth({
    msn: { status: "failed", amountUsd: -1, reused: true },
  });
  const recorded = augmentRevenueAttemptWithLastVerified(failed);

  assert.deepEqual(recorded.msn, {
    status: "failed",
    fetchedAt: "2026-09-08T17:00:30.000Z",
    reused: false,
  });
});

test("negative source and Close rolling amounts cannot publish", () => {
  const evaluation = evaluateRevenueAttempt(
    successfulSourceHealth({ impact: { amountUsd: -1 } }),
    "2026-09-08T17:00:00.000Z",
    "2026-09-08T17:01:00.000Z",
    "2026-09-08",
    -1,
  );

  assert.equal(evaluation.publishable, false);
  assert.ok(evaluation.issues.includes("impact_amount_missing_or_invalid"));
  assert.ok(evaluation.issues.includes("close_last_30_day_missing_or_invalid"));
});

test("collector timestamps and snapshot date must describe the current run", () => {
  const evaluation = evaluateRevenueAttempt(
    successfulSourceHealth(),
    "2026-09-08T17:02:00.000Z",
    "2026-09-08T17:01:00.000Z",
    "2026-09-07",
    undefined,
  );

  assert.equal(evaluation.publishable, false);
  assert.ok(evaluation.issues.includes("collector_completed_before_started"));
  assert.ok(evaluation.issues.includes("snapshot_date_mismatch"));
  assert.ok(evaluation.issues.includes("close_last_30_day_missing_or_invalid"));
});

test("collector timestamps must be explicit UTC ISO values", () => {
  const evaluation = evaluateRevenueAttempt(
    successfulSourceHealth(),
    "2026-09-08T17:00:00",
    "2026-09-08T17:01:00",
    "2026-09-08",
    25,
  );

  assert.equal(evaluation.publishable, false);
  assert.ok(evaluation.issues.includes("collector_started_at_invalid"));
  assert.ok(evaluation.issues.includes("collector_completed_at_invalid"));
});

test("display falls back to legacy only until a verified snapshot exists", () => {
  const legacy = { id: "legacy", snapshotDate: "2026-09-08" };
  const verified = {
    id: "verified",
    snapshotDate: "2026-09-07",
    verificationStatus: "verified",
  };

  assert.deepEqual(selectRevenueDisplaySnapshot([legacy]), {
    snapshot: legacy,
    status: "legacy_unverified",
  });
  assert.deepEqual(selectRevenueDisplaySnapshot([legacy, verified]), {
    snapshot: verified,
    status: "verified",
  });
  assert.deepEqual(
    selectRevenueDisplaySnapshot([
      { id: "degraded", verificationStatus: "degraded" },
    ]),
    { snapshot: null, status: "unavailable" },
  );
});

test("source freshness distinguishes stale, failed, and reused values", () => {
  const now = Date.parse("2026-09-08T18:00:00.000Z");
  const base = {
    status: "success",
    amountUsd: 100,
    fetchedAt: "2026-09-08T17:00:00.000Z",
    reused: false,
  };

  assert.equal(revenueSourceFreshness(base, now), "fresh");
  assert.equal(
    revenueSourceFreshness(
      { ...base, fetchedAt: "2026-09-06T17:00:00.000Z" },
      now,
    ),
    "stale",
  );
  assert.equal(revenueSourceFreshness({ ...base, status: "failed" }, now), "failed");
  assert.equal(revenueSourceFreshness({ ...base, reused: true }, now), "reused");
});

test("connector errors are mapped only to controlled safe messages", () => {
  assert.equal(safeRevenueSourceError(undefined), undefined);
  assert.equal(
    safeRevenueSourceError("credential unavailable: private_key=do-not-return"),
    "Connector credentials are unavailable.",
  );
  assert.equal(
    safeRevenueSourceError("request timed out at https://secret.example/token"),
    "Connector request timed out.",
  );
  assert.equal(
    safeRevenueSourceError("Connector returned no revenue data."),
    "Connector returned no revenue data.",
  );
  const generic = safeRevenueSourceError("opaque failure api_key=do-not-return");
  assert.equal(generic, "Connector collection failed.");
  assert.doesNotMatch(generic, /do-not-return|api_key/);
});

test("revenue health follows the noon Central job and 1:30 PM retry deadline", () => {
  const beforeDeadline = revenueScheduleHealth(
    "2026-09-07",
    new Date("2026-09-08T18:29:00.000Z"),
  );
  assert.equal(beforeDeadline.currentLocalTime, "13:29");
  assert.equal(beforeDeadline.phase, "before_retry_deadline");
  assert.equal(beforeDeadline.minimumAcceptableAttemptDate, "2026-09-07");
  assert.equal(beforeDeadline.lastAttemptOnSchedule, true);

  const deadlineReached = revenueScheduleHealth(
    "2026-09-07",
    new Date("2026-09-08T18:30:00.000Z"),
  );
  assert.equal(deadlineReached.currentLocalTime, "13:30");
  assert.equal(deadlineReached.phase, "current_day_required");
  assert.equal(deadlineReached.minimumAcceptableAttemptDate, "2026-09-08");
  assert.equal(deadlineReached.lastAttemptOnSchedule, false);
  assert.equal(
    revenueScheduleHealth(
      "2026-09-08",
      new Date("2026-09-08T18:30:00.000Z"),
    ).lastAttemptOnSchedule,
    true,
  );
  assert.equal(
    revenueScheduleHealth(
      "2026-01-14",
      new Date("2026-01-15T19:29:00.000Z"),
    ).currentLocalTime,
    "13:29",
  );
});
