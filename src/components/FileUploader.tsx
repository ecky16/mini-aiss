import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, Loader2, FileIcon } from 'lucide-react';
import { cn, formatBytes } from '../lib/utils';
import { sendTelegramFile, sendTelegramMediaGroup } from '../services/telegramService';
import { uploadFileToSupabase } from '../services/supabaseService';

interface FileUploaderProps {
  onUploadComplete: (files: { name: string, url: string, size: number, type: string, telegramMsgId?: number }[]) => void;
  maxSizeMB?: number;
  accept?: Record<string, string[]>;
  multiple?: boolean;
  telegramCaption?: string;
}

export default function FileUploader({ onUploadComplete, maxSizeMB = 10, accept, multiple = true, telegramCaption }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const totalSize = acceptedFiles.reduce((acc, file) => acc + file.size, 0);
    if (totalSize > maxSizeMB * 1024 * 1024) {
      setError(`Total size exceeds ${maxSizeMB}MB limit.`);
      return;
    }

    setUploading(true);
    setError('');
    const uploadedFiles: any[] = [];

    try {
      // Chunk files for Telegram (max 10 per group)
      const chunkSize = 10;
      for (let i = 0; i < acceptedFiles.length; i += chunkSize) {
        const chunk = acceptedFiles.slice(i, i + chunkSize);
        setProgress((i / acceptedFiles.length) * 100);

        // Upload to Telegram as a group
        const tgPromise = chunk.length > 1 
          ? sendTelegramMediaGroup(chunk, telegramCaption || `Evidence Upload`)
          : sendTelegramFile(chunk[0], telegramCaption || `Evidence: ${chunk[0].name}`);

        // Upload to Supabase individually
        const supabasePromises = chunk.map(file => uploadFileToSupabase(file, 'evidence'));

        const [tgResult, ...supabaseFiles] = await Promise.all([tgPromise, ...supabasePromises]);

        supabaseFiles.forEach((supabaseFile, idx) => {
          uploadedFiles.push({
            ...supabaseFile,
            telegramMsgId: Array.isArray(tgResult) ? tgResult[idx]?.message_id : tgResult?.message_id
          });
        });
      }
      setProgress(100);
      onUploadComplete(uploadedFiles);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [maxSizeMB, onUploadComplete, telegramCaption]);

  // @ts-ignore
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    maxSize: maxSizeMB * 1024 * 1024,
    accept: accept as any,
    multiple
  });

  return (
    <div className="space-y-2">
      <div 
        {...getRootProps()} 
        className={cn(
          "border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer flex flex-col items-center justify-center gap-2",
          isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50",
          uploading && "pointer-events-none opacity-60"
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-600">Uploading... {Math.round(progress)}%</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-600">
              {isDragActive ? "Drop files here" : "Click or drag files to upload"}
            </p>
            <p className="text-xs text-slate-400">Max {maxSizeMB}MB total</p>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}
