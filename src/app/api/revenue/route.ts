import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const COPPER_EMAIL = "partnerships@creatorsagency.co";
const GOAL_USD = 25_000_000;

export async function GET() {
  try {
    const keyPath = path.join(
      "/Users/aurora/.openclaw/workspaces/axel/.secrets/copper_api_key.txt"
    );
    const apiKey = fs.readFileSync(keyPath, "utf-8").trim();

    const res = await fetch(
      "https://api.copper.com/developer_api/v1/opportunities/search",
      {
        method: "POST",
        headers: {
          "X-PW-Application": "developer_api",
          "X-PW-AccessToken": apiKey,
          "X-PW-UserEmail": COPPER_EMAIL,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assignee_id: null, page_size: 200 }),
      }
    );

    if (!res.ok) {
      throw new Error(`Copper API error: ${res.status}`);
    }

    const opportunities = await res.json();
    const currentYear = new Date().getFullYear();
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;

    let totalYtdUsd = 0;
    let last30DayUsd = 0;

    for (const opp of opportunities) {
      if (opp.status !== "Won") continue;
      if (!opp.close_date) continue;
      const closeYear = new Date(opp.close_date * 1000).getFullYear();
      if (closeYear !== currentYear) continue;

      const val = opp.monetary_value || 0;
      totalYtdUsd += val;

      if (opp.close_date >= thirtyDaysAgo) {
        last30DayUsd += val;
      }
    }

    const projectedAnnualUsd =
      last30DayUsd > 0 ? Math.round((last30DayUsd / 30) * 365) : 0;

    return NextResponse.json({
      totalYtdUsd,
      goalUsd: GOAL_USD,
      last30DayUsd,
      projectedAnnualUsd,
      sources: {
        copper: totalYtdUsd,
        impact: null,
        redVentures: null,
        adsByMoney: null,
        msn: null,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Revenue route error:", err);
    return NextResponse.json(
      { error: String(err), totalYtdUsd: 0, goalUsd: GOAL_USD },
      { status: 500 }
    );
  }
}
