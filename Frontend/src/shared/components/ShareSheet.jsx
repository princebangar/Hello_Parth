import React from 'react';
import { Copy, MessageCircle, MessageSquareText, X } from 'lucide-react';

/**
 * Share a message with the installed app's phone share sheet when there is one (navigator.share), otherwise this small
 * sheet: WhatsApp / SMS / Copy. The app's WebView has no share sheet, and copying alone looked like "nothing was shared".
 *
 *   const result = await shareMessage({ title, text });  // 'shared' | 'cancelled' | 'unsupported'
 *   if (result === 'unsupported') setSheetOpen(true);
 */
export const shareMessage = async ({ title = '', text = '', url = '' }) => {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }

  try {
    await navigator.share({ title, text, ...(url ? { url } : {}) });
    return 'shared';
  } catch (error) {
    return error?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
};

export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const ShareSheet = ({ open, text, onClose, onCopied }) => {
  if (!open) return null;

  const encoded = encodeURIComponent(text || '');

  return (
    <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/45" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-lg rounded-t-3xl bg-white px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Share"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-slate-900">Share via</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <a
            href={`https://wa.me/?text=${encoded}`}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 py-4 text-[12px] font-bold text-slate-800"
          >
            <MessageCircle size={22} className="text-emerald-600" />
            WhatsApp
          </a>
          <a
            href={`sms:?&body=${encoded}`}
            onClick={onClose}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 py-4 text-[12px] font-bold text-slate-800"
          >
            <MessageSquareText size={22} className="text-blue-600" />
            SMS
          </a>
          <button
            type="button"
            onClick={async () => {
              const ok = await copyToClipboard(text || '');
              if (ok) onCopied?.();
              onClose?.();
            }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 py-4 text-[12px] font-bold text-slate-800"
          >
            <Copy size={22} className="text-slate-600" />
            Copy
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareSheet;
