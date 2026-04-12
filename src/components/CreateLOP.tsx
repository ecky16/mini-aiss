import React, { useState, useEffect } from 'react';
import { X, Upload, Plus, Trash2, AlertCircle, Loader2, ChevronLeft, FileText, List, User, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { parseBOQ, cn } from '../lib/utils';
import { syncLopToSupabase, supabase } from '../services/supabaseService';
import { sendTelegramMessage, formatLopNotification } from '../services/telegramService';

interface Company {
  id: string;
  name: string;
}

export default function CreateLOP({ onBack, onSuccess }: { onBack: () => void, onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'QE QORRECTIVE' | 'QE PREVENTIVE'>('QE QORRECTIVE');
  const [companyId, setCompanyId] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [boqText, setBoqText] = useState('');
  const [parsedBoq, setParsedBoq] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCompanies = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('companies').select('*').order('name', { ascending: true });
      if (data) setCompanies(data.map(c => ({ id: c.id, name: c.name })));
    };
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (boqText) {
      setParsedBoq(parseBOQ(boqText));
    } else {
      setParsedBoq([]);
    }
  }, [boqText]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !companyId || parsedBoq.length === 0) {
      setError('Please fill all mandatory fields and provide BOQ data.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const selectedCompany = companies.find(c => c.id === companyId);
      const id = crypto.randomUUID();
      const lopData = {
        name,
        type,
        companyId,
        companyName: selectedCompany?.name || 'Unknown',
        status: 'pending',
        boq: parsedBoq,
        createdAt: new Date().toISOString()
      };
      
      await syncLopToSupabase(id, lopData);
      
      // Send Telegram Notification
      await sendTelegramMessage(formatLopNotification(name, selectedCompany?.name || 'Unknown', type));
      
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-slate-600" />
        </button>
        <h2 className="text-2xl font-bold text-slate-900">Create New Project (LOP)</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4" /> LOP Name (Mandatory)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 3PSN_QEREL_KU_ALUN-ALUN_PROBOLINGGO"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <List className="w-4 h-4" /> Job Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="QE QORRECTIVE">QE QORRECTIVE</option>
                <option value="QE PREVENTIVE">QE PREVENTIVE</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <User className="w-4 h-4" /> Select PT Mitra
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              required
            >
              <option value="">-- Choose PT Mitra --</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">
              Paste BOQ from Excel (Designator, Description, Qty)
            </label>
            <textarea
              value={boqText}
              onChange={(e) => setBoqText(e.target.value)}
              placeholder="Paste columns here..."
              rows={6}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm"
            />
          </div>

          {parsedBoq.length > 0 && (
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold">
                  <tr>
                    <th className="px-4 py-2">Designator</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedBoq.map((item, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{item.designator}</td>
                      <td className="px-4 py-2 text-slate-500">{item.description}</td>
                      <td className="px-4 py-2 text-right">{item.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-xl border border-red-100">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-200"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Create Project
        </button>
      </form>
    </motion.div>
  );
}
