import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function parseBOQ(text: string) {
  // Simple parser for Excel copy-paste
  // Expected format: DESIGNATOR \t URAIAN PEKERJAAN \t Qty
  const lines = text.trim().split('\n');
  return lines.map(line => {
    const [designator, description, qty] = line.split('\t');
    return {
      designator: designator?.trim() || '',
      description: description?.trim() || '',
      qty: parseFloat(qty?.replace(',', '.') || '0') || 0
    };
  }).filter(item => item.designator || item.description);
}
