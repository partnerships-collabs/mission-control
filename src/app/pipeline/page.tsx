"use client";

import React from "react";
import { topStats, PIPELINE_LAST_UPDATED } from "@/app/pipeline/pipeline-data";

// ── Top Brands Table ─────────────────────────────────────────────────────────
interface SponsorRow {
  domain: string;
  base_domain: string;
  channel_count: number;
  video_count: number;
}
interface SponsorsResponse {
  total: number; limit: number; offset: number; results: SponsorRow[];
}

function TopBrandsTable() {
  const [search, setSearch]     = React.useState("");
  const [debouncedSearch, setDS]= React.useState("");
  const [sort, setSort]         = React.useState<"channels"|"videos">("channels");
  const [minChannels, setMinCh] = React.useState(1);
  const [minVideos, setMinVid]  = React.useState(0);
  const [page, setPage]         = React.useState(0);
  const [data, setData]         = React.useState<SponsorsResponse|null>(null);
  const [loading, setLoading]   = React.useState(true);
  const [error, setError]       = React.useState<string|null>(null);
  const PAGE_SIZE = 50;

  React.useEffect(() => {
    const t = setTimeout(() => { setDS(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setLoading(true); setError(null);
    const p = new URLSearchParams({
      limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE),
      sort, min_channels: String(minChannels), min_videos: String(minVideos),
    });
    if (debouncedSearch) p.set("search", debouncedSearch);
    fetch(`/api/sponsors?${p}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [debouncedSearch, sort, minChannels, minVideos, page]);

  const maxCh    = data?.results[0]?.channel_count ?? 1;
  const totalPgs = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Top Brands by Channel Reach</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Live from Postgres · APPROVED sponsors only{data && ` · ${data.total.toLocaleString()} total`}
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
          {data ? data.total.toLocaleString() : "—"} sponsors
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input type="text" placeholder="Search domain..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[140px] text-xs px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 outline-none placeholder-slate-500"
        />
        {[
          { val: sort, set: (v: string) => { setSort(v as "channels"|"videos"); setPage(0); },
            opts: [["channels","Sort: Channels"],["videos","Sort: Videos"]] },
          { val: String(minChannels), set: (v: string) => { setMinCh(Number(v)); setPage(0); },
            opts: [["1","Min ch: 1+"],["5","Min ch: 5+"],["10","Min ch: 10+"],["50","Min ch: 50+"],["100","Min ch: 100+"]] },
          { val: String(minVideos), set: (v: string) => { setMinVid(Number(v)); setPage(0); },
            opts: [["0","Min vids: any"],["100","Min vids: 100+"],["500","Min vids: 500+"],["1000","Min vids: 1K+"]] },
        ].map((sel, i) => (
          <select key={i} value={sel.val} onChange={e => sel.set(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-400 outline-none cursor-pointer">
            {sel.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
      </div>

      {error && <p className="text-xs py-4 text-center text-red-400">Error: {error}</p>}

      {!error && (
        <>
          <div className="grid gap-2 pb-2 mb-1 text-xs uppercase tracking-wider text-slate-600"
            style={{ gridTemplateColumns: "1.5rem 1fr 5.5rem 5rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span/><span>Domain</span><span className="text-right">Channels</span><span className="text-right">Videos</span>
          </div>

          {loading && <p className="text-xs py-6 text-center text-slate-600 animate-pulse">Loading...</p>}

          {!loading && data?.results.map((b, i) => (
            <div key={b.domain} className="grid gap-2 py-2 items-center"
              style={{ gridTemplateColumns: "1.5rem 1fr 5.5rem 5rem", borderBottom: i < data.results.length-1 ? "1px solid rgba(255,255,255,0.03)" : undefined }}>
              <span className="text-xs text-slate-600 tabular-nums">{page*PAGE_SIZE+i+1}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{b.domain}</p>
                {b.base_domain !== b.domain && <p className="text-xs text-slate-600 truncate">{b.base_domain}</p>}
                <div className="mt-1 h-0.5 rounded-full bg-slate-700">
                  <div className="h-full rounded-full bg-indigo-500/50" style={{ width: `${(b.channel_count/maxCh)*100}%` }}/>
                </div>
              </div>
              <p className="text-sm font-semibold text-right text-slate-100 tabular-nums">{b.channel_count.toLocaleString()}</p>
              <p className="text-sm text-right text-slate-500 tabular-nums">{b.video_count.toLocaleString()}</p>
            </div>
          ))}

          {!loading && data?.results.length === 0 && (
            <p className="text-xs py-6 text-center text-slate-600">No results</p>
          )}

          {totalPgs > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700">
              <p className="text-xs text-slate-600">Page {page+1} of {totalPgs}</p>
              <div className="flex gap-2">
                {[["← Prev", page===0, ()=>setPage(p=>Math.max(0,p-1))],
                  ["Next →", page>=totalPgs-1, ()=>setPage(p=>Math.min(totalPgs-1,p+1))]].map(([lbl, dis, fn]) => (
                  <button key={lbl as string} onClick={fn as ()=>void} disabled={dis as boolean}
                    className="text-xs px-3 py-1 rounded-lg bg-slate-700 text-slate-400 disabled:opacity-30">
                    {lbl as string}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type StageStatus = "Active" | "Paused" | "Complete";

interface PipelineStat {
  label: string;
  value: string;
}

interface PipelineStage {
  num: string;
  name: string;
  status: StageStatus;
  description: string;
  stats: PipelineStat[];
  note?: string;
}

const stages: PipelineStage[] = [
  {
    num: "01", name: "Channel Discovery", status: "Active",
    description: "Finding new YouTube channels via yt-dlp search",
    stats: [{ label: "Candidates Found", value: "131,579" }],
  },
  {
    num: "02", name: "Channel Qualification", status: "Paused",
    description: "Verifying channels meet 5K+ avg views, English, educational",
    stats: [
      { label: "Qualified", value: "9,434" },
      { label: "Rejected", value: "\u2014" },
      { label: "Remaining", value: "\u2014" },
    ],
  },
  {
    num: "03", name: "Main Channel Database", status: "Active",
    description: "All qualified channels ready for video harvesting",
    stats: [{ label: "Channels", value: "42,214" }],
  },
  {
    num: "04", name: "Video Harvesting", status: "Active",
    description: "Collecting video IDs from all channels via yt-dlp",
    stats: [{ label: "Unique Video IDs", value: "2,178,548" }],
  },
  {
    num: "05", name: "Description Fetching", status: "Active",
    description: "Fetching full video descriptions for sponsor detection",
    stats: [{ label: "Descriptions Fetched", value: "1,379,709" }],
  },
  {
    num: "06", name: "Sponsor Detection", status: "Paused",
    description: "AI-powered detection of brand sponsorships in video descriptions",
    stats: [
      { label: "Scanned (API)", value: "\u2014" },
      { label: "Scanned (Local)", value: "\u2014 / \u2014" },
      { label: "Sponsored Videos", value: "187,915" },
      { label: "Brand Mentions", value: "375,646" },
    ],
  },
  {
    num: "07", name: "Brand Normalization", status: "Complete",
    description: "Mapping brand strings to canonical names",
    stats: [
      { label: "Raw Strings", value: "\u2014" },
      { label: "Canonical Brands", value: "38,987" },
      { label: "Filtered (Self-Promo)", value: "\u2014" },
      { label: "Filtered (Not-a-Brand)", value: "\u2014" },
    ],
  },
  {
    num: "08", name: "Agentio Creator Sourcing", status: "Active",
    description: "Finding new creators for Charlie's roster expansion",
    stats: [
      { label: "Pool", value: "22,760" },
      { label: "L1 Scanned", value: "18,647" },
      { label: "L1 Passed", value: "9,104" },
      { label: "L2 Processed", value: "1,365" },
      { label: "L2 Passed", value: "671" },
      { label: "Pushed to Sheet", value: "111" },
    ],
  },
];

const statusBadge: Record<StageStatus, string> = {
  Active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Complete: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const statusDot: Record<StageStatus, string> = {
  Active: "bg-emerald-400",
  Paused: "bg-yellow-400",
  Complete: "bg-blue-400",
};

export default function PipelinePage() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Pipeline Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Sponsor detection pipeline</p>
        </div>
        <span className="text-xs text-slate-500 mt-1">
          Last updated: {PIPELINE_LAST_UPDATED}
        </span>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {topStats.map((s) => (
          <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold tracking-tight">{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline stages */}
      <div className="space-y-3">
        {stages.map((stage) => (
          <div key={stage.num} className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors">
            <div className="flex items-start gap-4">
              {/* Stage number */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                <span className="text-xs text-slate-400 font-mono font-medium">{stage.num}</span>
              </div>

              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center gap-3 mb-1">
                  <div className={`w-2 h-2 rounded-full ${statusDot[stage.status]}`} />
                  <h3 className="text-lg font-semibold">{stage.name}</h3>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${statusBadge[stage.status]}`}>
                    {stage.status}
                  </span>
                </div>

                <p className="text-sm text-slate-400 mt-1 ml-5">{stage.description}</p>

                {/* Note/warning */}
                {stage.note && (
                  <div className="ml-5 mt-2">
                    <span className="text-xs text-yellow-400/80 bg-yellow-500/10 px-2 py-0.5 rounded">{stage.note}</span>
                  </div>
                )}

                {/* Stats grid */}
                <div className="flex flex-wrap gap-3 mt-3 ml-5">
                  {stage.stats.map((stat) => (
                    <div key={stat.label} className="bg-slate-700/50 rounded-lg px-3 py-2 text-center min-w-[80px]">
                      <div className="text-lg font-bold tracking-tight">{stat.value}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top Brands */}
      <TopBrandsTable />
    </div>
  );
}
