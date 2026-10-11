import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X } from 'lucide-react';

const BASE = `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/owner-management`;

const humanize = (key = '') =>
  String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();

const urlOf = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.previewUrl || value.secureUrl || value.url || value.imageUrl || value.image || value.fileUrl || '';
};

// Every document an owner uploaded, each with its own name (the admin's document name + Front / Back), number and expiry.
const FleetDocumentsModal = ({ open, title = 'Documents', documents = {}, onClose }) => {
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    if (!open || templates.length) return;
    const token = localStorage.getItem('adminToken') || '';
    fetch(`${BASE}/driver-needed-document`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((response) => response.json())
      .then((json) => setTemplates(Array.isArray(json?.data) ? json.data : (json?.data?.results || [])))
      .catch(() => {});
  }, [open, templates.length]);

  const labelByKey = useMemo(() => {
    const map = {};
    templates.forEach((template) => {
      if (template.front_key) map[template.front_key] = `${template.name} - Front`;
      if (template.back_key) map[template.back_key] = `${template.name} - Back`;
      if (template.key) map[template.key] = template.name;
    });
    return map;
  }, [templates]);

  const entries = useMemo(
    () => Object.entries(documents || {})
      .map(([key, value]) => ({
        key,
        label: labelByKey[key] || (key === 'rc' ? 'Vehicle RC' : humanize(key)),
        url: urlOf(value),
        number: typeof value === 'object' ? String(value.identifyNumber || value.documentNumber || value.identify_number || value.document_number || '').trim() : '',
        expiry: typeof value === 'object' ? String(value.expiryDate || value.expiry_date || '').trim().slice(0, 10) : '',
      }))
      .filter((entry) => entry.url),
    [documents, labelByKey],
  );

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-gray-950">{title}</h3>
            <p className="text-xs text-gray-500">{entries.length} document{entries.length === 1 ? '' : 's'} uploaded</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2 md:grid-cols-3">
          {entries.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm font-semibold text-gray-500">No documents uploaded.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.key} className="overflow-hidden rounded-lg border border-gray-200">
                <a href={entry.url} target="_blank" rel="noopener noreferrer" className="block h-40 bg-gray-50">
                  <img src={entry.url} alt={entry.label} className="h-full w-full object-cover" />
                </a>
                <div className="space-y-0.5 p-3">
                  <p className="flex items-center justify-between gap-2 text-sm font-bold text-gray-950">
                    <span className="truncate">{entry.label}</span>
                    <a href={entry.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-gray-400 hover:text-gray-700" title="Open full size"><ExternalLink size={14} /></a>
                  </p>
                  {entry.number ? <p className="text-xs text-gray-600">Number: <span className="font-semibold">{entry.number}</span></p> : null}
                  {entry.expiry ? <p className="text-xs text-gray-600">Expiry: <span className="font-semibold">{entry.expiry}</span></p> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FleetDocumentsModal;
