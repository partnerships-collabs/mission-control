import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const COPPER_EMAIL = "partnerships@creatorsagency.co";

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
        body: JSON.stringify({
          assignee_id: null,
          page_size: 200,
          statuses: ["Open"],
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Copper API error: ${res.status}`);
    }

    const opportunities = await res.json();
    const open = opportunities.filter(
      (o: { status: string }) => o.status === "Open"
    );

    let totalOpenValue = 0;
    const mapped = open.map(
      (o: {
        name: string;
        monetary_value: number | null;
        close_date: number | null;
        assignee?: { name?: string };
        pipeline_stage?: { name?: string };
      }) => {
        const val = o.monetary_value || 0;
        totalOpenValue += val;
        return {
          name: o.name,
          monetary_value: val,
          close_date: o.close_date
            ? new Date(o.close_date * 1000).toISOString().split("T")[0]
            : null,
          assignee_name: o.assignee?.name || "Unassigned",
          stage: o.pipeline_stage?.name || "Unknown",
        };
      }
    );

    mapped.sort(
      (a: { monetary_value: number }, b: { monetary_value: number }) =>
        b.monetary_value - a.monetary_value
    );

    return NextResponse.json({
      opportunities: mapped,
      totalOpenValue,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Copper pipeline route error:", err);
    return NextResponse.json(
      { error: String(err), opportunities: [], totalOpenValue: 0 },
      { status: 500 }
    );
  }
}
