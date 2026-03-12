import { NextResponse } from "next/server";
import fs from "fs";

const CLOSE_API_KEY_PATH = "/Users/aurora/.openclaw/workspaces/axel/.secrets/close_api_key.txt";
const CLOSE_BASE_URL = "https://api.close.com/api/v1";

interface CloseOpportunity {
  lead_name: string;
  value: number | null;
  date_won: string | null;
  user_name: string | null;
  status_label: string | null;
}

interface CloseResponse {
  data: CloseOpportunity[];
  has_more: boolean;
}

export async function GET() {
  try {
    const apiKey = fs.readFileSync(CLOSE_API_KEY_PATH, "utf-8").trim();
    const authHeader = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");

    const allOpportunities: CloseOpportunity[] = [];
    let skip = 0;
    const limit = 100;

    while (true) {
      const url = `${CLOSE_BASE_URL}/opportunity/?status_type=active&_limit=${limit}&_skip=${skip}`;
      const res = await fetch(url, {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error(`Close API error: ${res.status}`);

      const body: CloseResponse = await res.json();
      allOpportunities.push(...body.data);

      if (!body.has_more || body.data.length < limit) break;
      skip += limit;
    }

    let totalOpenValue = 0;
    const mapped = allOpportunities.map((o) => {
      const val = o.value || 0;
      totalOpenValue += val;
      return {
        name: o.lead_name,
        monetary_value: val,
        close_date: o.date_won ? o.date_won.split("T")[0] : null,
        assignee_name: o.user_name || "Unassigned",
        stage: o.status_label || "Unknown",
      };
    });

    mapped.sort((a, b) => b.monetary_value - a.monetary_value);

    return NextResponse.json({
      opportunities: mapped,
      totalOpenValue,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Close pipeline route error:", err);
    return NextResponse.json(
      { error: String(err), opportunities: [], totalOpenValue: 0 },
      { status: 500 }
    );
  }
}
