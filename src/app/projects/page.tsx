'use client';

import React from 'react';

interface Project {
  id: string;
  name: string;
  status: string;
  category: string;
  categoryColor: string;
  description: string;
  detail: string;
  progress?: number | null;
  blocker?: string | null;
  stats: Record<string, string>;
  link?: string | null;
}

const projects: Project[] = [
  {"id": "sponsor-v5", "name": "Sponsor Detection v5 Retrain", "status": "Blocked", "category": "AI/ML", "categoryColor": "pink", "description": "Targeting 95%+ recall — OOM crash at loss calc, needs config fix", "detail": "Training: OOM at iter 0/3000 - needs config fix. 1:1 balanced (335K examples), 6 LoRA layers, rank 12.", "progress": 0, "blocker": null, "stats": {"v4 Recall": "53%", "target": "95%+"}, "link": null},
  {"id": "inbound-engine", "name": "Inbound Email Engine", "status": "Blocked", "category": "Automation", "categoryColor": "violet", "description": "Built and tested, blocked on gmail.send scope for service account", "detail": "Creator identification, brand research via Perplexity, agent assignment, email drafting all working. Cannot send until gmail.send scope added.", "progress": 60, "blocker": "Need gmail.send scope added to service account", "stats": {}, "link": null},
  {"id": "pipeline", "name": "Sponsor Detection Pipeline", "status": "Running", "category": "Data Infrastructure", "categoryColor": "cyan", "description": "2,178,548 videos, 1,379,400 descriptions, 188K sponsorships", "detail": "Pipeline flow running continuously. Merging, harvesting, fetching.", "progress": 85, "stats": {"channels": "42,214", "videos": "2,178,548", "descriptions": "1,379,400", "sponsored": "187,915"}, "link": "/pipeline"},
  {"id": "agentio", "name": "Agentio Creator Sourcing", "status": "Running", "category": "Sales", "categoryColor": "orange", "description": "L1: 18,647/22,760 scanned. L2: 1365 processed, 671 passed. 111 pushed to sheet.", "detail": "8 L1 workers running. L2 uses Ollama llama3.3:70b. Watchdog auto-merges L1 results and pushes L2 passes to Charlie's Google Sheet every 30 min.", "progress": 81, "stats": {"pool": "22,760", "l1_scanned": "18,647", "l1_passed": "9,104", "l2_processed": "1,365", "l2_passed": "671", "pushed": "111"}, "link": null},
  {"id": "discovery", "name": "Perpetual Channel Discovery", "status": "Running", "category": "Data Infrastructure", "categoryColor": "cyan", "description": "Perpetual yt-dlp discovery on Mini. 100K+ candidates found, qualification ongoing.", "detail": "Always-on engine cycling 180+ queries across 27 niches. Candidates feed into qualification pipeline.", "progress": null, "stats": {"candidates": "100,303", "niches": "27"}, "link": null},
  {"id": "email-drip", "name": "Email Drip Campaigns", "status": "Running", "category": "Marketing", "categoryColor": "green", "description": "4-segment weekly drip via Mailchimp. 20 campaigns scheduled.", "detail": "6-week schedule across 4 segments. 1 email/week per segment, rotating weekdays.", "progress": null, "stats": {"segments": "4", "emails": "20"}, "link": null},
  {"id": "local-models", "name": "Local Model Utilization", "status": "Running", "category": "Infrastructure", "categoryColor": "gray", "description": "Ollama running llama3.3:70b + phi4 + nomic-embed-text + mixtral:8x22b", "detail": "Powering qualification niche detection, Agentio L2, niche classification (29K+ done). 24/7 utilization.", "progress": null, "stats": {"classifications Completed": "29,582"}, "link": null},
  {"id": "channel-qualification", "name": "Channel Qualification", "status": "Paused", "category": "Data Infrastructure", "categoryColor": "cyan", "description": "17,228 total qualified (idle)", "detail": "Batch progress: 49,400/49,477 checked. Rate: 17.5%.", "progress": 99, "stats": {"qualified": "17,228", "checked_this_batch": "49,400", "batch_total": "49,477", "workers": "0"}, "link": null},
  {"id": "scoring-v3", "name": "Scoring Model V3", "status": "Complete", "category": "Sales Intelligence", "categoryColor": "amber", "description": "6-signal brand-creator matching algorithm", "detail": "779 brands, 94,259 matches. Brand behavioral match, niche precision, competitive intel, price-market fit, audience demo, inventory momentum.", "progress": 100, "stats": {"brands": "821", "matches": "94,259"}, "link": null},
  {"id": "bizee", "name": "Bizee Partnership Hub", "status": "Complete", "category": "Client Deliverable", "categoryColor": "emerald", "description": "Live at reports.creatorsagency.co/bizee", "detail": "V3 complete. Deployed to Vercel, custom domain active. Daily auto-update cron running.", "progress": 100, "stats": {"views": "65.9M", "investment": "$675K", "creators": "3"}, "link": "https://reports.creatorsagency.co/bizee"},
  {"id": "brand-match-app", "name": "Brand Match App", "status": "Complete", "category": "Sales Intelligence", "categoryColor": "amber", "description": "v3 scoring live with 94,259 matches across 779 brands + 5 revenue capture pages", "detail": "Cross-sell (62 recs), Reverse Match, Contract Lifecycle, Category Gaps, Agent Blind Spots all live on Mini.", "progress": 100, "stats": {"brands": "779", "matches": "94,259"}, "link": "http://100.104.197.44:3000"},
  {"id": "vercel-deploy", "name": "Vercel Deployments", "status": "Complete", "category": "Infrastructure", "categoryColor": "gray", "description": "Bizee Hub deployed to Vercel with custom domain", "detail": "GitHub repo connected, auto-deploy on push. reports.creatorsagency.co/bizee live.", "progress": 100, "stats": {}, "link": null},
  {"id": "daily-backups", "name": "Daily Backup System", "status": "Complete", "category": "Infrastructure", "categoryColor": "gray", "description": "Git + local snapshots, 30-day rolling retention", "detail": "Layer 1: workspace auto-committed to GitHub daily. Layer 2: data/ compressed snapshots. Runs 3am CT.", "progress": 100, "stats": {}, "link": "https://github.com/partnerships-collabs/ari-workspace"},
  {"id": "revenue-capture", "name": "Revenue Capture Roadmap", "status": "Complete", "category": "Sales Intelligence", "categoryColor": "amber", "description": "All 5 revenue capture pages built and deployed", "detail": "Cross-sell (62 recs, 5 brands), Reverse Match (121 creators), Contract Lifecycle (1,473 deals), Category Gaps (373 brands), Agent Blind Spots (150 brands).", "progress": 100, "stats": {"phases": "5", "est Revenue": "$2-4M/yr"}, "link": "https://docs.google.com/document/d/1oiRv4_VO7K0Ke_dIUxdJO4rl2v_Hjxf4z_qyGnlnLwI/edit"},
  {"id": "cross-sell-alerts", "name": "Cross-Sell Alert System", "status": "Complete", "category": "Sales Intelligence", "categoryColor": "amber", "description": "5 brands with 62 cross-sell recommendations. Weekly Slack alerts Mondays 8 AM.", "detail": "Engine runs weekly. Per-agent Slack digests.", "progress": 100, "stats": {}, "link": null}
];

