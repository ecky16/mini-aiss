import React, { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { deleteLopFromSupabase, getLopsFromSupabase } from '../services/supabaseService';

interface LOP {
  id: string;
  name: string;
  type: string;
  companyName: string;
  status: string;
  createdAt: string;
}

export default function Dashboard({ profile, onSelectLop, onCreateLop }: { profile: any, onSelectLop: (id: string) => void, onCreateLop: () => void }) {
  const [lops, setLops] = useState<LOP[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'todo' | 'rejected'>('all');
  const [rejectedLopIds, setRejectedLopIds] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    const companyId = profile.role === 'mitra' ? profile.companyId : undefined;
    const lopData = await getLopsFromSupabase(companyId);
    setLops(lopData as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [profile.role, profile.companyId]);

  const filteredLops = lops.filter(lop => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      lop.name.toLowerCase().includes(searchLower) ||
      lop.companyName.toLowerCase().includes(searchLower) ||
      lop.type.toLowerCase().includes(searchLower) ||
      lop.status.toLowerCase().includes(searchLower);
    
    if (!matchesSearch) return false;

    if (activeFilter === 'rejected') {
      return rejectedLopIds.has(lop.id);
    }
    if (activeFilter === 'todo') {
      // "Todo" means not completed AND not currently rejected (rejected has its own tab)
      return lop.status !== 'completed' && !rejectedLopIds.has(lop.id);
    }
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-blue-500" />;
      default: return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const handleDeleteLop = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    try {
      await deleteLopFromSupabase(id);
      setLops(prev => prev.filter(l => l.id !== id));
    } catch (error) {
      console.error("Gagal menghapus LOP", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Projects (LOP)</h2>
          <p className="text-slate-500">
            {profile.role === 'admin' ? 'Kelola dan pantau semua pengajuan LOP' : `Daftar LOP untuk ${profile.companyName}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="Refresh Data"
          >
            <Clock className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
          {profile.role === 'admin' && (
            <button
              onClick={onCreateLop}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-all shadow-md"
            >
              <Plus className="w-5 h-5" />
              Create New LOP
            </button>
          )}
        </div>
      </div>

      {profile.role === 'mitra' && (
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveFilter('all')}
            className={cn(
              "px-4 py-2 text-sm font-bold rounded-lg transition-all",
              activeFilter === 'all' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Semua ({lops.length})
          </button>
          <button
            onClick={() => setActiveFilter('todo')}
            className={cn(
              "px-4 py-2 text-sm font-bold rounded-lg transition-all",
              activeFilter === 'todo' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Belum Selesai ({lops.filter(l => l.status !== 'completed' && !rejectedLopIds.has(l.id)).length})
          </button>
          <button
            onClick={() => setActiveFilter('rejected')}
            className={cn(
              "px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2",
              activeFilter === 'rejected' ? "bg-white text-red-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Ditolak ({lops.filter(l => rejectedLopIds.has(l.id)).length})
            {rejectedLopIds.size > 0 && (
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search LOP name or Mitra..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredLops.length > 0 ? (
        <div className="grid gap-4">
          {filteredLops.map((lop) => (
            <motion.div
              key={lop.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => onSelectLop(lop.id)}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {lop.type}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      {getStatusIcon(lop.status)}
                      <span className="capitalize">{lop.status.replace('_', ' ')}</span>
                    </div>
                    {rejectedLopIds.has(lop.id) && (
                      <span className="text-[10px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> PERLU REVISI
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                    {lop.name}
                  </h3>
                  <p className="text-sm text-slate-500">PT: {lop.companyName}</p>
                </div>
                <div className="flex items-center gap-2">
                  {profile.role === 'admin' && (
                    <button
                      onClick={(e) => handleDeleteLop(e, lop.id, lop.name)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Hapus Project"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white border border-dashed border-slate-300 rounded-2xl">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No projects found matching your search.</p>
        </div>
      )}
    </div>
  );
}
