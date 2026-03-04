'use client';

import { useState } from "react";
import { realCronJobs } from "@/app/crons/real-cron-data";

interface Agent {
  id: string;
  name: string;
  icon: string;
  model: string;
  role: string;
  workspacePath: string;
  status: 'healthy' | 'warning' | 'error';
  lastActivity: string;
}

const agentDefs: Agent[] = [
  {
    id: "ari",
    name: "Ari",
    icon: "🧠",
    model: "Sonnet 4.6",
    role: "main ops",
    workspacePath: "/Users/aurora/.openclaw/workspace",
    status: "healthy",
    lastActivity: "—",
  },
  {
    id: "arlo",
    name: "Arlo",
    icon: "📊",
    model: "Sonnet 4.6",
    role: "sales",
    workspacePath: "/Users/aurora/.openclaw/workspaces/arlo",
    status: "healthy",
    lastActivity: "—",
  },
  {
    id: "axel",
    name: "Axel",
    icon: "⚡",
    model: "Sonnet 4.6",
    role: "dev",
    workspacePath: "/Users/aurora/.openclaw/workspaces/axel",
    status: "healthy",
    lastActivity: "—",
  },
];

// Compute stats from real cron data
function getAgentStats(agentName: string) {
  const jobs = realCronJobs.filter(j => j.agent.toLowerCase() === agentName.toLowerCase());
  const successCount = jobs.filter(j => j.lastStatus === "success").length;
  const successRate = jobs.length > 0 ? `${Math.round((successCount / jobs.length) * 100)}%` : "—";
  return {
    cronJobsManaged: jobs.length,
    successRate,
    assignedCrons: jobs.map(j => j.name),
  };
}

const agents = agentDefs.map(a => ({ ...a, ...getAgentStats(a.name) }));

export default function AgentsPage() {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const toggleAgent = (agentId: string) => {
    setExpandedAgent(expandedAgent === agentId ? null : agentId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-green-500';
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-100">Agents</h2>

      <div className="space-y-4">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-slate-800 border border-slate-700 rounded-lg">
            {/* Agent Header */}
            <div
              className="p-6 cursor-pointer hover:bg-slate-700/50 transition-colors"
              onClick={() => toggleAgent(agent.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="text-4xl">{agent.icon}</span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-xl font-semibold text-slate-100">{agent.name}</h3>
                      <div className={`w-2 h-2 rounded-full animate-pulse ${getStatusColor(agent.status)}`}></div>
                    </div>
                    <p className="text-sm text-slate-400">{agent.role}</p>
                    <p className="text-sm text-slate-500">Model: {agent.model}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <div className="text-sm text-slate-400">Uptime: —</div>
                    <div className="text-sm text-slate-400">Last: {agent.lastActivity}</div>
                  </div>
                  <div className="text-slate-400">
                    {expandedAgent === agent.id ? '▼' : '▶'}
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            {expandedAgent === agent.id && (
              <div className="border-t border-slate-700 p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Agent Stats */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-slate-200">Statistics</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-400">Cron Jobs Managed:</span>
                        <span className="text-sm text-slate-300">{agent.cronJobsManaged}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-400">Success Rate:</span>
                        <span className="text-sm text-green-400">{agent.successRate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-400">Workspace:</span>
                        <span className="text-sm font-mono text-slate-400 truncate">{agent.workspacePath}</span>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Cron Jobs */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-slate-200">Assigned Cron Jobs</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {agent.assignedCrons.map((cronName, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-slate-700/50 rounded-md"
                        >
                          <span className="text-sm font-mono text-slate-300">{cronName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 pt-4 border-t border-slate-700">
                  <div className="flex space-x-3">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
                      View Logs
                    </button>
                    <button className="px-4 py-2 bg-slate-600 text-slate-200 rounded-md hover:bg-slate-500 text-sm">
                      Manage Crons
                    </button>
                    <button className="px-4 py-2 bg-slate-600 text-slate-200 rounded-md hover:bg-slate-500 text-sm">
                      Agent Config
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">Agent Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-100">{agents.length}</div>
            <div className="text-sm text-slate-400">Total Agents</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {agents.filter(a => a.status === 'healthy').length}
            </div>
            <div className="text-sm text-slate-400">Healthy</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-100">
              {agents.reduce((sum, a) => sum + a.cronJobsManaged, 0)}
            </div>
            <div className="text-sm text-slate-400">Total Cron Jobs</div>
          </div>
        </div>
      </div>

      {/* Daily Standup Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">Daily Standup</h3>
        <p className="text-sm text-slate-500">No standup data available.</p>
      </div>
    </div>
  );
}
