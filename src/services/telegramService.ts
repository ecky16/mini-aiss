/**
 * Service to send notifications to a Telegram Channel
 */

const BOT_TOKEN = import.meta.env.TELEGRAM_BOT_TOKEN || import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const CHAT_ID = import.meta.env.TELEGRAM_CHAT_ID || import.meta.env.VITE_TELEGRAM_CHAT_ID;

// Debug logging to check if env vars are loaded
console.log("Telegram Config Loaded:", { 
  hasToken: !!BOT_TOKEN, 
  hasChatId: !!CHAT_ID,
  chatId: CHAT_ID // Safe to log chat ID
});

export async function sendTelegramMessage(message: string) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diatur.");
    return;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'HTML' }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram Message Error:', errorData);
    }
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
  }
}

export async function sendTelegramMediaGroup(files: File[], caption: string) {
  if (!BOT_TOKEN || !CHAT_ID) return null;
  if (files.length === 0) return null;

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`;
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);

  const media = files.map((file, index) => {
    const isImage = file.type.startsWith('image/');
    return {
      type: isImage ? 'photo' : 'document',
      media: `attach://file${index}`,
      caption: index === 0 ? caption : undefined,
      parse_mode: 'HTML'
    };
  });

  formData.append('media', JSON.stringify(media));

  files.forEach((file, index) => {
    formData.append(`file${index}`, file);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for group

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      console.error('Telegram API Error:', await response.text());
      return null;
    }
    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Failed to send Telegram media group:', error);
    return null;
  }
}

export async function sendTelegramFile(file: File, caption: string) {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diatur di Environment Variables Vercel.");
  }

  const isImage = file.type.startsWith('image/');
  const method = isImage ? 'sendPhoto' : 'sendDocument';
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  formData.append(isImage ? 'photo' : 'document', file);
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout for files

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // Return the message link or file info
      return data.result;
    } else {
      const errorData = await response.json();
      console.error('Telegram File Upload Error:', errorData);
      throw new Error(`Telegram API Error: ${errorData.description || 'Unknown error'}`);
    }
  } catch (error: any) {
    console.error('Failed to send file to Telegram:', error);
    throw error;
  }
}

export const formatLopNotification = (lopName: string, mitraName: string, type: string) => {
  return `🚀 <b>New Project Created</b>\n\n` +
         `📂 <b>LOP:</b> ${lopName}\n` +
         `👷 <b>Mitra:</b> ${mitraName}\n` +
         `📋 <b>Type:</b> ${type}\n\n` +
         `<i>Silakan cek dashboard untuk detail BOQ.</i>`;
};

export const formatSubmissionNotification = (lopName: string, designator: string, mitraName: string) => {
  return `📤 <b>Evidence Submitted</b>\n\n` +
         `📂 <b>LOP:</b> ${lopName}\n` +
         `🏷️ <b>Designator:</b> ${designator}\n` +
         `👷 <b>Mitra:</b> ${mitraName}\n\n` +
         `<i>Admin, silakan review di dashboard.</i>`;
};

export const formatQCNotification = (lopName: string, designator: string, status: string, reason?: string) => {
  const icon = status === 'approved' ? '✅' : '❌';
  let msg = `${icon} <b>QC Result: ${status.toUpperCase()}</b>\n\n` +
         `📂 <b>LOP:</b> ${lopName}\n` +
         `🏷️ <b>Designator:</b> ${designator}\n`;
  
  if (reason) {
    msg += `⚠️ <b>Reason:</b> ${reason}\n`;
  }
  
  msg += `\n<i>Mitra, silakan cek dashboard.</i>`;
  return msg;
};
