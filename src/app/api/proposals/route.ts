import { NextResponse } from "next/server";
import fs from "fs";

const PROPOSALS_PATH =
  "/Users/aurora/.openclaw/workspaces/axel/data/proposals.json";

export async function GET() {
  try {
    if (!fs.existsSync(PROPOSALS_PATH)) {
      return NextResponse.json({ proposals: [] });
    }
    const raw = fs.readFileSync(PROPOSALS_PATH, "utf-8").trim();
    const proposals = raw ? JSON.parse(raw) : [];
    return NextResponse.json({ proposals });
  } catch (err) {
    console.error("Proposals route error:", err);
    return NextResponse.json({ proposals: [], error: String(err) });
  }
}