function getStatusColor(status: string): string {
  switch (status) {
    case 'Blocked':
      return 'bg-red-500';
    case 'Running':
      return 'bg-violet-500';
    case 'Paused':
      return 'bg-yellow-500';
    case 'Complete':
      return 'bg-emerald-500';
    default:
      return 'bg-gray-500';
  }
}

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'Blocked':
      return 'bg-red-900 text-red-200 border-red-700';
    case 'Running':
      return 'bg-violet-900 text-violet-200 border-violet-700';
    case 'Paused':
      return 'bg-yellow-900 text-yellow-200 border-yellow-700';
    case 'Complete':
      return 'bg-emerald-900 text-emerald-200 border-emerald-700';
    default:
      return 'bg-gray-900 text-gray-200 border-gray-700';
  }
}

function getCategoryColor(color: string): string {
  const colorMap: Record<string, string> = {
    pink: 'bg-pink-900 text-pink-200 border-pink-700',
    violet: 'bg-violet-900 text-violet-200 border-violet-700',
    cyan: 'bg-cyan-900 text-cyan-200 border-cyan-700',
    orange: 'bg-orange-900 text-orange-200 border-orange-700',
    green: 'bg-green-900 text-green-200 border-green-700',
    gray: 'bg-gray-900 text-gray-200 border-gray-700',
    amber: 'bg-amber-900 text-amber-200 border-amber-700',
    emerald: 'bg-emerald-900 text-emerald-200 border-emerald-700',
  };
  return colorMap[color] || 'bg-gray-900 text-gray-200 border-gray-700';
}

