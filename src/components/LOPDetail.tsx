import { useState, useEffect } from 'react';
import { ChevronLeft, CheckCircle, XCircle, Clock, AlertCircle, Upload, Download, FileArchive, MessageSquare, Loader2, Trash2, ExternalLink, List } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatBytes } from '../lib/utils';
import FileUploader from './FileUploader';
import JSZip from 'jszip';
import { 
  syncSubmissionToSupabase, 
  syncMandatoryUploadToSupabase, 
  getSubmissionsFromSupabase, 
  getMandatoryUploadsFromSupabase,
  deleteFilesFromSupabase,
  supabase
} from '../services/supabaseService';
import { sendTelegramMessage, sendTelegramFile, formatSubmissionNotification, formatQCNotification } from '../services/telegramService';

interface LOP {
  id: string;
  name: string;
  type: string;
  companyId: string;
  companyName: string;
  status: string;
  boq: { designator: string, description: string, qty: number }[];
}

interface Submission {
  id: string;
  lopId: string;
  boqIndex: number;
  status: 'pending' | 'approved' | 'rejected';
  files: { name: string, url: string, size: number, type: string }[];
  rejectReason?: string;
}

interface MandatoryUpload {
  id: string;
  lopId: string;
  type: string;
  files: { name: string, url: string, size: number, type: string }[];
}

