"use client";

import { useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

type ProposalStatus =
  | "drafted"
  | "sent"
  | "responded"
  | "closed-won"
  | "closed-lost";

interface Proposal {
  slug: string;
  brandName: string;
  agentOwner: string;
  docUrl?: string;
  status: ProposalStatus;
  sentAt?: string;
  updatedAt: string;
}

interface CopperOpportunity {
  name: string;
  monetary_value: number;
  close_date: string | null;
  assignee_name: string;
  stage: string;
}

interface PipelineData {
  opportunities: CopperOpportunity[];
  totalOpenValue: number;
  updatedAt: string;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

const STATUS_PILL: Record<ProposalStatus, string> = {
  drafted: "bg-slate-700 text-slate-300",
  sent: "bg-blue-900 text-blue-300",
  responded: "bg-yellow-900 text-yellow-300",
  "closed-won": "bg-emerald-900 text-emerald-400",
  "closed-lost": "bg-red-900 text-red-400",
};

const ACTIVE_STATUSES: ProposalStatus[] = ["drafted", "sent", "responded"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [loadingPipeline, setLoadingPipeline] = useState(true);

  useEffect(() => {
    fetch("/api/proposals")
      .then((r) => r.json())
      .then((d) => {
        setProposals(d.proposals || []);
        setLoadingProposals(false);
      })
      .catch(() => setLoadingProposals(false));

    fetch("/api/copper-pipeline")
      .then((r) => r.json())
      .then((d) => {
        setPipeline(d);
        setLoadingPipeline(false);
      })
      .catch(() => setLoadingPipeline(false));
  }, []);

  const activeProposals = proposals.filter((p) =>
    ACTIVE_STATUSES.includes(p.status)
  );
  const closedProposals = proposals.filter(
    (p) => !ACTIVE_STATUSES.includes(p.status)
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Sales Pipeline</h1>
        <p className="text-sm text-slate-500 mt-1">
          Deal tracking and proposal visibility
        </p>
      </div>

      {/* ── Section A: Proposals ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-100">Proposals</h2>
          <span className="text-xs text-slate-500">
            {proposals.length} total · {activeProposals.length} active
          </span>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          {loadingProposals ? (
            <div className="p-8 text-center text-slate-500 text-sm animate-pulse">
              Loading proposals…
            </div>
          ) : proposals.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-3xl mb-3 opacity-20">📄</div>
              <p className="text-slate-400 text-sm">
                No proposals yet — Arlo will populate this once the first
                proposal is sent.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Brand
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Sent
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Doc
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...activeProposals, ...closedProposals].map((p) => (
                  <tr
                    key={p.slug}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-100 font-medium">
                      {p.brandName}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{p.agentOwner}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_PILL[p.status] || "bg-slate-700 text-slate-300"}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {p.sentAt
                        ? new Date(p.sentAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.docUrl ? (
                        <a
                          href={p.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 text-xs underline underline-offset-2"
                        >
                          View →
                        </a>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Section B: Copper Pipeline ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-100">
            Copper Open Pipeline
          </h2>
          {pipeline && (
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-semibold text-sm">
                {fmt(pipeline.totalOpenValue)} total open
              </span>
              <span className="text-xs text-slate-500">
                {pipeline.opportunities.length} deals
              </span>
            </div>
          )}
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          {loadingPipeline ? (
            <div className="p-8 text-center text-slate-500 text-sm animate-pulse">
              Loading Copper pipeline…
            </div>
          ) : !pipeline || pipeline.opportunities.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-3xl mb-3 opacity-20">📊</div>
              <p className="text-slate-400 text-sm">
                {pipeline?.error
                  ? `Error loading pipeline: ${pipeline.error}`
                  : "No open opportunities in Copper."}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Opportunity
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Value
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Close Date
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Stage
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Assignee
                  </th>
                </tr>
              </thead>
              <tbody>
                {pipeline.opportunities.map((opp, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-100 font-medium max-w-xs truncate">
                      {opp.name}
                    </td>
                    <td className="px-4 py-3 text-emerald-400 font-mono text-xs">
                      {opp.monetary_value ? fmt(opp.monetary_value) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {opp.close_date
                        ? new Date(opp.close_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300">
                        {opp.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {opp.assignee_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pipeline?.updatedAt && (
          <p className="text-xs text-slate-600 mt-2 text-right">
            Last updated: {new Date(pipeline.updatedAt).toLocaleTimeString()}
          </p>
        )}
      </section>
    </div>
  );
}
