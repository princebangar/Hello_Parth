import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Tag, CheckCircle2, X, ChevronRight, Ticket } from 'lucide-react';
// ... removed BottomNavbar import ...
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import { userService } from '../services/userService';

const SERVICE_LABELS = { all: 'All services', taxi: 'Rides', delivery: 'Parcel' };

// Promos come from the admin (Promotions Management); a code is applied on the booking screen, not here.
const toPromoCard = (promo = {}) => ({
  id: String(promo._id || promo.code),
  code: String(promo.code || ''),
  discount: Number(promo.discount_percentage || 0),
  maxDiscount: Number(promo.maximum_discount_amount || 0),
  minFare: Number(promo.minimum_trip_amount || 0),
  service: SERVICE_LABELS[String(promo.transport_type || 'all').toLowerCase()] || 'All services',
  expiry: promo.to_date
    ? new Date(promo.to_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—',
});

const SkeletonCard = () => (
  <div className="animate-pulse rounded-[20px] bg-white/70 border border-white/80 p-4 space-y-3">
    <div className="flex justify-between">
      <div className="h-4 bg-slate-200 rounded-full w-24" />
      <div className="h-4 bg-slate-100 rounded-full w-16" />
    </div>
    <div className="h-3 bg-slate-100 rounded-full w-3/4" />
    <div className="h-8 bg-slate-100 rounded-[10px] w-full" />
  </div>
);

const PromoCodes = () => {
  const navigate = useNavigate();
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appliedCode, setAppliedCode] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [toast, setToast] = useState(null);
  const [errorBanner, setErrorBanner] = useState(null);
  const [applying, setApplying] = useState(null);

  useEffect(() => {
    let active = true;
    userService.getAvailablePromos({ limit: 50 })
      .then((response) => {
        const payload = response?.data ?? response;
        const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
        if (active) setPromos(list.map(toPromoCard).filter((promo) => promo.code));
      })
      .catch((error) => {
        if (active) setErrorBanner(error?.message || 'Could not load promo codes');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // Copies a live code; the booking screen validates it against the fare and applies it.
  const applyCode = async (code) => {
    const promo = promos.find((item) => item.code.toUpperCase() === String(code).toUpperCase());
    if (!promo) {
      setErrorBanner(`"${code}" is not available for you right now`);
      return;
    }
    setApplying(promo.code);
    try {
      await navigator.clipboard?.writeText(promo.code);
    } catch {
      /* clipboard can be blocked; the code is still shown on the card */
    }
    setAppliedCode(promo.code);
    setErrorBanner(null);
    // The booking screen picks this up and applies it as soon as a vehicle is selected.
    try {
      window.sessionStorage.setItem('helloparth:pendingPromo', promo.code);
    } catch {
      /* private mode: the copied code can still be pasted on the booking screen */
    }
    showToast(`"${promo.code}" saved — it is applied on your next booking`, 'success');
    setApplying(null);
  };

  const handleManualApply = () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    applyCode(code);
    setManualCode('');
  };

  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen max-w-lg mx-auto font-sans pb-28 relative overflow-clip transition-colors duration-300 ${isDark ? 'bg-slate-950 text-white' : 'bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] text-slate-900'}`}>
      <div className={`absolute -top-16 right-[-40px] h-44 w-44 rounded-full blur-3xl pointer-events-none ${isDark ? 'bg-yellow-500/5' : 'bg-yellow-100/60'}`} />

      {/* Header */}
      <header className={`backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b transition-colors duration-300 ${isDark ? 'bg-slate-900/90 border-slate-800 text-white shadow-[0_4px_20px_rgba(0,0,0,0.3)]' : 'bg-white/90 border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className={`w-9 h-9 rounded-[12px] border flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer ${isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-white/80 bg-white/90 text-slate-900'}`}>
            <ArrowLeft size={18} className={isDark ? 'text-white' : 'text-slate-900'} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-400">Offers & coupons</p>
            <h1 className={`text-[19px] font-black tracking-tight leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Promo Codes</h1>
          </div>
          <Tag size={20} className="text-yellow-500" strokeWidth={2} />
        </div>
      </header>

      <div className="px-5 pt-4 space-y-4">
        {/* Error banner */}
        <AnimatePresence>
          {errorBanner && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-[16px] px-4 py-3">
              <X size={14} className="text-red-500 shrink-0" strokeWidth={2.5} />
              <p className="text-[12px] font-black text-red-600 flex-1">{errorBanner}</p>
              <button onClick={() => setErrorBanner(null)}>
                <X size={13} className="text-red-400" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual entry */}
        <div className={`rounded-[20px] border p-4 shadow-md transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white/90 border-white/80 shadow-[0_4px_14px_rgba(15,23,42,0.06)]'}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 mb-2">Check a Code</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleManualApply()}
              placeholder="Enter promo code"
              className={`flex-1 border rounded-[12px] px-4 py-2.5 text-[14px] font-black placeholder:text-slate-300 focus:outline-none focus:ring-2 ${isDark ? 'bg-slate-950 border-slate-800 text-white focus:ring-yellow-400/20' : 'bg-slate-50 border-slate-100 text-slate-900 focus:ring-orange-200'}`}
            />
            <motion.button whileTap={{ scale: 0.96 }} onClick={handleManualApply}
              className={`px-4 py-2.5 rounded-[12px] text-[12px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer ${isDark ? 'bg-yellow-400 text-slate-950 font-black' : 'bg-slate-900 text-white'}`}>
              Check <ChevronRight size={13} strokeWidth={3} />
            </motion.button>
          </div>
        </div>

        {/* Section label */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">Available Offers</p>
          <h2 className={`mt-0.5 text-[16px] font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Pick a promo</h2>
        </div>

        {/* Promo cards */}
        {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}

        {!loading && promos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-16 h-16 bg-white/80 border border-white/80 rounded-3xl flex items-center justify-center">
              <Ticket size={28} className="text-slate-300" strokeWidth={1.5} />
            </div>
            <p className="text-[14px] font-black text-slate-500">No promo codes available right now</p>
          </div>
        )}

        {!loading && promos.map((promo, i) => {
          const isApplied = appliedCode === promo.code;
          const isApplying = applying === promo.code;
          return (
            <motion.div key={promo.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`rounded-[20px] border p-4 transition-all ${isApplied
                  ? (isDark ? 'bg-emerald-950/20 border-emerald-900 shadow-sm' : 'bg-emerald-50/80 border-emerald-200 shadow-[0_4px_14px_rgba(16,185,129,0.10)]')
                  : (isDark ? 'bg-slate-900 border-slate-800 shadow-sm' : 'bg-white/90 border-white/80 shadow-[0_4px_14px_rgba(15,23,42,0.06)]')
                }`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[16px] font-black tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>{promo.code}</span>
                    {isApplied && <CheckCircle2 size={16} className="text-emerald-500" strokeWidth={2.5} />}
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                    {promo.service}{promo.minFare > 0 ? ` · Min fare ₹${promo.minFare}` : ''}{promo.maxDiscount > 0 ? ` · Up to ₹${promo.maxDiscount}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[18px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {`${promo.discount}%`}
                    <span className="text-[11px] font-bold text-slate-400 ml-1">off</span>
                  </p>
                  <p className="text-[9px] font-bold text-slate-400">Expires {promo.expiry}</p>
                </div>
              </div>
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => applyCode(promo.code)}
                disabled={isApplied || isApplying}
                className={`w-full py-2.5 rounded-[12px] text-[12px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${isApplied
                    ? (isDark ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-900/30' : 'bg-emerald-100 text-emerald-700 cursor-default')
                    : (isDark ? 'bg-yellow-400 text-slate-950' : 'bg-slate-900 text-white shadow-sm active:bg-black')
                  }`}>
                {isApplying ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : isApplied ? (
                  <><CheckCircle2 size={13} strokeWidth={2.5} /> Copied</>
                ) : 'Copy Code'}
              </motion.button>
            </motion.div>
          );
        })}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-[12px] font-black shadow-2xl z-50 whitespace-nowrap ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
              }`}>
            {toast.type === 'success' ? '✓ ' : '✗ '}{toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PromoCodes;
