'use client';

import { useState } from "react";

interface Agent {
  id: string;
  name: string;
  icon: string;
  model: string;
  role: string;
  workspacePath: string;
  status: 'healthy' | 'warning' | 'error';
  uptime: string;
  lastActivity: string;
  assignedCrons: string[];
  stats: {
    cronJobsManaged: number;
    successRate: string;
    avgResponseTime: string;
    memoryUsage: string;
  };
}

const agents: Agent[] = [
  {
    id: "ari",
    name: "Ari",
    icon: "🧠",
    model: "Opus 4.6",
    role: "main ops",
    workspacePath: "/Users/aurora/.openclaw/workspace",
    status: "healthy",
    uptime: "99.2\u0025",
    lastActivity: "2 mins ago",
    assignedCrons: [
      "Daily 7am Morning Brief for Apple",
      "apple-email-scan",
      "contract-matcher",
      "creator-enrichment-1am",
      "brand-db-enrich-1",
      "security-watchdog",
      "aaron-daily-briefing",
      "daily-backup",
      "agentio-pipeline-watchdog",
      "80K Discovery Checkpoint",
      "memory-filing",
      "email-check-9am",
      "aaron-typo-roast",
      "email-check-1pm",
      "email-check-6pm",
      "nightly-tier-classification",
      "api-cost-monitor",
      "weekly-read-later-digest",
      "Weekly Feature Requests Digest",
      "weekly-avg-views-update",
      "weekly-security-audit",
      "weekly-sponsorship-monitor",
      "context-pruning",
      "weekly-creator-drought-monitor",
      "monthly-email-draft",
      "reengagement-check"
    ],
    stats: {
      cronJobsManaged: 52,
      successRate: "61.5\u0025",
      avgResponseTime: "45.2s",
      memoryUsage: "2.8GB",
    },
  },
  {
    id: "arlo",
    name: "Arlo",
    icon: "📊",
    model: "Sonnet 4",
    role: "sales",
    workspacePath: "/Users/aurora/.openclaw/workspaces/arlo",
    status: "healthy",
    uptime: "98.7\u0025",
    lastActivity: "5 mins ago",
    assignedCrons: [
      "daily-meeting-briefs",
      "arlo-memory-filing",
      "followup-engine",
      "arlo-heartbeat",
      "arlo-daily-digest",
      "followup-weekly-summary",
      "arlo-context-pruning",
      "cross-sell-weekly"
    ],
    stats: {
      cronJobsManaged: 8,
      successRate: "87.5\u0025",
      avgResponseTime: "18.3s",
      memoryUsage: "1.2GB",
    },
  },
  {
    id: "axel",
    name: "Axel",
    icon: "⚡",
    model: "Sonnet 4",
    role: "dev",
    workspacePath: "/Users/aurora/.openclaw/workspaces/axel",
    status: "healthy",
    uptime: "97.8\u0025",
    lastActivity: "8 mins ago",
    assignedCrons: [
      "axel-security-check",
      "axel-build-health",
      "axel-github-watch",
      "axel-memory-filing",
      "axel-morning-standup",
      "axel-context-pruning"
    ],
    stats: {
      cronJobsManaged: 6,
      successRate: "16.7\u0025",
      avgResponseTime: "0.5s",
      memoryUsage: "0.8GB",
    },
  },
];

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
      <h2 className="text-2xl font-bold text-zinc-100">Agents</h2>
      
      <div className="space-y-4">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-zinc-800 border border-zinc-700 rounded-lg">
            {/* Agent Header */}
            <div 
              className="p-6 cursor-pointer hover:bg-zinc-700/50 transition-colors"
              onClick={() => toggleAgent(agent.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="text-4xl">{agent.icon}</span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-xl font-semibold text-zinc-100">{agent.name}</h3>
                      <div className={`w-2 h-2 rounded-full animate-pulse ${getStatusColor(agent.status)}`}></div>
                    </div>
                    <p className="text-sm text-zinc-400">{agent.role}</p>
                    <p className="text-sm text-zinc-500">Model: {agent.model}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <div className="text-sm text-zinc-300">Uptime: {agent.uptime}</div>
                    <div className="text-sm text-zinc-400">Last: {agent.lastActivity}</div>
                  </div>
                  <div className="text-zinc-400">
                    {expandedAgent === agent.id ? '▼' : '▶'}
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            {expandedAgent === agent.id && (
              <div className="border-t border-zinc-700 p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Agent Stats */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-zinc-200">Statistics</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-zinc-400">Cron Jobs Managed:</span>
                        <span className="text-sm text-zinc-300">{agent.stats.cronJobsManaged}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-zinc-400">Success Rate:</span>
                        <span className="text-sm text-green-400">{agent.stats.successRate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-zinc-400">Avg Response Time:</span>
                        <span className="text-sm text-zinc-300">{agent.stats.avgResponseTime}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-zinc-400">Memory Usage:</span>
                        <span className="text-sm text-zinc-300">{agent.stats.memoryUsage}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-zinc-400">Workspace:</span>
                        <span className="text-sm font-mono text-zinc-400 truncate">{agent.workspacePath}</span>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Cron Jobs */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-zinc-200">Assigned Cron Jobs</h4>
                    <div className="space-y-2">
                      {agent.assignedCrons.map((cronName, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-2 bg-zinc-700/50 rounded-md"
                        >
                          <span className="text-sm font-mono text-zinc-300">{cronName}</span>
                          <span className="text-xs text-zinc-500">Active</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 pt-4 border-t border-zinc-700">
                  <div className="flex space-x-3">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
                      View Logs
                    </button>
                    <button className="px-4 py-2 bg-zinc-600 text-zinc-200 rounded-md hover:bg-zinc-500 text-sm">
                      Manage Crons
                    </button>
                    <button className="px-4 py-2 bg-zinc-600 text-zinc-200 rounded-md hover:bg-zinc-500 text-sm">
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
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-zinc-100 mb-4">Agent Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-zinc-100">
              {agents.length}
            </div>
            <div className="text-sm text-zinc-400">Total Agents</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {agents.filter(a => a.status === 'healthy').length}
            </div>
            <div className="text-sm text-zinc-400">Healthy</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-zinc-100">
              {agents.reduce((sum, agent) => sum + agent.stats.cronJobsManaged, 0)}
            </div>
            <div className="text-sm text-zinc-400">Total Cron Jobs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">98.6\u0025</div>
            <div className="text-sm text-zinc-400">Overall Uptime</div>
          </div>
        </div>
      </div>
    </div>
  );
}