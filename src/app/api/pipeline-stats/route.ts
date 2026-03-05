import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Pipeline stats — sourced from sponsor detection pipeline DB.
// Updated manually or by pipeline scripts.
// Fallback to hardcoded values if no JSON file found.
const STATS_FILE = path.join(
  "/Users/aurora/.openclaw/workspaces/axel/data/pipeline-stats.json"
);

const DEFAULT_STATS = {
  topStats: [
    { label: "Channels", value: "42,214" },
    { label: "Videos", value: "2,178,548" },
    { label: "Brands", value: "38,987" },
    { label: "API Cost", value: "$600" },
  ],
  lastUpdated: "2026-03-04",
};

export async function GET() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const raw = fs.readFileSync(STATS_FILE, "utf-8");
      const data = JSON.parse(raw);
      return NextResponse.json(data);
    }
  } catch {
    // fall through to default
  }
  return NextResponse.json(DEFAULT_STATS);
}