export default function LOPDetail({ lopId, profile, onBack }: { lopId: string, profile: any, onBack: () => void }) {
  const [lop, setLop] = useState<LOP | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [mandatoryUploads, setMandatoryUploads] = useState<MandatoryUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [reviewing, setReviewing] = useState<{ index: number, type: 'boq' | 'mandatory', uploadId?: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const fetchData = async () => {
    if (!supabase) return;
    
    // Fetch LOP
    const { data: lopData } = await supabase.from('lops').select('*').eq('id', lopId).single();
    if (lopData) {
      // Fetch BOQ items for this LOP
      const { data: boqData } = await supabase.from('boq_items').select('*').eq('lop_id', lopId).order('item_index', { ascending: true });
      setLop({ 
        ...lopData, 
        boq: boqData?.map(b => ({ designator: b.designator, description: b.description, qty: b.qty })) || [] 
      } as any);
    }

    // Fetch Submissions
    const subs = await getSubmissionsFromSupabase(lopId);
    setSubmissions(subs.map(s => ({
      id: s.id,
      lopId: s.lop_id,
      boqIndex: s.boq_index,
      status: s.status,
      files: s.files,
      rejectReason: s.reject_reason
    })));

    // Fetch Mandatory Uploads
    const mands = await getMandatoryUploadsFromSupabase(lopId);
    setMandatoryUploads(mands.map(m => ({
      id: m.id,
      lopId: m.lop_id,
      type: m.type,
      files: m.files,
      status: m.status || 'pending',
      rejectReason: m.reject_reason || ''
    })));
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [lopId]);

  const handleUploadEvidence = async (boqIndex: number, files: any[]) => {
    const existing = submissions.find(s => s.boqIndex === boqIndex);
    const id = existing ? existing.id : crypto.randomUUID();
    
    // Delete old files from Supabase Storage if overwriting
    if (existing && existing.files && existing.files.length > 0) {
      await deleteFilesFromSupabase(existing.files.map((f: any) => f.url));
    }

    const subData = {
      lopId,
      companyId: lop?.companyId || '',
      boqIndex,
      files,
      status: 'pending',
      rejectReason: '',
      updatedAt: new Date().toISOString()
    };

    await syncSubmissionToSupabase(id, subData);
    await fetchData();
  };

  const handleUploadMandatory = async (type: string, files: any[]) => {
    const existing = mandatoryUploads.find(m => m.type === type);
    const id = existing ? existing.id : crypto.randomUUID();
    
    // Delete old files from Supabase Storage if overwriting
    if (existing && existing.files && existing.files.length > 0) {
      await deleteFilesFromSupabase(existing.files.map((f: any) => f.url));
    }

    const mandData = {
      lopId,
      companyId: lop?.companyId || '',
      type,
      files,
      status: 'pending',
      rejectReason: '',
      updatedAt: new Date().toISOString()
    };

    await syncMandatoryUploadToSupabase(id, mandData);
    await fetchData();
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!reviewing) return;

    try {
      if (reviewing.type === 'boq') {
        const sub = submissions.find(s => s.boqIndex === reviewing.index);
        if (sub) {
          const updatedSub = {
            lopId: sub.lopId,
            boqIndex: sub.boqIndex,
            status,
            rejectReason: status === 'rejected' ? rejectReason : '',
            files: sub.files,
            updatedAt: new Date().toISOString()
          };
          await syncSubmissionToSupabase(sub.id, updatedSub);
        }
      } else if (reviewing.type === 'mandatory') {
        const mand = mandatoryUploads.find(m => m.type === reviewing.mandatoryType);
        if (mand) {
          const updatedMand = {
            lopId: mand.lopId,
            type: mand.type,
            status,
            rejectReason: status === 'rejected' ? rejectReason : '',
            files: mand.files,
            updatedAt: new Date().toISOString()
          };
          await syncMandatoryUploadToSupabase(mand.id, updatedMand);
        }
      }
      await fetchData();
      setReviewing(null);
      setRejectReason('');
      setIsRejecting(false);
      
      if (status === 'approved') {
        alert("Berhasil di-approve!");
      } else {
        alert("Berhasil di-reject!");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan saat menyimpan review.");
    }
  };

  const handleCompleteAndArchive = async () => {
    if (!lop || !supabase) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const rootFolder = zip.folder(lop.name);
      const allUrls: string[] = [];

      // Add BOQ Evidence
      for (const sub of submissions) {
        if (sub.status === 'approved') {
          const designator = lop.boq[sub.boqIndex].designator;
          const boqFolder = rootFolder?.folder(designator);
          
          for (const file of sub.files) {
            allUrls.push(file.url);
            try {
              const filePath = file.url.split('/evidence/')[1];
              if (!filePath) throw new Error("Invalid URL path");
              const { data, error } = await supabase.storage.from('evidence').download(filePath);
              if (error) throw error;
              if (data) boqFolder?.file(file.name, data);
            } catch (err) {
              console.warn("Falling back to fetch for:", file.url, err);
              const response = await fetch(file.url);
              const blob = await response.blob();
              boqFolder?.file(file.name, blob);
            }
          }
        }
      }

      // Add Mandatory Uploads
      for (const mand of mandatoryUploads) {
        if (mand.status === 'approved') {
          const mandFolder = rootFolder?.folder(mand.type);
          for (const file of mand.files) {
            allUrls.push(file.url);
            try {
              const filePath = file.url.split('/evidence/')[1];
              if (!filePath) throw new Error("Invalid URL path");
              const { data, error } = await supabase.storage.from('evidence').download(filePath);
              if (error) throw error;
              if (data) mandFolder?.file(file.name, data);
            } catch (err) {
              console.warn("Falling back to fetch for:", file.url, err);
              const response = await fetch(file.url);
              const blob = await response.blob();
              mandFolder?.file(file.name, blob);
            }
          }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      
      // 1. Download locally
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${lop.name}.zip`;
      link.click();

      // 2. Send to Telegram
      let telegramSuccess = false;
      let telegramErrorMsg = '';
      try {
        const zipFile = new File([content], `${lop.name}.zip`, { type: 'application/zip' });
        if (zipFile.size > 50 * 1024 * 1024) {
          console.warn("ZIP file is larger than 50MB, Telegram might reject it.");
        }
        await sendTelegramFile(zipFile, `📦 ARSIP LOP SELESAI\n\nLOP: ${lop.name}\nPT: ${lop.companyName}\n\nSemua file telah di-approve dan diarsipkan.`);
        telegramSuccess = true;
      } catch (tgError: any) {
        console.error("Failed to send ZIP to Telegram:", tgError);
        telegramErrorMsg = tgError.message || 'Unknown error';
      }

      // 3. Delete from Supabase Storage
      await deleteFilesFromSupabase(allUrls);

      // 4. Clear files in DB to save space/clean up
      const archivedFile = [{ name: 'Archived in Telegram/Local', url: '', size: 0, type: 'zip' }];
      for (const sub of submissions) {
        await syncSubmissionToSupabase(sub.id, { ...sub, files: archivedFile });
      }
      for (const mand of mandatoryUploads) {
        await syncMandatoryUploadToSupabase(mand.id, { ...mand, files: archivedFile });
      }

      // 5. Update LOP Status
      await supabase.from('lops').update({ status: 'completed' }).eq('id', lop.id);
      
      if (telegramSuccess) {
        alert("✅ BERHASIL!\n\n1. File ZIP berhasil didownload ke komputer Anda.\n2. File ZIP berhasil dikirim ke Channel Telegram.\n3. File fisik di Supabase berhasil dihapus untuk menghemat storage.");
      } else {
        alert(`⚠️ SEBAGIAN BERHASIL!\n\n1. File ZIP berhasil didownload.\n2. File fisik di Supabase berhasil dihapus.\n\n❌ GAGAL mengirim ke Telegram:\n${telegramErrorMsg}`);
      }
      onBack();
    } catch (err) {
      console.error('Archive failed', err);
      alert("Terjadi kesalahan saat proses arsip.");
    } finally {
      setExporting(false);
    }
  };

  if (loading || !lop) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  const mandatoryTypes = [
    { name: 'ABD SW', mandatory: true, accept: { 'image/jpeg': ['.jpg', '.jpeg'] } },
    { name: 'EVIDENCE pra material', mandatory: true, accept: { 'application/zip': ['.zip'] } },
    { name: 'Hasil Ukur', mandatory: true, accept: { 'application/zip': ['.zip'] } },
    { name: 'BA Pendukung', mandatory: false, accept: { 'application/zip': ['.zip'] } }
  ];

  const allApproved = lop.boq.every((_, i) => submissions.find(s => s.boqIndex === i)?.status === 'approved');
  const mandatoryDone = mandatoryTypes.filter(t => t.mandatory).every(t => mandatoryUploads.find(m => m.type === t.name && m.status === 'approved'));

  const hasPendingOrRejected = submissions.some(s => s.status !== 'approved') || mandatoryUploads.some(m => m.status !== 'approved');
  const hasAnyApproved = submissions.some(s => s.status === 'approved') || mandatoryUploads.some(m => m.status === 'approved');
  
  const canComplete = !hasPendingOrRejected && hasAnyApproved;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8 pb-20"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
            <ChevronLeft className="w-6 h-6 text-slate-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{lop.name}</h2>
            <p className="text-sm text-slate-500">{lop.type} • PT: {lop.companyName}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {profile.role === 'admin' && (
            <>
              {canComplete ? (
                <>
                  {lop.status !== 'completed' ? (
                    <button
                      onClick={handleCompleteAndArchive}
                      disabled={exporting}
                      className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-all shadow-md shadow-green-100"
                    >
                      {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                      <span className="hidden sm:inline">Selesai & Arsipkan</span>
                    </button>
                  ) : (
                    <a
                      href="https://web.telegram.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-all shadow-md"
                    >
                      <MessageSquare className="w-5 h-5" />
                      <span className="hidden sm:inline">Cek Arsip di Telegram</span>
                    </a>
                  )}
                </>
              ) : (
                <button
                  onClick={async () => {
                    if (!supabase || !lop) return;
                    
                    // Generate Summary
                    let summary = `📋 <b>HASIL REVIEW LOP</b>\n\n`;
                    summary += `<b>LOP:</b> ${lop.name}\n`;
                    summary += `<b>Mitra:</b> ${lop.companyName}\n\n`;
                    
                    const approved: string[] = [];
                    const rejected: {name: string, reason: string}[] = [];
                    
                    submissions.forEach(sub => {
                      const name = lop.boq[sub.boqIndex].designator;
                      if (sub.status === 'approved') approved.push(name);
                      if (sub.status === 'rejected') rejected.push({name, reason: sub.rejectReason || ''});
                    });
                    
                    mandatoryUploads.forEach(mand => {
                      if (mand.status === 'approved') approved.push(`Mandatory: ${mand.type}`);
                      if (mand.status === 'rejected') rejected.push({name: `Mandatory: ${mand.type}`, reason: mand.rejectReason || ''});
                    });
                    
                    if (approved.length > 0) {
                      summary += `✅ <b>APPROVED:</b>\n`;
                      approved.forEach(item => summary += `- ${item}\n`);
                      summary += `\n`;
                    }
                    
                    if (rejected.length > 0) {
                      summary += `❌ <b>REJECTED (Perlu Perbaikan):</b>\n`;
                      rejected.forEach(item => summary += `- ${item.name}\n  <i>Alasan: ${item.reason}</i>\n`);
                    } else if (approved.length === 0) {
                      summary += `<i>Belum ada dokumen yang di-review.</i>`;
                    }
                    
                    try {
                      await sendTelegramMessage(summary);
                      alert("Hasil review berhasil dikirim ke Telegram!");
                    } catch (err) {
                      alert("Gagal mengirim hasil review ke Telegram.");
                    }
                  }}
                  className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg transition-all shadow-md"
                >
                  <MessageSquare className="w-5 h-5" />
                  <span className="hidden sm:inline">Kirim Hasil Review</span>
                </button>
              )}
            </>
          )}
          {profile.role === 'mitra' && lop.status !== 'completed' && (
            <button
              onClick={async () => {
                if (!supabase) return;
                await supabase.from('lops').update({ status: 'in_progress' }).eq('id', lop.id);
                alert("Status LOP berhasil diubah menjadi In Progress. Menunggu review Admin.");
                onBack(); // Go back to dashboard to see the updated status
              }}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-all shadow-md"
            >
              <CheckCircle className="w-5 h-5" />
              Selesai Upload
            </button>
          )}
        </div>
      </div>

      {/* Fully Approved Banner */}
      {canComplete && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-full">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-green-800 font-bold">Semua Dokumen Telah Disetujui</h3>
              <p className="text-green-600 text-sm">LOP ini sudah selesai di-review dan siap untuk diunduh.</p>
            </div>
          </div>
          {profile.role === 'admin' && (
            <div className="flex gap-2">
              {lop.status !== 'completed' ? (
                <button
                  onClick={handleCompleteAndArchive}
                  disabled={exporting}
                  className="hidden sm:flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-all shadow-md shadow-green-100"
                >
                  {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                  Selesai & Arsipkan
                </button>
              ) : (
                <a
                  href="https://web.telegram.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-all shadow-md"
                >
                  <MessageSquare className="w-5 h-5" />
                  Cek Arsip di Telegram
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mandatory Section */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <FileArchive className="w-5 h-5 text-blue-600" /> Mandatory & Optional Uploads
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {mandatoryTypes.map((type) => {
            const upload = mandatoryUploads.find(m => m.type === type.name);
            return (
              <div key={type.name} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">{type.name}</span>
                  {upload ? (
                    upload.status === 'approved' ? <CheckCircle className="w-4 h-4 text-green-500" /> :
                    upload.status === 'rejected' ? <XCircle className="w-4 h-4 text-red-500" /> :
                    <Clock className="w-4 h-4 text-blue-500" />
                  ) : type.mandatory && <AlertCircle className="w-4 h-4 text-amber-500" />}
                </div>
                
                {upload ? (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500 truncate">
                      {upload.files.length} file(s) uploaded
                    </div>
                    {upload.status === 'rejected' && (
                      <p className="text-xs text-red-500 font-medium">Rejected: {upload.rejectReason}</p>
                    )}
                    {profile.role === 'mitra' ? (
                      upload.status !== 'approved' && (
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-[10px] text-slate-400 mb-1">Upload ulang untuk mengganti file:</p>
                          <FileUploader 
                            onUploadComplete={(files) => handleUploadMandatory(type.name, files)}
                            maxSizeMB={10}
                            multiple={true}
                            telegramCaption={`Mandatory Re-upload: ${type.name}\nLOP: ${lop.name}\nMitra: ${profile.name}`}
                          />
                        </div>
                      )
                    ) : (
                      upload.status === 'pending' && (
                        <button 
                          onClick={() => setReviewing({ type: 'mandatory', mandatoryType: type.name })}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all w-full mt-2"
                        >
                          Review
                        </button>
                      )
                    )}
                  </div>
                ) : profile.role === 'mitra' ? (
                  <FileUploader 
                    onUploadComplete={(files) => handleUploadMandatory(type.name, files)}
                    maxSizeMB={10}
                    multiple={true}
                    telegramCaption={`Mandatory: ${type.name}\nLOP: ${lop.name}\nMitra: ${profile.name}`}
                  />
                ) : (
                  <p className="text-xs text-slate-400 italic">No upload yet</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* BOQ List */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <List className="w-5 h-5 text-blue-600" /> BOQ Items & Evidence
        </h3>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-600 text-sm font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Designator</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lop.boq.map((item, i) => {
                const sub = submissions.find(s => s.boqIndex === i);
                return (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{item.designator}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {item.description}
                      <div className="text-xs font-medium text-slate-400 mt-1">Qty: {item.qty}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        {!sub ? (
                          <span className="text-xs font-medium text-slate-400">Waiting</span>
                        ) : (
                          <div className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold uppercase",
                            sub.status === 'approved' ? "bg-green-100 text-green-700" :
                            sub.status === 'rejected' ? "bg-red-100 text-red-700" :
                            "bg-blue-100 text-blue-700"
                          )}>
                            {sub.status === 'approved' ? <CheckCircle className="w-3 h-3" /> :
                             sub.status === 'rejected' ? <XCircle className="w-3 h-3" /> :
                             <Clock className="w-3 h-3" />}
                            {sub.status}
                          </div>
                        )}
                      </div>
                      {sub?.status === 'rejected' && (
                        <div className="mt-1 text-[10px] text-red-500 text-center font-medium italic">
                          Reason: {sub.rejectReason}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {profile.role === 'mitra' ? (
                        (!sub || sub.status === 'rejected') ? (
                          <div className="flex flex-col items-end gap-2">
                            <button 
                              onClick={() => setReviewing({ index: i, type: 'boq' })}
                              className="text-blue-600 hover:text-blue-800 text-sm font-bold flex items-center gap-1 ml-auto"
                            >
                              <Upload className="w-4 h-4" /> {sub ? 'Re-upload' : 'Upload'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Submitted</span>
                        )
                      ) : (
                        sub && sub.status === 'pending' && (
                          <button 
                            onClick={() => setReviewing({ index: i, type: 'boq' })}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                          >
                            Review
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Review / Upload Modal */}
      <AnimatePresence>
        {reviewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h4 className="text-xl font-bold text-slate-900">
                  {profile.role === 'mitra' ? 'Upload Evidence' : 'Review Submission'}
                </h4>
                <button onClick={() => setReviewing(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                  <XCircle className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {profile.role === 'mitra' ? (
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                      <p className="text-sm font-bold text-blue-900">{lop.boq[reviewing.index].designator}</p>
                      <p className="text-xs text-blue-700">{lop.boq[reviewing.index].description}</p>
                    </div>
                    <FileUploader 
                      onUploadComplete={(files) => {
                        handleUploadEvidence(reviewing.index, files);
                        setReviewing(null);
                      }}
                      telegramCaption={`BOQ Evidence: ${lop.boq[reviewing.index].designator}\nLOP: ${lop.name}\nMitra: ${profile.name}`}
                    />
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <p className="text-sm font-bold text-slate-700">Submitted Files:</p>
                      <div className="grid gap-4 max-h-64 overflow-y-auto pr-2">
                        {(reviewing.type === 'boq' 
                          ? submissions.find(s => s.boqIndex === reviewing.index)?.files 
                          : mandatoryUploads.find(m => m.type === reviewing.mandatoryType)?.files
                        )?.map((f: any, idx: number) => {
                          const isImage = f.type?.startsWith('image/') || f.name.match(/\.(jpg|jpeg|png|gif)$/i);
                          return (
                            <div key={idx} className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                              {isImage ? (
                                <div className="w-full h-48 bg-slate-200 relative group">
                                  <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <ExternalLink className="w-8 h-8 text-white" />
                                  </a>
                                </div>
                              ) : null}
                              <a 
                                href={f.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-3 hover:bg-slate-100 transition-colors group"
                              >
                                <span className="text-xs font-medium text-slate-600 truncate flex-1">{f.name}</span>
                                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {isRejecting ? (
                      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                        <label className="text-sm font-bold text-slate-700">Alasan Reject</label>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Jelaskan kenapa file ini ditolak..."
                          className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none text-sm"
                          rows={3}
                        />
                        <div className="flex gap-3">
                          <button
                            onClick={() => setIsRejecting(false)}
                            className="flex-1 bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold py-3 rounded-xl transition-all"
                          >
                            Batal
                          </button>
                          <button
                            onClick={() => handleReview('rejected')}
                            disabled={!rejectReason}
                            className="flex-1 bg-red-600 text-white hover:bg-red-700 font-bold py-3 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-red-100"
                          >
                            Konfirmasi Reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <button
                          onClick={() => setIsRejecting(true)}
                          className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 font-bold py-3 rounded-xl transition-all"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleReview('approved')}
                          className="flex-1 bg-green-600 text-white hover:bg-green-700 font-bold py-3 rounded-xl transition-all shadow-lg shadow-green-100"
                        >
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
