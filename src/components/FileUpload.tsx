'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { apiJson, apiFetch } from '@/lib/api';

export default function FileUpload() {
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const data = await apiJson<any>('/api/files');
      setFiles(Array.isArray(data) ? data : []);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const upload = async (fileList: FileList) => {
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        await apiFetch('/api/files', { method: 'POST', body: fd });
      } catch {}
    }
    setUploading(false);
    load();
  };

  const deleteFile = async (name: string) => {
    await apiJson('/api/files', {
      method: 'DELETE',
      body: JSON.stringify({ name }),
    });
    load();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div>
      <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 md:mb-6">Files</h2>

      <motion.div
        className={`border-2 border-dashed rounded-xl p-8 text-center mb-6 transition-colors cursor-pointer ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
        animate={dragOver ? { scale: 1.02 } : { scale: 1 }}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => e.target.files && upload(e.target.files)} />
        <motion.div
          className="text-3xl mb-2"
          animate={uploading ? { rotate: [0, 10, -10, 0] } : {}}
          transition={{ repeat: Infinity, duration: 0.5 }}
        >📂</motion.div>
        <p className="text-sm text-gray-600">{uploading ? 'Uploading...' : 'Drop files here or click to upload'}</p>
        <p className="text-xs text-gray-400 mt-1">Files are stored in ~/agent-dashboard/uploads/</p>
      </motion.div>

      {files.length === 0 ? (
        <p className="text-center text-gray-400 text-sm">No files uploaded yet</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
          <AnimatePresence>
            {files.map(f => (
              <motion.div
                key={f.name}
                className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 group"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                layout
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">📄</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{f.name}</p>
                    <p className="text-xs text-gray-400">{formatSize(f.size)}</p>
                  </div>
                </div>
                <motion.button
                  onClick={() => deleteFile(f.name)}
                  className="text-xs text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >Delete</motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
