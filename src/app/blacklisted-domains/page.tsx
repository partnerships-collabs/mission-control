"use client";

import { useEffect, useState, useCallback } from "react";

const CA_DATA_URL = "https://ca-data.vercel.app";
const TOKEN = process.env.NEXT_PUBLIC_CA_DATA_TOKEN || "";

const CARD: React.CSSProperties = {
  backgroundColor: "#1e1e2e",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "12px",
};

interface BlacklistedDomain {
  id: number;
  domain: string;
  note: string | null;
  added_at: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function BlacklistedDomainsPage() {
  const [domains, setDomains] = useState<BlacklistedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [newDomain, setNewDomain] = useState("");
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch(`${CA_DATA_URL}/blacklisted-domains`, {
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDomains(data.domains || []);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`${CA_DATA_URL}/blacklisted-domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        },
        body: JSON.stringify({ domain: newDomain.trim(), note: newNote.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setNewDomain("");
      setNewNote("");
      await fetchDomains();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(domain: string, id: number) {
    setDeletingId(id);
    try {
      const res = await fetch(`${CA_DATA_URL}/blacklisted-domains/${encodeURIComponent(domain)}`, {
        method: "DELETE",
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchDomains();
    } catch (e: unknown) {
      console.error("Delete failed:", e);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Blacklisted Domains</h1>
        <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
          Domains excluded from sponsor detection. Managed manually.
        </p>
      </div>

      {/* Add Form */}
      <div style={CARD} className="p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Add Domain</h2>
        <form onSubmit={handleAdd} className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="e.g. amazon.com"
            className="flex-1 min-w-[180px] px-3 py-2 rounded-lg text-sm text-white outline-none"
            style={{
              backgroundColor: "#13131f",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e5e7eb",
            }}
          />
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: "#13131f",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e5e7eb",
            }}
          />
          <button
            type="submit"
            disabled={adding || !newDomain.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "#6366f1", color: "#fff" }}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
        {addError && (
          <p className="mt-2 text-xs" style={{ color: "#ef4444" }}>{addError}</p>
        )}
      </div>

      {/* Table */}
      <div style={CARD} className="overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-semibold text-white">
            Entries{" "}
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
              {domains.length}
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: "#6b7280" }}>Loading…</div>
        ) : error ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: "#ef4444" }}>{error}</div>
        ) : domains.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: "#6b7280" }}>No blacklisted domains yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>Domain</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>Note</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>Added</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}></th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr
                  key={d.id}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-5 py-3 font-mono text-xs text-white">{d.domain}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: "#9ca3af" }}>{d.note || <span style={{ color: "#374151" }}>—</span>}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: "#6b7280" }}>{timeAgo(d.added_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDelete(d.domain, d.id)}
                      disabled={deletingId === d.id}
                      className="px-3 py-1 rounded text-xs font-medium transition-opacity disabled:opacity-40"
                      style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      {deletingId === d.id ? "Removing…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
