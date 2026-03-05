'use client';

import { useEffect, useState } from "react";

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

interface InfraData {
  hosts: Host[];
  updatedAt: string;
}

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

function formatUpdated(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function InfrastructurePage() {
  const [data, setData] = useState<InfraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/infrastructure')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: InfraData) => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl">
        <h1 className="text-2xl font-bold text-slate-100 mb-6">Infrastructure</h1>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-500 animate-pulse">
          Fetching live system stats…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl">
        <h1 className="text-2xl font-bold text-slate-100 mb-6">Infrastructure</h1>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-red-400">
          Failed to load infrastructure data: {error || "Unknown error"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Infrastructure</h1>
          <p className="text-sm text-slate-400 mt-1">Mac Studio · Mac Mini · Live process view</p>
        </div>
        <span className="text-xs text-slate-500 mt-1">
          Updated {formatUpdated(data.updatedAt)}
        </span>
      </div>

      {data.hosts.map((host) => {
        const memPct = host.memTotalGb > 0 ? Math.round((host.memUsedGb / host.memTotalGb) * 100) : 0;
        const diskPct = host.diskTotalGb > 0 ? Math.round((host.diskUsedGb / host.diskTotalGb) * 100) : 0;

        return (
          <div key={host.name} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            {/* Host header */}
            <div className="p-5 border-b border-slate-700 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl">{host.emoji}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-slate-100">{host.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${host.online ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
                      {host.online ? "online" : "offline"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{host.ip}</div>
                </div>
              </div>

              {host.online ? (
                <>
                  {/* CPU */}
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${cpuColor(host.cpuPct)}`}>{host.cpuPct}%</div>
                    <div className="text-xs text-slate-400">CPU</div>
                  </div>

                  {/* RAM */}
                  <div className="min-w-[120px]">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>RAM</span>
                      <span>{host.memUsedGb} / {host.memTotalGb} GB</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${memBarColor(memPct)}`} style={{ width: `${memPct}%` }} />
                    </div>
                    <div className="text-xs text-slate-400 mt-1 text-right">{memPct}%</div>
                  </div>

                  {/* Disk */}
                  <div className="min-w-[120px]">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Disk</span>
                      <span>{host.diskUsedGb} / {host.diskTotalGb} GB</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${diskBarColor(diskPct)}`} style={{ width: `${diskPct}%` }} />
                    </div>
                    <div className="text-xs text-slate-400 mt-1 text-right">{diskPct}%</div>
                  </div>

                  {/* Ollama */}
                  <div className="text-center">
                    <div className={`text-lg font-semibold ${host.ollamaRunning ? "text-emerald-400" : "text-slate-500"}`}>
                      {host.ollamaRunning ? "🦙 Running" : "🦙 Off"}
                    </div>
                    {host.ollamaRunning && host.ollamaLoadedModels.length > 0 && (
                      <div className="text-xs text-slate-400 mt-0.5">{host.ollamaLoadedModels.join(", ")}</div>
                    )}
                  </div>

                  {/* Active processes count */}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-200">{host.activeProcesses}</div>
                    <div className="text-xs text-slate-400">active procs</div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-500 italic">Host unreachable</div>
              )}
            </div>

            {/* Top processes table */}
            {host.online && host.topProcesses.length > 0 && (
              <div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">Top Processes by CPU</span>
                  <span className="text-xs text-slate-500">PID · Name · CPU% · MEM%</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-700">
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
                        className={`border-b border-slate-700/50 ${idx % 2 === 0 ? "bg-slate-800" : "bg-slate-800/80"} hover:bg-slate-700 transition-colors`}
                      >
                        <td className="px-5 py-2.5 text-slate-500 font-mono text-xs">{proc.pid}</td>
                        <td className="px-5 py-2.5 text-slate-200 font-mono text-xs truncate max-w-xs">{proc.name}</td>
                        <td className={`px-5 py-2.5 text-right font-semibold font-mono text-xs ${cpuColor(proc.cpu)}`}>
                          {proc.cpu.toFixed(1)}
                        </td>
                        <td className="px-5 py-2.5 text-right text-slate-300 font-mono text-xs">{proc.mem.toFixed(1)}</td>
                        <td className="px-5 py-2.5 text-right text-slate-400 font-mono text-xs">{proc.memMb.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
