'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeIn } from '@/lib/animations';
import { apiJson } from '@/lib/api';

interface MemFile { name: string; path: string; size: number; modified: string; category: string; }

export default function MemoryViewer() {
  const [files, setFiles] = useState<MemFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiJson<MemFile[]>('/api/memory').then(setFiles).catch(() => {});
  }, []);

  const openFile = async (filePath: string) => {
    setLoading(true);
    setSelected(filePath);
    try {
      const data = await apiJson<any>(`/api/memory?file=${encodeURIComponent(filePath)}`);
      setContent(data.content || data.error || '');
    } catch {}
    setLoading(false);
  };

  const formatSize = (b: number) => b < 1024 ? b + ' B' : (b / 1024).toFixed(1) + ' KB';

  const workspaceFiles = files.filter(f => f.category === 'workspace');
  const memoryFiles = files.filter(f => f.category === 'memory');

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Memory Viewer</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
        >
          {workspaceFiles.length > 0 && (
            <>
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Workspace</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {workspaceFiles.map(f => (
                  <motion.button
                    key={f.path}
                    onClick={() => openFile(f.path)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      selected === f.path ? 'bg-gray-50 border-l-2 border-gray-900' : ''
                    }`}
                    whileHover={{ x: 2 }}
                    transition={{ duration: 0.15 }}
                  >
                    <p className="text-sm font-medium text-gray-900">{f.name}</p>
                    <p className="text-xs text-gray-400">{formatSize(f.size)}</p>
                  </motion.button>
                ))}
              </div>
            </>
          )}
          {memoryFiles.length > 0 && (
            <>
              <div className="px-4 py-3 border-b border-gray-100 border-t">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Daily Memory</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {memoryFiles.map(f => (
                  <motion.button
                    key={f.path}
                    onClick={() => openFile(f.path)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      selected === f.path ? 'bg-gray-50 border-l-2 border-gray-900' : ''
                    }`}
                    whileHover={{ x: 2 }}
                    transition={{ duration: 0.15 }}
                  >
                    <p className="text-sm font-medium text-gray-900">{f.name}</p>
                    <p className="text-xs text-gray-400">{formatSize(f.size)} • {new Date(f.modified).toLocaleDateString()}</p>
                  </motion.button>
                ))}
              </div>
            </>
          )}
          {files.length === 0 && (
            <p className="text-sm text-gray-400 p-4">No memory files found</p>
          )}
        </motion.div>

        <motion.div
          className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        >
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">{selected || 'Select a file'}</h3>
            {selected && <span className="text-[10px] text-gray-400">Read-only</span>}
          </div>
          <div className="p-4 max-h-[600px] overflow-auto">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.p key="loading" className="text-sm text-gray-400" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>Loading...</motion.p>
              ) : content ? (
                <motion.pre
                  key={selected}
                  className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed"
                  variants={fadeIn}
                  initial="hidden"
                  animate="visible"
                >{content}</motion.pre>
              ) : (
                <motion.p key="empty" className="text-sm text-gray-400" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>Select a memory file to view its contents</motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
