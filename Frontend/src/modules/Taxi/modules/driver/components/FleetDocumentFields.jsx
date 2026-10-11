import React, { useMemo } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { getDocumentPreviewUrl, isPastExpiryDate, todayDateInputValue } from '../utils/documentTemplates';
import { uploadService } from '../../../shared/services/uploadService';

// Documents an owner collects for a fleet vehicle / fleet driver. Which documents (and whether a number / expiry date
// is asked) comes from Admin > Fleet Needed Documents - nothing is fixed here.

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read the selected file'));
  reader.readAsDataURL(file);
});

const sideLabel = (field = {}) => (field.side === 'front' ? 'Front' : field.side === 'back' ? 'Back' : 'Photo');

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400';

/** The expiry date / number pair of a template, read back from a saved document (any of the stored spellings). */
export const readSavedDocumentMeta = (documents = {}, template = {}) => {
  const saved = (template.fields || []).map((field) => documents?.[field.key]).find((doc) => doc && typeof doc === 'object') || {};
  return {
    identifyNumber: String(saved.identifyNumber || saved.documentNumber || saved.identify_number || saved.document_number || '').trim(),
    expiryDate: String(saved.expiryDate || saved.expiry_date || '').trim().slice(0, 10),
  };
};

/**
 * Is everything the templates ask for there? `files` = newly picked files by field key, `existing` = documents already
 * saved on the record. Returns an error message, or '' when the form can go ahead.
 */
export const validateFleetDocumentInputs = (templates = [], files = {}, meta = {}, existing = {}) => {
  for (const template of templates) {
    const fields = template.fields || [];
    const have = (field) => Boolean(files[field.key] || existing?.[field.key]);
    const required = fields.some((field) => field.required ?? template.is_required ?? false);
    const anyUploaded = fields.some(have);
    for (const field of fields) {
      if ((field.required ?? template.is_required ?? false) && !have(field)) {
        return `Upload ${field.label || template.name}`;
      }
    }
    if (!anyUploaded && !required) continue;
    const entry = meta[template.id] || {};
    if (template.has_identify_number && !String(entry.identifyNumber || '').trim()) {
      return `Enter the ${template.name} number`;
    }
    if (template.has_expiry_date) {
      if (!String(entry.expiryDate || '').trim()) return `Enter the ${template.name} expiry date`;
      if (isPastExpiryDate(entry.expiryDate)) return `${template.name} has already expired`;
    }
  }
  return '';
};

/** Uploads the newly picked files and builds the `documents` map the server expects (number / expiry on every side). */
export const buildFleetDocumentsPayload = async (templates = [], files = {}, meta = {}, existing = {}, folder = 'fleet-vehicle-documents') => {
  const documents = {};
  for (const template of templates) {
    const entry = meta[template.id] || {};
    const extra = {
      ...(String(entry.identifyNumber || '').trim()
        ? { identifyNumber: entry.identifyNumber.trim(), identify_number: entry.identifyNumber.trim(), documentNumber: entry.identifyNumber.trim(), document_number: entry.identifyNumber.trim() }
        : {}),
      ...(String(entry.expiryDate || '').trim() ? { expiryDate: entry.expiryDate, expiry_date: entry.expiryDate } : {}),
    };
    for (const field of template.fields || []) {
      const file = files[field.key];
      let url = getDocumentPreviewUrl(existing?.[field.key]);
      if (file) {
        if (!String(file.type || '').startsWith('image/')) {
          throw new Error(`${field.label || template.name} supports image files only.`);
        }
        const result = await uploadService.uploadImage(await readFileAsDataUrl(file), folder);
        url = result?.url || result?.secureUrl || result?.data?.url || result?.data?.secureUrl || '';
        if (!url) throw new Error(`Could not upload ${field.label || template.name}.`);
      }
      if (url) {
        documents[field.key] = { previewUrl: url, secureUrl: url, url, uploaded: true, ...extra };
      }
    }
  }
  return documents;
};

// lockUneditable: documents the admin marked 'not editable' are only shown (used when an owner edits a saved record).
const FleetDocumentFields = ({ templates = [], files = {}, existing = {}, meta = {}, onFile, onClear, onMeta, lockUneditable = false }) => {
  const previews = useMemo(() => {
    const map = {};
    Object.entries(files || {}).forEach(([key, file]) => {
      if (file && typeof URL !== 'undefined') map[key] = URL.createObjectURL(file);
    });
    return map;
  }, [files]);

  if (!templates.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
        No documents are needed right now.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {templates.map((template) => {
        const entry = meta[template.id] || {};
        const required = (template.fields || []).some((field) => field.required ?? template.is_required ?? false);
        const locked = lockUneditable && template.is_editable === false;
        return (
          <div key={template.id} className="rounded-[22px] border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600`}><FileText size={16} /></span>
                <p className="truncate text-sm font-black text-slate-900">{template.name}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${required ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                {locked ? 'Locked' : required ? 'Required' : 'Optional'}
              </span>
            </div>

            <div className={`grid gap-3 ${(template.fields || []).length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {(template.fields || []).map((field) => {
                const preview = previews[field.key] || getDocumentPreviewUrl(existing?.[field.key]);
                return (
                  <div key={field.key} className="relative">
                    <label className={`relative block h-28 overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 ${locked ? '' : 'cursor-pointer'}`}>
                      {locked ? null : <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) onFile?.(field.key, file);
                          event.target.value = '';
                        }}
                      />}
                      {preview ? (
                        <img src={preview} alt={field.label} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
                          <Upload size={18} />
                          <span className="text-[11px] font-bold">{sideLabel(field)}</span>
                        </span>
                      )}
                      {preview ? (
                        <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[10px] font-bold text-white">
                          {sideLabel(field)} - tap to change
                        </span>
                      ) : null}
                    </label>
                    {!locked && files[field.key] ? (
                      <button
                        type="button"
                        onClick={() => onClear?.(field.key)}
                        aria-label="Remove file"
                        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/95 text-rose-500 shadow"
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {locked && (template.has_identify_number || template.has_expiry_date) ? (
              <p className="mt-3 text-[12px] font-semibold text-slate-500">
                {[meta[template.id]?.identifyNumber ? `Number ${meta[template.id].identifyNumber}` : '', meta[template.id]?.expiryDate ? `Expires ${meta[template.id].expiryDate}` : ''].filter(Boolean).join('  -  ')}
              </p>
            ) : null}

            {!locked && (template.has_identify_number || template.has_expiry_date) ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {template.has_identify_number ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{template.name} number *</label>
                    <input
                      value={entry.identifyNumber || ''}
                      onChange={(event) => onMeta?.(template.id, 'identifyNumber', event.target.value)}
                      placeholder="Document number"
                      className={inputClass}
                    />
                  </div>
                ) : null}
                {template.has_expiry_date ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Expiry date *</label>
                    <input
                      type="date"
                      min={todayDateInputValue()}
                      value={entry.expiryDate || ''}
                      onChange={(event) => onMeta?.(template.id, 'expiryDate', event.target.value)}
                      className={inputClass}
                    />
                    {isPastExpiryDate(entry.expiryDate) ? <p className="mt-1 text-[11px] font-bold text-rose-500">This date has already passed.</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default FleetDocumentFields;
