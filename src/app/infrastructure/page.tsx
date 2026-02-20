'use client';

interface Process {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  memMb: number;
}

interface Host {
  name: string;
  label: string;
  emoji: string;
  online: boolean;
  ip: string;
  cpuPct: number;
  memUsedGb: number;
  memTotalGb: number;
  ollamaRunning: boolean;
  ollamaLoadedModels: string[];
  activeProcesses: number;
  diskUsedGb: number;
  diskTotalGb: number;
  topProcesses: Process[];
}

const hosts: Host[] = [
  {
    name: "mac-studio",
    label: "Mac Studio",
    emoji: "🖥️",
    online: true,
    ip: "100.98.50.42",
    cpuPct: 18,
    memUsedGb: 42.1,
    memTotalGb: 64,
    ollamaRunning: true,
    ollamaLoadedModels: ["llama3.3:70b", "nomic-embed-text"],
    activeProcesses: 14,
    diskUsedGb: 312,
    diskTotalGb: 460,
    topProcesses: [
      { pid: 1842, name: "ollama", cpu: 28.4, mem: 14.2, memMb: 9088 },
      { pid: 3201, name: "python3 mission_control_collector.py", cpu: 6.1, mem: 1.4, memMb: 896 },
      { pid: 2980, name: "node (openclaw)", cpu: 4.8, mem: 2.1, memMb: 1344 },
      { pid: 4410, name: "python3 revenue_collector.py", cpu: 3.2, mem: 0.9, memMb: 576 },
      { pid: 1204, name: "python3 sponsor_pipeline.py", cpu: 2.7, mem: 1.8, memMb: 1152 },
      { pid: 5512, name: "node (webhook-server)", cpu: 1.4, mem: 1.1, memMb: 704 },
      { pid: 6001, name: "python3 memory_filing_cron.py", cpu: 0.8, mem: 0.6, memMb: 384 },
      { pid: 7300, name: "launchd", cpu: 0.2, mem: 0.1, memMb: 64 },
    ],
  },
  {
    name: "mac-mini",
    label: "Mac Mini",
    emoji: "🖥️",
    online: true,
    ip: "100.104.197.44",
    cpuPct: 8,
    memUsedGb: 9.4,
    memTotalGb: 16,
    ollamaRunning: false,
    ollamaLoadedModels: [],
    activeProcesses: 6,
    diskUsedGb: 88,
    diskTotalGb: 200,
    topProcesses: [
      { pid: 812, name: "node (brand-match-app)", cpu: 5.2, mem: 3.8, memMb: 608 },
      { pid: 1003, name: "node (media-kits-app)", cpu: 2.1, mem: 2.4, memMb: 384 },
      { pid: 1240, name: "node (openclaw)", cpu: 1.8, mem: 1.6, memMb: 256 },
      { pid: 2100, name: "python3 webhook_server.py", cpu: 0.9, mem: 0.8, memMb: 128 },
      { pid: 3050, name: "python3 adsbymoney_scraper.py", cpu: 0.4, mem: 0.6, memMb: 96 },
      { pid: 4400, name: "launchd", cpu: 0.1, mem: 0.1, memMb: 32 },
    ],
  },
];

function cpuColor(cpu: number): string {
  if (cpu >= 20) return "text-red-400";
  if (cpu >= 8) return "text-yellow-400";
  return "text-green-400";
}

function memBarColor(pct: number): string {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 60) return "bg-yellow-500";
  return "bg-emerald-500";
}

function diskBarColor(pct: number): string {
  if (pct >= 85) return "bg-red-500";
  if (pct >= 65) return "bg-yellow-500";
  return "bg-blue-500";
}

export default function InfrastructurePage() {
  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Infrastructure</h1>
        <p className="text-sm text-zinc-400 mt-1">Mac Studio · Mac Mini · Live process view</p>
      </div>

      {hosts.map((host) => {
        const memPct = Math.round((host.memUsedGb / host.memTotalGb) * 100);
        const diskPct = Math.round((host.diskUsedGb / host.diskTotalGb) * 100);

        return (
          <div key={host.name} className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
            {/* Host header */}
            <div className="p-5 border-b border-zinc-700 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl">{host.emoji}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-zinc-100">{host.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${host.online ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
                      {host.online ? "online" : "offline"}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">{host.ip}</div>
                </div>
              </div>

              {/* CPU */}
              <div className="text-center">
                <div className={`text-2xl font-bold ${cpuColor(host.cpuPct)}`}>{host.cpuPct}%</div>
                <div className="text-xs text-zinc-400">CPU</div>
              </div>

              {/* RAM */}
              <div className="min-w-[120px]">
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>RAM</span>
                  <span>{host.memUsedGb} / {host.memTotalGb} GB</span>
                </div>
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${memBarColor(memPct)}`} style={{ width: `${memPct}%` }} />
                </div>
                <div className="text-xs text-zinc-400 mt-1 text-right">{memPct}%</div>
              </div>

              {/* Disk */}
              <div className="min-w-[120px]">
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Disk</span>
                  <span>{host.diskUsedGb} / {host.diskTotalGb} GB</span>
                </div>
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${diskBarColor(diskPct)}`} style={{ width: `${diskPct}%` }} />
                </div>
                <div className="text-xs text-zinc-400 mt-1 text-right">{diskPct}%</div>
              </div>

              {/* Ollama */}
              <div className="text-center">
                <div className={`text-lg font-semibold ${host.ollamaRunning ? "text-emerald-400" : "text-zinc-500"}`}>
                  {host.ollamaRunning ? "🦙 Running" : "🦙 Off"}
                </div>
                {host.ollamaRunning && host.ollamaLoadedModels.length > 0 && (
                  <div className="text-xs text-zinc-400 mt-0.5">{host.ollamaLoadedModels.join(", ")}</div>
                )}
              </div>

              {/* Active processes count */}
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-200">{host.activeProcesses}</div>
                <div className="text-xs text-zinc-400">active procs</div>
              </div>
            </div>

            {/* Top processes table */}
            <div>
              <div className="px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-300">Top Processes by CPU</span>
                <span className="text-xs text-zinc-500">PID · Name · CPU% · MEM%</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500 border-b border-zinc-700">
                    <th className="text-left px-5 py-2 font-medium">PID</th>
                    <th className="text-left px-5 py-2 font-medium">Process</th>
                    <th className="text-right px-5 py-2 font-medium">CPU %</th>
                    <th className="text-right px-5 py-2 font-medium">MEM %</th>
                    <th className="text-right px-5 py-2 font-medium">MEM MB</th>
                  </tr>
                </thead>
                <tbody>
                  {host.topProcesses.map((proc, idx) => (
                    <tr
                      key={proc.pid}
                      className={`border-b border-zinc-700/50 ${idx % 2 === 0 ? "bg-zinc-800" : "bg-zinc-750"} hover:bg-zinc-700 transition-colors`}
                    >
                      <td className="px-5 py-2.5 text-zinc-500 font-mono text-xs">{proc.pid}</td>
                      <td className="px-5 py-2.5 text-zinc-200 font-mono text-xs truncate max-w-xs">{proc.name}</td>
                      <td className={`px-5 py-2.5 text-right font-semibold font-mono text-xs ${cpuColor(proc.cpu)}`}>
                        {proc.cpu.toFixed(1)}
                      </td>
                      <td className="px-5 py-2.5 text-right text-zinc-300 font-mono text-xs">{proc.mem.toFixed(1)}</td>
                      <td className="px-5 py-2.5 text-right text-zinc-400 font-mono text-xs">{proc.memMb.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
