import { NextResponse } from "next/server";

const DEFAULT_CONVEX_SITE_URL = "https://healthy-bison-550.convex.site";

interface RevenueSnapshot {
  _creationTime: number;
  snapshotDate: string;
  totalYtdUsd: number;
  goalUsd: number;
  last30DayUsd: number;
  projectedAnnualUsd: number;
  updatedAt?: number;
  sources: {
    close?: number;
    copper?: number;
    impact?: number;
    adsbymoney?: number;
    redventures?: number;
    msn?: number;
  };
}

export async function GET() {
  try {
    const activitySecret = process.env.ACTIVITY_LOG_SECRET;
    if (!activitySecret) throw new Error("ACTIVITY_LOG_SECRET is not configured");

    const siteUrl = (
      process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? DEFAULT_CONVEX_SITE_URL
    )
      .replace(".convex.cloud", ".convex.site")
      .replace(/\/$/, "");
    const response = await fetch(`${siteUrl}/revenue/snapshot`, {
      cache: "no-store",
      headers: { "x-activity-secret": activitySecret },
    });
    if (!response.ok) {
      throw new Error(`Revenue snapshot returned ${response.status}`);
    }

    const snapshot = (await response.json()) as RevenueSnapshot | null;
    if (!snapshot) throw new Error("Revenue snapshot unavailable");

    return NextResponse.json(
      {
        snapshotDate: snapshot.snapshotDate,
        totalYtdUsd: snapshot.totalYtdUsd,
        goalUsd: snapshot.goalUsd,
        last30DayUsd: snapshot.last30DayUsd,
        projectedAnnualUsd: snapshot.projectedAnnualUsd,
        sources: {
          // Keep this legacy key until RevenueTracker's API contract is renamed.
          copper: snapshot.sources.close ?? snapshot.sources.copper ?? null,
          impact: snapshot.sources.impact ?? null,
          redVentures: snapshot.sources.redventures ?? null,
          adsByMoney: snapshot.sources.adsbymoney ?? null,
          msn: snapshot.sources.msn ?? null,
        },
        updatedAt: new Date(snapshot.updatedAt ?? snapshot._creationTime).toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    console.error("Revenue route error:", err);
    return NextResponse.json(
      { error: "Revenue data unavailable" },
      {
        status: 502,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
