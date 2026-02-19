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

const topStats = [
  { label: "Channels", value: "42,214" },
  { label: "Videos", value: "2,178,548" },
  { label: "Brands", value: "38,987" },
  { label: "API Cost", value: "$600" },
];

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
    note: "Waiting for fine-tuned model",
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-100">Pipeline Dashboard</h2>
        <p className="text-sm text-zinc-500 mt-1">Sponsor detection pipeline</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {topStats.map((s) => (
          <div key={s.label} className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold tracking-tight">{s.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline stages */}
      <div className="space-y-3">
        {stages.map((stage) => (
          <div key={stage.num} className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 hover:border-zinc-600 transition-colors">
            <div className="flex items-start gap-4">
              {/* Stage number */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center">
                <span className="text-xs text-zinc-400 font-mono font-medium">{stage.num}</span>
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

                <p className="text-sm text-zinc-400 mt-1 ml-5">{stage.description}</p>

                {/* Note/warning */}
                {stage.note && (
                  <div className="ml-5 mt-2">
                    <span className="text-xs text-yellow-400/80 bg-yellow-500/10 px-2 py-0.5 rounded">{stage.note}</span>
                  </div>
                )}

                {/* Stats grid */}
                <div className="flex flex-wrap gap-3 mt-3 ml-5">
                  {stage.stats.map((stat) => (
                    <div key={stat.label} className="bg-zinc-700/50 rounded-lg px-3 py-2 text-center min-w-[80px]">
                      <div className="text-lg font-bold tracking-tight">{stat.value}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
