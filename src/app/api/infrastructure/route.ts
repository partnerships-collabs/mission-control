import { NextResponse } from "next/server";
import { execSync } from "child_process";

function safeExec(cmd: string, timeout = 5000): string {
  try {
    return execSync(cmd, { timeout, env: { ...process.env, PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" } })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function parseMacMemory(): { usedGb: number; totalGb: number } {
  try {
    const totalBytes = parseInt(safeExec("sysctl -n hw.memsize"), 10);
    const pageSize = parseInt(safeExec("sysctl -n hw.pagesize"), 10) || 4096;
    const vmstat = safeExec("vm_stat");

    const getPages = (label: string): number => {
      const match = vmstat.match(new RegExp(`${label}:\\s+(\\d+)\\.`));
      return match ? parseInt(match[1], 10) : 0;
    };

    const freePages = getPages("Pages free") + getPages("Pages speculative");
    const freeBytes = freePages * pageSize;
    const usedBytes = totalBytes - freeBytes;

    return {
      usedGb: Math.round((usedBytes / 1073741824) * 10) / 10,
      totalGb: Math.round(totalBytes / 1073741824),
    };
  } catch {
    return { usedGb: 0, totalGb: 64 };
  }
}

function parseDisk(path = "/"): { usedGb: number; totalGb: number } {
  try {
    const out = safeExec(`df -k "${path}"`);
    const parts = out.split("\n")[1]?.split(/\s+/) || [];
    const totalKb = parseInt(parts[1], 10);
    const usedKb = parseInt(parts[2], 10);
    if (isNaN(totalKb) || isNaN(usedKb)) return { usedGb: 0, totalGb: 0 };
    return {
      usedGb: Math.round((usedKb / 1048576) * 10) / 10,
      totalGb: Math.round((totalKb / 1048576) * 10) / 10,
    };
  } catch {
    return { usedGb: 0, totalGb: 0 };
  }
}

function getCpuUsage(): number {
  try {
    const out = safeExec("top -l 1 -s 0 | grep 'CPU usage'", 8000);
    const idle = out.match(/(\d+(?:\.\d+)?)%\s+idle/);
    if (idle) return Math.round(100 - parseFloat(idle[1]));
  } catch { /* */ }
  return 0;
}

interface Process {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  memMb: number;
}

function getTopProcesses(): Process[] {
  try {
    const out = safeExec("ps -eo pid,pcpu,pmem,rss,comm -r | head -11");
    return out
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[0], 10);
        const cpu = parseFloat(parts[1]);
        const mem = parseFloat(parts[2]);
        const rssKb = parseInt(parts[3], 10);
        const name = parts.slice(4).join(" ");
        return { pid, name, cpu, mem, memMb: Math.round(rssKb / 1024) };
      })
      .filter((p) => !isNaN(p.pid));
  } catch {
    return [];
  }
}

function checkOllama(): { running: boolean; models: string[] } {
  try {
    const out = safeExec("curl -s --max-time 2 http://localhost:11434/api/tags");
    if (!out) return { running: false, models: [] };
    const data = JSON.parse(out);
    const models = (data.models || []).map((m: { name: string }) => m.name);
    return { running: true, models };
  } catch {
    return { running: false, models: [] };
  }
}

function getMiniData(): {
  online: boolean;
  cpuPct: number;
  memUsedGb: number;
  memTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  activeProcesses: number;
  topProcesses: Process[];
} {
  try {
    // Run all mini commands in one ssh call to minimize connections
    const out = safeExec(
      "ssh -o ConnectTimeout=4 -o StrictHostKeyChecking=no mini 'df -k / && echo ---MEM--- && sysctl -n hw.memsize && sysctl -n hw.pagesize && vm_stat && echo ---PS--- && ps -eo pid,pcpu,pmem,rss,comm -r | head -8 && echo ---CPU--- && top -l 1 -s 0 | grep CPU'",
      12000
    );
    if (!out) return { online: false, cpuPct: 0, memUsedGb: 0, memTotalGb: 0, diskUsedGb: 0, diskTotalGb: 0, activeProcesses: 0, topProcesses: [] };

    const sections = out.split(/---MEM---|---PS---|---CPU---/);
    // Section 0: df output
    const dfParts = sections[0]?.split("\n")[1]?.split(/\s+/) || [];
    const diskTotal = Math.round((parseInt(dfParts[1], 10) / 1048576) * 10) / 10;
    const diskUsed = Math.round((parseInt(dfParts[2], 10) / 1048576) * 10) / 10;

    // Section 1: memory
    const memLines = (sections[1] || "").split("\n").filter(Boolean);
    const totalBytes = parseInt(memLines[0], 10) || 0;
    const pageSize = parseInt(memLines[1], 10) || 4096;
    const vmPart = memLines.slice(2).join("\n");
    const getPages = (label: string) => {
      const m = vmPart.match(new RegExp(`${label}:\\s+(\\d+)\\.`));
      return m ? parseInt(m[1], 10) : 0;
    };
    const freePages = getPages("Pages free") + getPages("Pages speculative");
    const memTotal = Math.round(totalBytes / 1073741824);
    const memUsed = Math.round(((totalBytes - freePages * pageSize) / 1073741824) * 10) / 10;

    // Section 2: top processes
    const psLines = (sections[2] || "").split("\n").slice(1).filter(Boolean);
    const topProcs = psLines.map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parseInt(parts[0], 10),
        cpu: parseFloat(parts[1]),
        mem: parseFloat(parts[2]),
        memMb: Math.round(parseInt(parts[3], 10) / 1024),
        name: parts.slice(4).join(" "),
      };
    }).filter((p) => !isNaN(p.pid));

    // Section 3: CPU
    const cpuLine = sections[3] || "";
    const idleMatch = cpuLine.match(/(\d+(?:\.\d+)?)%\s+idle/);
    const cpuPct = idleMatch ? Math.round(100 - parseFloat(idleMatch[1])) : 0;

    return {
      online: true,
      cpuPct,
      memUsedGb: memUsed,
      memTotalGb: memTotal,
      diskUsedGb: diskUsed,
      diskTotalGb: diskTotal,
      activeProcesses: topProcs.length,
      topProcesses: topProcs,
    };
  } catch {
    return { online: false, cpuPct: 0, memUsedGb: 0, memTotalGb: 0, diskUsedGb: 0, diskTotalGb: 0, activeProcesses: 0, topProcesses: [] };
  }
}

export async function GET() {
  const mem = parseMacMemory();
  const disk = parseDisk("/");
  const topProcesses = getTopProcesses();
  const ollama = checkOllama();
  const cpuPct = getCpuUsage();
  const activeProcStr = safeExec("ps aux | wc -l");
  const activeProcesses = Math.max(0, parseInt(activeProcStr, 10) - 1);

  const studio = {
    name: "mac-studio",
    label: "Mac Studio",
    emoji: "🖥️",
    online: true,
    ip: "100.98.50.42",
    cpuPct,
    memUsedGb: mem.usedGb,
    memTotalGb: mem.totalGb,
    ollamaRunning: ollama.running,
    ollamaLoadedModels: ollama.models,
    activeProcesses,
    diskUsedGb: disk.usedGb,
    diskTotalGb: disk.totalGb,
    topProcesses,
  };

  const miniRaw = getMiniData();
  const mini = {
    name: "mac-mini",
    label: "Mac Mini",
    emoji: "🖥️",
    ip: "100.104.197.44",
    ollamaRunning: false,
    ollamaLoadedModels: [] as string[],
    ...miniRaw,
  };

  return NextResponse.json({
    hosts: [studio, mini],
    updatedAt: new Date().toISOString(),
  });
}
