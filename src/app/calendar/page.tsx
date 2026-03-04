'use client';

import { useState } from "react";
import { realCronJobs } from "@/app/crons/real-cron-data";

interface CalendarJob {
  name: string;
  time: string; // "HH:00"
  agent: 'ari' | 'arlo' | 'axel';
  frequency: string;
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  colorClass: string;
}

const agents: Agent[] = [
  { id: 'ari',  name: 'Ari',  emoji: '🧠', color: 'emerald', colorClass: 'bg-emerald-500' },
  { id: 'arlo', name: 'Arlo', emoji: '📊', color: 'amber',   colorClass: 'bg-amber-500' },
  { id: 'axel', name: 'Axel', emoji: '⚡', color: 'cyan',    colorClass: 'bg-cyan-500' },
];

// Parse a cron schedule string and return the primary hours it fires (0-23)
function parseHours(schedule: string): number[] {
  // "every Xm" or "every Xh" — show at 0 (midnight slot) as fallback for now, skip
  if (schedule.startsWith("every")) return [];

  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return [];

  const minutePart = parts[0];
  const hourPart   = parts[1];

  // If hourPart is * or */X, skip (too many slots)
  if (hourPart === "*") return [];

  // Handle step: */6 -> 0,6,12,18
  if (hourPart.startsWith("*/")) {
    const step = parseInt(hourPart.slice(2), 10);
    if (isNaN(step)) return [];
    const result: number[] = [];
    for (let h = 0; h < 24; h += step) result.push(h);
    return result;
  }

  // Handle range: 8-22
  if (hourPart.includes("-") && !hourPart.includes(",")) {
    const [start, end] = hourPart.split("-").map(Number);
    // Only show first and last to avoid flooding
    return [start];
  }

  // Handle comma list: 8,10,12,14
  if (hourPart.includes(",")) {
    return hourPart.split(",").map(Number).filter(n => !isNaN(n));
  }

  // Single hour
  const h = parseInt(hourPart, 10);
  if (isNaN(h)) return [];

  // Also factor in minute offset for display (just hour)
  const m = parseInt(minutePart, 10);
  void m; // we show only the hour slot
  return [h];
}

// Derive calendar jobs from realCronJobs
const cronJobs: CalendarJob[] = [];
for (const job of realCronJobs) {
  const agentId = job.agent.toLowerCase() as 'ari' | 'arlo' | 'axel';
  if (!['ari', 'arlo', 'axel'].includes(agentId)) continue;
  const hours = parseHours(job.schedule);
  for (const h of hours) {
    cronJobs.push({
      name: job.name,
      time: h.toString().padStart(2, '0') + ':00',
      agent: agentId,
      frequency: job.schedule,
    });
  }
}

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6am to 10pm (21)

export default function CalendarPage() {
  const [compactMode, setCompactMode] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  const getJobsForTimeSlot = (hour: number) => {
    const hourStr = hour.toString().padStart(2, '0') + ':00';
    return cronJobs.filter(job => job.time === hourStr);
  };

  const getAgentColor = (agentId: string, opacity = 100) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return 'bg-gray-500';
    const opacityMap: { [key: number]: string } = { 100: '', 75: '/75', 50: '/50', 25: '/25' };
    return `bg-${agent.color}-500${opacityMap[opacity]}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Team Calendar</h2>
          <p className="text-sm text-slate-400 mt-1">Agent cron job schedules</p>
        </div>
        <button
          onClick={() => setCompactMode(!compactMode)}
          className="px-3 py-1 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 text-sm border border-slate-600"
        >
          {compactMode ? 'Full View' : 'Compact'}
        </button>
      </div>

      {/* Agent Filter Buttons */}
      <div className="flex items-center space-x-4">
        <span className="text-sm text-slate-400">Filter:</span>
        <button
          onClick={() => setSelectedAgent(null)}
          className={`px-3 py-1 rounded-md text-sm border ${
            selectedAgent === null
              ? 'bg-slate-600 text-slate-100 border-slate-500'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
          }`}
        >
          All Agents
        </button>
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => setSelectedAgent(agent.id)}
            className={`px-3 py-1 rounded-md text-sm border flex items-center space-x-2 ${
              selectedAgent === agent.id
                ? `bg-${agent.color}-600 text-white border-${agent.color}-500`
                : `bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700`
            }`}
          >
            <span>{agent.emoji}</span>
            <span>{agent.name}</span>
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Legend</h3>
        <div className="flex flex-wrap gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center space-x-2">
              <div className={`w-4 h-4 rounded ${agent.colorClass}`}></div>
              <span className="text-sm text-slate-300">{agent.emoji} {agent.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-full">
            <div className="grid grid-cols-6 bg-slate-900 border-b border-slate-700">
              <div className="p-3 text-sm font-semibold text-slate-300 border-r border-slate-700">Time</div>
              {weekDays.map((day) => (
                <div key={day} className="p-3 text-sm font-semibold text-slate-300 text-center border-r border-slate-700 last:border-r-0">{day}</div>
              ))}
            </div>

            {hours.map((hour) => {
              const jobs = getJobsForTimeSlot(hour);
              const filteredHourJobs = selectedAgent ? jobs.filter(j => j.agent === selectedAgent) : jobs;

              return (
                <div key={hour} className="grid grid-cols-6 border-b border-slate-700 last:border-b-0">
                  <div className="p-3 text-sm text-slate-400 border-r border-slate-700 bg-slate-900/50">
                    {formatHour(hour)}
                  </div>
                  {weekDays.map((day) => (
                    <div key={`${day}-${hour}`} className="p-1 border-r border-slate-700 last:border-r-0 min-h-[60px] relative">
                      {compactMode ? (
                        <div className="flex flex-wrap gap-1">
                          {filteredHourJobs.map((job, index) => (
                            <div
                              key={index}
                              className={`w-3 h-3 rounded-full ${getAgentColor(job.agent)} cursor-pointer`}
                              title={`${agents.find(a => a.id === job.agent)?.emoji} ${job.name}`}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {filteredHourJobs.map((job, index) => (
                            <div
                              key={index}
                              className={`${getAgentColor(job.agent, 75)} border ${getAgentColor(job.agent)} border-opacity-50 rounded px-2 py-1 text-xs text-slate-900 font-medium cursor-pointer hover:opacity-80 transition-opacity`}
                              title={`${agents.find(a => a.id === job.agent)?.emoji} ${job.name} · ${job.frequency}`}
                            >
                              <div className="truncate">
                                {agents.find(a => a.id === job.agent)?.emoji} {job.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">Schedule Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {agents.map((agent) => {
            const agentJobs = realCronJobs.filter(j => j.agent.toLowerCase() === agent.id);
            return (
              <div key={agent.id} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <span className="text-2xl">{agent.emoji}</span>
                  <h4 className="text-lg font-semibold text-slate-100">{agent.name}</h4>
                  <div className={`w-3 h-3 rounded-full ${agent.colorClass}`}></div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Jobs:</span>
                    <span className="text-slate-300 font-medium">{agentJobs.length}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
