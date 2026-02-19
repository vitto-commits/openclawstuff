'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSSE } from '@/hooks/useSSE';
import { fadeInUp, staggerContainer, popIn, overlayVariants, modalVariants } from '@/lib/animations';
import { apiJson } from '@/lib/api';

interface TodoItem {
  id: string;
  title: string;
  description: string;
  created_at: string;
}

interface AgentTask {
  id: string;
  label: string;
  description: string;
  model: string;
  status: 'in_progress' | 'done' | 'failed';
  spawned_at: string;
  completed_at?: string;
  duration?: string;
}

interface TaskData {
  todo: TodoItem[];
  in_progress: AgentTask[];
  done: AgentTask[];
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'in_progress') {
    return (
      <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    );
  }
  if (status === 'done') {
    return (
      <motion.span
        className="text-green-500 text-sm font-bold"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
      >✓</motion.span>
    );
  }
  return <span className="text-red-500 text-sm font-bold">✕</span>;
}

function AgentTaskCard({ task }: { task: AgentTask }) {
  return (
    <motion.div
      variants={fadeInUp}
      className="bg-white rounded-lg p-3 shadow-sm border border-gray-100"
      whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon status={task.status} />
          <span className="text-sm font-medium text-gray-900 truncate">{task.label}</span>
        </div>
        {task.duration && (
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{task.duration}</span>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">{task.description}</p>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{task.model}</span>
        <span className="text-[10px] text-gray-400">{timeAgo(task.spawned_at)}</span>
      </div>
    </motion.div>
  );
}

export default function KanbanBoard() {
  const [data, setData] = useState<TaskData>({ todo: [], in_progress: [], done: [] });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });

  const load = useCallback(async () => {
    try {
      const data = await apiJson<TaskData>('/api/tasks');
      setData(data);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  useSSE({
    handlers: { tasks: (d) => {
      // Only accept SSE updates if they have real data (not empty overwrites from local file SSE)
      if (d && (d.todo?.length > 0 || d.in_progress?.length > 0 || d.done?.length > 0)) setData(d);
    } },
    pollInterval: 15000,
    pollFallbacks: { tasks: load },
  });

  const addTodo = async () => {
    if (!form.title.trim()) return;
    await apiJson('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm({ title: '', description: '' });
    setShowAdd(false);
    load();
  };

  const deleteTodo = async (id: string) => {
    await apiJson('/api/tasks', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    load();
  };

  const columns = [
    {
      id: 'todo',
      label: 'To Do',
      color: 'bg-gray-50',
      count: data.todo.length,
      items: data.todo,
    },
    {
      id: 'in_progress',
      label: 'In Progress',
      color: 'bg-blue-50/50',
      count: data.in_progress.length,
      items: data.in_progress,
    },
    {
      id: 'done',
      label: 'Done',
      color: 'bg-green-50/50',
      count: data.done.length,
      items: data.done,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Task Board</h2>
        <motion.button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          + Add To Do
        </motion.button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center"
            onClick={() => setShowAdd(false)}
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <h3 className="text-lg font-semibold mb-4">Add Planned Task</h3>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-3 text-sm focus:outline-none focus:border-gray-400"
                placeholder="Title"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && addTodo()}
              />
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-4 text-sm focus:outline-none focus:border-gray-400 resize-none"
                placeholder="Description (optional)"
                rows={3}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={addTodo} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">Add</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .kanban-column {
          height: calc(100vh - 220px);
          max-height: calc(100vh - 220px);
          overflow-y: auto;
          overflow-x: hidden;
        }
        .kanban-column::-webkit-scrollbar {
          width: 6px;
        }
        .kanban-column::-webkit-scrollbar-track {
          background: transparent;
        }
        .kanban-column::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }
        .kanban-column::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        .kanban-header {
          position: sticky;
          top: 0;
          z-index: 10;
          padding-bottom: 0.75rem;
          margin-bottom: 0.75rem;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }
      `}</style>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map(col => (
          <motion.div
            key={col.id}
            className={`${col.color} rounded-xl p-4 kanban-column flex flex-col`}
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            <div className="kanban-header flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
              <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full">{col.count}</span>
            </div>
            <motion.div className="space-y-2 flex-1" variants={staggerContainer} initial="hidden" animate="visible">
              <AnimatePresence>
                {col.id === 'todo' && (col.items as TodoItem[]).map(item => (
                  <motion.div
                    key={item.id}
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                    layout
                    className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 group"
                    whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-medium text-gray-900">{item.title}</span>
                      <button
                        onClick={() => deleteTodo(item.id)}
                        className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                      >✕</button>
                    </div>
                    {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
                    <span className="text-[10px] text-gray-400 mt-1.5 block">{timeAgo(item.created_at)}</span>
                  </motion.div>
                ))}
                {col.id !== 'todo' && (col.items as AgentTask[]).map(task => (
                  <AgentTaskCard key={task.id} task={task} />
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
