import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  History,
  Image as ImageIcon,
  Loader2,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { adminService } from '../../services/adminService';

// Same layout as Food's "Broadcast Notification" page (form on top, history in a popup), in Taxi's
// yellow / navy colours.
const inputClass =
  'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#FFC400] focus:ring-2 focus:ring-[#FFC400]/25 disabled:bg-slate-50 disabled:text-slate-400';

const TARGET_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'users', label: 'Users' },
  { value: 'drivers', label: 'Drivers' },
  { value: 'custom', label: 'Particular Persons' },
];

const createInitialForm = () => ({
  title: '',
  message: '',
  send_to: 'all',
  service_location_id: '',
  recipients: [],
  image: null,
});

const formatSentAt = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const audienceLabel = (item) => {
  if (item.send_to === 'custom') return `Particular persons (${(item.recipients || []).length})`;
  return TARGET_OPTIONS.find((option) => option.value === item.send_to)?.label || 'All';
};

const buildDeliveryMessage = (responseData) => {
  const delivery = responseData?.data?.delivery || {};
  const reason = String(delivery.reason || '').trim();

  if (!delivery.attempted) {
    return reason || responseData?.data?.message || 'Notification saved, but push delivery is not configured.';
  }

  const parts = [`Broadcast sent. Delivered to ${Number(delivery.deliveredCount || 0)} of ${Number(delivery.targetCount || 0)} device(s).`];
  if (Number(delivery.failedCount) > 0) parts.push(`${delivery.failedCount} failed.`);
  if (Number(delivery.invalidTokenCount) > 0) parts.push(`${delivery.invalidTokenCount} invalid token(s) were cleaned up.`);
  if (reason) parts.push(reason);
  return parts.join(' ');
};

