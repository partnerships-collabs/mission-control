'use client';

import { useState, useEffect } from "react";

interface CronJob {
  id: string;
  name: string;
  agent: string;
  schedule: string;
  lastStatus: 'success' | 'warning' | 'error';
  lastRun: string;
  consecutiveErrors: number;
  errorMessage?: string;
  duration: string;
  nextRun: string;
}

interface AgentInfo {
  id: string;
  name: string;
  model: string;
  uptime: string;
  lastActivity: string;
}

interface AgentDef {
  id: string;
  name: string;
  icon: string;
  role: string;
  workspacePath: string;
}

const agentDefs: AgentDef[] = [
  { id: "ari",  name: "Ari",  icon: "🧠", role: "main ops", workspacePath: "/Users/aurora/.openclaw/workspace" },
  { id: "arlo", name: "Arlo", icon: "📊", role: "sales",    workspacePath: "/Users/aurora/.openclaw/workspaces/arlo" },
  { id: "axel", name: "Axel", icon: "⚡", role: "dev",      workspacePath: "/Users/aurora/.openclaw/workspaces/axel" },
];

export default function AgentsPage() {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/crons').then(r => r.json()).catch(() => [] as CronJob[]),
      fetch('/api/agents').then(r => r.json()).catch(() => [] as AgentInfo[]),
    ]).then(([crons, agents]) => {
      setCronJobs(crons);
      setAgentInfo(agents);
      setLoading(false);
    });
  }, []);

  const toggleAgent = (agentId: string) => {
    setExpandedAgent(expandedAgent === agentId ? null : agentId);
  };

  function getAgentStats(agentName: string) {
    const jobs = cronJobs.filter(j => j.agent.toLowerCase() === agentName.toLowerCase());
    const successCount = jobs.filter(j => j.lastStatus === "success").length;
    const errorCount = jobs.filter(j => j.consecutiveErrors >= 3).length;
    const successRate = jobs.length > 0 ? `${Math.round((successCount / jobs.length) * 100)}%` : "—";
    return {
      cronJobsManaged: jobs.length,
      successRate,
      errorCount,
      assignedCrons: jobs,
    };
  }

  function getAgentLiveInfo(agentId: string): AgentInfo | undefined {
    return agentInfo.find(a => a.id === agentId || a.name?.toLowerCase() === agentId);
  }

  function getStatus(agentId: string): 'healthy' | 'warning' | 'error' {
    const stats = getAgentStats(agentId);
    if (stats.errorCount >= 3) return 'error';
    if (stats.errorCount >= 1) return 'warning';
    return 'healthy';
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-green-500';
    }
  };

  const totalCrons = agentDefs.reduce((sum, a) => sum + getAgentStats(a.id).cronJobsManaged, 0);
  const healthyCount = agentDefs.filter(a => getStatus(a.id) === 'healthy').length;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-100">Agents</h2>

      {loading ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-500">
          Loading agent data…
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {agentDefs.map((agent) => {
              const stats = getAgentStats(agent.id);
              const live = getAgentLiveInfo(agent.id);
              const status = getStatus(agent.id);

              return (
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
                            <div className={`w-2 h-2 rounded-full animate-pulse ${getStatusColor(status)}`}></div>
                          </div>
                          <p className="text-sm text-slate-400">{agent.role}</p>
                          <p className="text-sm text-slate-500">Model: {live?.model || "Sonnet 4.6"}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-6">
                        <div className="text-right">
                          <div className="text-sm text-slate-400">
                            Uptime: {live?.uptime || "—"}
                          </div>
                          <div className="text-sm text-slate-400">
                            Last: {live?.lastActivity || "—"}
                          </div>
                          <div className="text-sm text-slate-500">
                            {stats.cronJobsManaged} jobs · {stats.successRate} ok
                          </div>
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
                              <span className="text-sm text-slate-300">{stats.cronJobsManaged}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-slate-400">Success Rate:</span>
                              <span className={`text-sm font-medium ${stats.errorCount > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                {stats.successRate}
                              </span>
                            </div>
                            {stats.errorCount > 0 && (
                              <div className="flex justify-between">
                                <span className="text-sm text-slate-400">Jobs Erroring:</span>
                                <span className="text-sm text-red-400 font-medium">{stats.errorCount}</span>
                              </div>
                            )}
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
                            {stats.assignedCrons.map((job) => (
                              <div
                                key={job.id}
                                className="flex items-center justify-between p-2 bg-slate-700/50 rounded-md"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    job.consecutiveErrors >= 3 ? 'bg-red-400' :
                                    job.consecutiveErrors >= 1 ? 'bg-yellow-400' :
                                    'bg-green-400'
                                  }`} />
                                  <span className="text-sm font-mono text-slate-300 truncate">{job.name}</span>
                                </div>
                                <span className="text-xs text-slate-500 shrink-0 ml-2">{job.lastRun}</span>
                              </div>
                            ))}
                            {stats.assignedCrons.length === 0 && (
                              <p className="text-sm text-slate-500">No cron jobs assigned</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-700">
                        <div className="flex space-x-3">
                          <a
                            href="/crons"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                          >
                            View All Crons
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary Stats */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Agent Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-100">{agentDefs.length}</div>
                <div className="text-sm text-slate-400">Total Agents</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{healthyCount}</div>
                <div className="text-sm text-slate-400">Healthy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-100">{totalCrons}</div>
                <div className="text-sm text-slate-400">Total Cron Jobs</div>
              </div>
            </div>
          </div>

          {/* Daily Standup Section */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Daily Standup</h3>
            <p className="text-sm text-slate-500">No standup data available.</p>
          </div>
        </>
      )}
    </div>
  );
}
