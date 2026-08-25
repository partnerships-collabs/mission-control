import assert from "node:assert/strict";
import test from "node:test";

import { fetchCloseWonTotal } from "../convex/closeRevenue.ts";
import {
  hasValidActivityToken,
  verifyCloseWebhookSignature,
} from "../convex/httpSecurity.ts";
import {
  dayOfYearForDate,
  estimateLast30DayRevenue,
  isSameRevenueYear,
  mergeCloseSource,
  shiftDate,
  sumRevenueSources,
} from "../convex/revenueMath.ts";

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
    { data: [{ value: 123456 }], has_more: true },
    { data: [{ value: null }], has_more: false },
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
