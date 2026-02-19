'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeInUp, overlayVariants } from '@/lib/animations';
import { apiJson } from '@/lib/api';

interface CronJob {
  id: string;
  name: string;
  scheduleType: string;
  scheduleValue: string;
  scheduleHuman: string;
  description: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
    >
      <motion.span
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow"
        animate={{ left: enabled ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

export default function CronManager() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', scheduleType: 'cron', scheduleValue: '', scheduleHuman: '', description: '', enabled: true });

  const fetchJobs = useCallback(async () => {
    try {
      const data = await apiJson<any>('/api/cron');
      setJobs(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const toggle = async (job: CronJob) => {
    await apiJson('/api/cron', {
      method: 'PUT',
      body: JSON.stringify({ id: job.id, enabled: !job.enabled }),
    });
    fetchJobs();
  };

  const deleteJob = async (id: string) => {
    await apiJson(`/api/cron?id=${id}`, { method: 'DELETE' });
    fetchJobs();
  };

  const createJob = async () => {
    await apiJson('/api/cron', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm({ name: '', scheduleType: 'cron', scheduleValue: '', scheduleHuman: '', description: '', enabled: true });
    setShowForm(false);
    fetchJobs();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-gray-900">Cron Jobs</h2>
          <p className="text-sm text-gray-500 mt-0.5">{jobs.length} job{jobs.length !== 1 ? 's' : ''} configured</p>
        </div>
        <motion.button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {showForm ? 'Cancel' : '+ New Job'}
        </motion.button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            className="bg-white border border-gray-200 rounded-xl p-5 mb-6"
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-4">New Cron Job</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Job name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Schedule Type</label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white"
                  value={form.scheduleType}
                  onChange={e => setForm({ ...form, scheduleType: e.target.value })}
                >
                  <option value="cron">Cron Expression</option>
                  <option value="interval">Interval</option>
                  <option value="one-shot">One-shot</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Schedule Value</label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  value={form.scheduleValue}
                  onChange={e => setForm({ ...form, scheduleValue: e.target.value })}
                  placeholder="e.g. 0 */6 * * * or 30m"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Human-readable Schedule</label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  value={form.scheduleHuman}
                  onChange={e => setForm({ ...form, scheduleHuman: e.target.value })}
                  placeholder="e.g. Every 6 hours"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Description / Payload</label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="What does this job do?"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500">Enabled</label>
                <Toggle enabled={form.enabled} onToggle={() => setForm({ ...form, enabled: !form.enabled })} />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <motion.button
                onClick={createJob}
                disabled={!form.name || !form.scheduleValue}
                className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Create Job
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile: card layout */}
      <div className="md:hidden space-y-3">
        {jobs.length === 0 && (
          <motion.div
            className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center text-sm text-gray-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            No cron jobs configured
          </motion.div>
        )}
        <AnimatePresence>
          {jobs.map(job => (
            <motion.div
              key={job.id}
              className="bg-white border border-gray-200 rounded-xl p-4"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              layout
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-900">{job.name}</div>
                  {job.description && <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{job.description}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Toggle enabled={job.enabled} onToggle={() => toggle(job)} />
                  <motion.button
                    onClick={() => deleteJob(job.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors text-sm p-1"
                    whileTap={{ scale: 0.9 }}
                  >✕</motion.button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-400">Schedule</div>
                  <div className="text-gray-700 font-medium mt-0.5">{job.scheduleHuman || job.scheduleValue}</div>
                  <div className="text-gray-400 font-mono mt-0.5">{job.scheduleValue}</div>
                </div>
                <div>
                  <div className="text-gray-400">Last / Next Run</div>
                  <div className="text-gray-600 mt-0.5">{job.lastRun ? new Date(job.lastRun).toLocaleDateString() : '—'}</div>
                  <div className="text-gray-400 mt-0.5">{job.nextRun ? new Date(job.nextRun).toLocaleDateString() : '—'}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Desktop: table layout */}
      <motion.div
        className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Name</th>
              <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Schedule</th>
              <th className="text-left text-xs font-medium text-gray-500 px-5 py-3 hidden lg:table-cell">Last Run</th>
              <th className="text-left text-xs font-medium text-gray-500 px-5 py-3 hidden lg:table-cell">Next Run</th>
              <th className="text-center text-xs font-medium text-gray-500 px-5 py-3">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">No cron jobs configured</td></tr>
            )}
            <AnimatePresence>
              {jobs.map(job => (
                <motion.tr
                  key={job.id}
                  className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  layout
                >
                  <td className="px-5 py-3">
                    <div className="text-sm font-medium text-gray-900">{job.name}</div>
                    {job.description && <div className="text-xs text-gray-400 mt-0.5">{job.description}</div>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-sm text-gray-700">{job.scheduleHuman}</div>
                    <div className="text-xs text-gray-400 font-mono">{job.scheduleValue}</div>
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell text-sm text-gray-500">{formatDate(job.lastRun)}</td>
                  <td className="px-5 py-3 hidden lg:table-cell text-sm text-gray-500">{formatDate(job.nextRun)}</td>
                  <td className="px-5 py-3 text-center">
                    <Toggle enabled={job.enabled} onToggle={() => toggle(job)} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <motion.button
                      onClick={() => deleteJob(job.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors text-sm"
                      title="Delete"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      ✕
                    </motion.button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
