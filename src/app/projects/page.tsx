'use client';

import React, { useEffect, useState } from 'react';

interface Project {
  id: string;
  name: string;
  status: "In Progress" | "Blocked" | "Done" | "On Hold";
  owner: string;
  description: string;
  blockingReason?: string;
  link?: string;
}

const statusConfig: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "In Progress": { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  "Blocked": { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-400" },
  "Done": { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20", dot: "bg-slate-400" },
  "On Hold": { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/20", dot: "bg-yellow-400" },
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch('/data/projects.json')
      .then(r => r.json())
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  const statusCounts = projects.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Projects</h1>
        <p className="text-sm text-slate-500 mt-1">Active initiatives across the agency</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["In Progress", "Blocked", "Done", "On Hold"] as const).map((status) => {
          const cfg = statusConfig[status];
          return (
            <div key={status} className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
              <div className="text-2xl font-bold text-slate-100">{statusCounts[status] || 0}</div>
              <div className={`text-xs font-medium ${cfg.text}`}>{status}</div>
            </div>
          );
        })}
      </div>

      {/* Project Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {projects.map((project) => {
          const cfg = statusConfig[project.status];
          return (
            <div
              key={project.id}
              className="bg-slate-900/50 border border-slate-800 rounded-xl p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-200">{project.name}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
                      {project.status}
                    </span>
                    <span className="text-xs text-slate-500">{project.owner}</span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-400 mb-3">{project.description}</p>

              {project.blockingReason && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 mb-3">
                  <div className="text-xs text-red-400">
                    <span className="font-medium">Blocked:</span> {project.blockingReason}
                  </div>
                </div>
              )}

              {project.link && (
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                >
                  View →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