// "Particular persons": search riders / drivers and pick the ones who should get this broadcast.
const RecipientPicker = ({ recipients, onChange }) => {
  const [role, setRole] = useState('user');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await adminService.searchNotificationRecipients({ role, q: term.trim() });
        const list = response?.data?.results || response?.results || [];
        if (!cancelled) setResults(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [role, term]);

  const isSelected = (item) => recipients.some((entry) => entry.role === item.role && entry.id === item.id);
  const toggle = (item) => {
    onChange(isSelected(item)
      ? recipients.filter((entry) => !(entry.role === item.role && entry.id === item.id))
      : [...recipients, item]);
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-slate-200">
        {[['user', 'Users'], ['driver', 'Drivers']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setRole(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${role === value ? '!bg-[#FFC400] !text-[#0B1220]' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#FFC400] focus:ring-2 focus:ring-[#FFC400]/25"
            placeholder="Search by name or phone"
          />
        </div>
      </div>

      {recipients.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {recipients.map((item) => (
            <span key={`${item.role}:${item.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-slate-800">
              {item.label}
              <span className="text-slate-400">({item.role === 'driver' ? 'Driver' : 'User'})</span>
              <button type="button" onClick={() => toggle(item)} aria-label="Remove">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">No one selected yet.</p>
      )}

      <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
        {searching ? (
          <p className="px-4 py-6 text-center text-xs text-slate-400">Searching...</p>
        ) : results.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-400">No {role === 'driver' ? 'drivers' : 'users'} found.</p>
        ) : (
          results.map((item) => (
            <button
              key={`${item.role}:${item.id}`}
              type="button"
              onClick={() => toggle(item)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{item.label}</span>
                <span className="block text-xs text-slate-400">{item.subLabel}</span>
              </span>
              <span className={`text-xs font-semibold ${isSelected(item) ? 'text-emerald-600' : 'text-slate-500'}`}>
                {isSelected(item) ? 'Added' : 'Add'}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

const SendNotification = () => {
  const [notifications, setNotifications] = useState([]);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(createInitialForm);
  const [imagePreview, setImagePreview] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSendTo, setFilterSendTo] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrap = await adminService.getPromotionsBootstrap();
      setNotifications(Array.isArray(bootstrap?.data?.notifications) ? bootstrap.data.notifications : []);
      setServiceLocations(Array.isArray(bootstrap?.data?.service_locations) ? bootstrap.data.service_locations : []);
    } catch (error) {
      console.error('Error fetching notifications data:', error);
      setNotifications([]);
      setServiceLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const history = useMemo(() => notifications.filter((item) => {
    const matchesAudience = !filterSendTo || String(item.send_to || '').toLowerCase() === filterSendTo;
    const matchesLocation = !filterLocation || String(item.service_location_id || '') === filterLocation;
    return matchesAudience && matchesLocation;
  }), [notifications, filterSendTo, filterLocation]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setForm((current) => ({ ...current, image: file }));
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice(null);

    const isCustom = form.send_to === 'custom';
    if (!form.title.trim() || !form.message.trim()) {
      setNotice({ type: 'error', text: 'Please enter a title and a message.' });
      return;
    }
    if (!isCustom && !form.service_location_id) {
      setNotice({ type: 'error', text: 'Please select a service location.' });
      return;
    }
    if (isCustom && form.recipients.length === 0) {
      setNotice({ type: 'error', text: 'Select at least one person to notify.' });
      return;
    }

    setSubmitting(true);
    try {
      let imageData = '';
      if (form.image) {
        imageData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(form.image);
        });
      }

      const data = await adminService.sendNotification({
        service_location_id: isCustom ? undefined : form.service_location_id,
        send_to: form.send_to,
        recipients: isCustom ? form.recipients : [],
        push_title: form.title.trim(),
        title: form.title.trim(),
        message: form.message.trim(),
        image: imageData,
      });

      if (data?.success) {
        setNotice({ type: 'success', text: buildDeliveryMessage(data) });
        setForm((current) => ({ ...createInitialForm(), send_to: current.send_to }));
        setImagePreview(null);
        await fetchData();
      } else {
        setNotice({ type: 'error', text: data?.message || 'Failed to send notification' });
      }
    } catch (error) {
      console.error('Send notification error:', error);
      setNotice({ type: 'error', text: error?.response?.data?.message || error?.message || 'Failed to send notification' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;
    if (!window.confirm('Delete this notification?')) return;
    setDeletingId(id);
    try {
      const data = await adminService.deleteNotification(id);
      if (data?.success) await fetchData();
    } catch (error) {
      console.error('Delete notification error:', error);
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-yellow-50 text-yellow-600 flex items-center justify-center flex-shrink-0">
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Broadcast Notification</h1>
              <p className="text-sm text-slate-500 mt-1">
                Send one notification to all, users, drivers, or selected people. It reaches the Taxi app only.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-2.5 px-5 py-3 text-sm font-bold rounded-2xl !bg-[#FFC400] !text-[#0B1220] shadow-md shadow-yellow-500/25 hover:brightness-95 active:scale-[0.98] transition-all self-start sm:self-auto cursor-pointer border-none"
          >
            <History className="w-5 h-5" /> View History
            <span className="bg-[#0B1220]/10 text-xs px-2.5 py-0.5 rounded-full font-extrabold ml-0.5 inline-flex items-center justify-center min-w-[28px] min-h-[24px]">
              {loading ? <span className="block w-2.5 h-3 bg-[#0B1220]/20 rounded animate-pulse" /> : notifications.length}
            </span>
          </button>
        </div>

        {notice ? (
          <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
            {notice.text}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Title</span>
              <input
                value={form.title}
                onChange={(event) => setField('title', event.target.value)}
                placeholder="Enter notification title"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Target Type</span>
              <select
                value={form.send_to}
                onChange={(event) => setField('send_to', event.target.value)}
                className={`${inputClass} font-semibold`}
              >
                {TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          {form.send_to !== 'custom' ? (
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Service Location</span>
              <select
                value={form.service_location_id}
                onChange={(event) => setField('service_location_id', event.target.value)}
                className={inputClass}
              >
                <option value="">Select Service Location</option>
                {serviceLocations.map((loc) => (
                  <option key={loc._id || loc.id} value={loc._id || loc.id}>
                    {loc.service_location_name || loc.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Message</span>
            <textarea
              value={form.message}
              onChange={(event) => setField('message', event.target.value)}
              placeholder="Enter notification message"
              rows={4}
              className={`${inputClass} resize-y`}
            />
          </label>

          <div>
            <span className="text-sm font-semibold text-slate-700">Banner image (optional)</span>
            <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              {imagePreview ? (
                <div className="flex items-center gap-4">
                  <img src={imagePreview} alt="Notification preview" className="h-24 w-24 rounded-xl object-cover border border-slate-200 bg-white" />
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setField('image', null);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Remove image
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-500">
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-yellow-600">
                    <ImageIcon size={18} />
                  </span>
                  Upload a banner for the push notification
                </label>
              )}
            </div>
          </div>

          {form.send_to === 'custom' ? (
            <RecipientPicker recipients={form.recipients} onChange={(next) => setField('recipients', next)} />
          ) : null}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-2xl !bg-[#FFC400] px-6 py-3 text-sm font-bold !text-[#0B1220] hover:brightness-95 disabled:opacity-60 shadow-md shadow-yellow-500/25 active:scale-[0.99] transition-all cursor-pointer border-none"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Broadcast
            </button>
          </div>
        </form>
      </div>

      {showHistory ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowHistory(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Broadcast History</h2>
              <button type="button" onClick={() => setShowHistory(false)} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-6 py-4 sm:grid-cols-2">
              <select value={filterLocation} onChange={(event) => setFilterLocation(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#FFC400]">
                <option value="">All service locations</option>
                {serviceLocations.map((loc) => (
                  <option key={loc._id || loc.id} value={loc._id || loc.id}>{loc.service_location_name || loc.name}</option>
                ))}
              </select>
              <select value={filterSendTo} onChange={(event) => setFilterSendTo(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#FFC400]">
                <option value="">All audiences</option>
                {TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-xs font-semibold text-slate-500">
                    <th className="px-6 py-3">Title</th>
                    <th className="px-6 py-3">Message</th>
                    <th className="px-6 py-3">Send To</th>
                    <th className="px-6 py-3">Service Location</th>
                    <th className="px-6 py-3">Sent At</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-14 text-center text-sm text-slate-400">No broadcast notifications found</td>
                    </tr>
                  ) : (
                    history.map((item) => (
                      <tr key={item._id || item.id} className="hover:bg-slate-50">
                        <td className="px-6 py-3 text-sm font-semibold text-slate-800">{item.push_title}</td>
                        <td className="px-6 py-3 text-sm text-slate-600 max-w-[320px] truncate">{item.message}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{audienceLabel(item)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{item.service_location_name || '-'}</td>
                        <td className="px-6 py-3 text-sm text-slate-500 whitespace-nowrap">{formatSentAt(item.sent_at || item.createdAt)}</td>
                        <td className="px-6 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(item._id || item.id)}
                            disabled={deletingId === (item._id || item.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-rose-600 disabled:opacity-50"
                            aria-label="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SendNotification;
