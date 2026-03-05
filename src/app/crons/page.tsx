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

type SortField = keyof CronJob;
type SortDirection = 'asc' | 'desc';

export default function CronsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterAgent, setFilterAgent] = useState<string>('');

  useEffect(() => {
    fetch('/api/crons')
      .then(r => r.json())
      .then((data: CronJob[]) => { setJobs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedJobs = jobs
    .filter(job => filterAgent === '' || job.agent === filterAgent)
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * direction;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * direction;
      }
      return 0;
    });

  const getStatusColor = (status: string, consecutiveErrors: number) => {
    if (status === 'error' || consecutiveErrors >= 3) return 'bg-red-500';
    if (status === 'warning' || consecutiveErrors >= 1) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Cron Jobs</h1>
          {!loading && (
            <p className="text-sm text-slate-500 mt-1">{jobs.length} jobs · live from OpenClaw</p>
          )}
        </div>
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100"
        >
          <option value="">All Agents</option>
          <option value="Ari">Ari</option>
          <option value="Arlo">Arlo</option>
          <option value="Axel">Axel</option>
        </select>
      </div>

      {loading ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-500">
          Loading cron jobs…
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  {[
                    { key: 'name', label: 'Name' },
                    { key: 'agent', label: 'Agent' },
                    { key: 'schedule', label: 'Schedule' },
                    { key: 'lastStatus', label: 'Last Status' },
                    { key: 'lastRun', label: 'Last Run' },
                    { key: 'consecutiveErrors', label: 'Errors' },
                  ].map((column) => (
                    <th
                      key={column.key}
                      onClick={() => handleSort(column.key as SortField)}
                      className="text-left px-6 py-3 text-sm font-medium text-slate-200 cursor-pointer hover:bg-slate-600"
                    >
                      <div className="flex items-center space-x-1">
                        <span>{column.label}</span>
                        {sortField === column.key && (
                          <span className="text-slate-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-200">Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedJobs.map((job) => (
                  <tr key={job.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${getStatusColor(job.lastStatus, job.consecutiveErrors)}`}></div>
                        <span className="text-sm font-medium text-slate-200">{job.name}</span>
                      </div>
                      {job.errorMessage && (
                        <div className="text-xs text-red-400 mt-1 ml-4">{job.errorMessage}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">{job.agent}</td>
                    <td className="px-6 py-4 text-sm font-mono text-slate-300">{job.schedule}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        job.lastStatus === 'success' && job.consecutiveErrors === 0 ? 'bg-green-500/10 text-green-400' :
                        job.lastStatus === 'warning' || (job.consecutiveErrors >= 1 && job.consecutiveErrors < 3) ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {job.consecutiveErrors >= 3 ? 'error' : job.consecutiveErrors >= 1 ? 'warning' : job.lastStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">{job.lastRun}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm ${
                        job.consecutiveErrors === 0 ? 'text-slate-400' :
                        job.consecutiveErrors >= 3 ? 'text-red-400 font-semibold' :
                        'text-yellow-400 font-semibold'
                      }`}>
                        {job.consecutiveErrors}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{job.duration}</td>
                  </tr>
                ))}
                {filteredAndSortedJobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
                      No cron jobs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