export default function ProjectsPage() {
  // Calculate status counts
  const statusCounts = projects.reduce((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalProjects = projects.length;
  const blockedCount = statusCounts['Blocked'] || 0;
  const runningCount = statusCounts['Running'] || 0;
  const pausedCount = statusCounts['Paused'] || 0;
  const completeCount = statusCounts['Complete'] || 0;

  return (
    <div className="space-y-6">
      {/* Summary Bar */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-zinc-100 mb-4">Project Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-zinc-100">{totalProjects}</div>
            <div className="text-sm text-zinc-400">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">{blockedCount}</div>
            <div className="text-sm text-zinc-400">Blocked</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-violet-400">{runningCount}</div>
            <div className="text-sm text-zinc-400">Running</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">{pausedCount}</div>
            <div className="text-sm text-zinc-400">Paused</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">{completeCount}</div>
            <div className="text-sm text-zinc-400">Complete</div>
          </div>
        </div>
      </div>

      {/* Project Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {projects.map((project) => (
          <div key={project.id} className="bg-zinc-800 border border-zinc-700 rounded-lg p-6 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-zinc-100 mb-2">{project.name}</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusBadgeColor(project.status)}`}>
                    {project.status}
                  </span>
                  <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getCategoryColor(project.categoryColor)}`}>
                    {project.category}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-zinc-300 mb-3">{project.description}</p>
            
            {/* Detail Text */}
            <p className="text-xs text-zinc-400 mb-4 flex-1">{project.detail}</p>

            {/* Progress Bar */}
            {project.progress !== null && project.progress !== undefined && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Progress</span>
                  <span>{project.progress}%</span>
                </div>
                <div className="w-full bg-zinc-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${getStatusColor(project.status)}`}
                    style={{ width: `${project.progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Stats Pills */}
            {Object.keys(project.stats).length > 0 && (
              <div className="mb-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(project.stats).map(([key, value]) => (
                    <div key={key} className="bg-zinc-700 px-2 py-1 rounded text-xs">
                      <span className="text-zinc-400">{key}:</span>
                      <span className="text-zinc-200 ml-1 font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Blocker Callout */}
            {project.blocker && (
              <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-md">
                <div className="flex items-center">
                  <span className="text-red-400 mr-2">⚠️</span>
                  <span className="text-red-200 text-sm font-medium">Blocked</span>
                </div>
                <p className="text-red-300 text-xs mt-1">{project.blocker}</p>
              </div>
            )}

            {/* External Link Button */}
            {project.link && (
              <div className="mt-auto">
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-blue-100 text-sm rounded-md transition-colors"
                >
                  <span>View Project</span>
                  <svg className="ml-1 w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}