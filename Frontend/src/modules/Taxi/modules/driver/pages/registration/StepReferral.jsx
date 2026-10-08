import React, { useEffect, useState } from 'react';
import { ArrowLeft, Gift, ChevronRight, Tag } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    getStoredDriverRegistrationSession,
    saveDriverReferral,
    saveDriverRegistrationSession,
} from '../../services/registrationService';

const StepReferral = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const routePrefix = location.pathname.startsWith('/taxi/owner')
        ? '/taxi/owner'
        : '/taxi/driver';
    const session = getStoredDriverRegistrationSession();
    const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
    const registrationId = String(session.registrationId || '').trim();
    const [referral, setReferral] = useState(session.referralCode || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        saveDriverRegistrationSession({
            ...session,
            referralCode: referral,
        });
    }, [referral]);

    useEffect(() => {
        if (!phone || !registrationId) {
            navigate(`${routePrefix}/reg-phone`, { replace: true });
        }
    }, [navigate, phone, registrationId, routePrefix]);

    const handleNext = async (skip = false) => {
        setLoading(true);
        setError('');

        try {
            const response = await saveDriverReferral({
                registrationId: session.registrationId,
                phone: session.phone,
                referralCode: skip ? '' : referral,
            });

            saveDriverRegistrationSession({
                ...session,
                referralCode: skip ? '' : referral,
                referralSession: response?.data?.session || null,
            });

            navigate(`${routePrefix}/step-vehicle`);
        } catch (err) {
            setError(err?.message || 'Unable to save referral code');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div 
            className="min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] px-5 pb-32 pt-8 select-none overflow-x-clip"
            style={{ fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" }}
        >
            <main className="mx-auto max-w-sm space-y-6">
                <header className="contents space-y-6 [&>:last-child]:mb-6">
                    <div className="sticky top-0 z-30 -mx-5 flex items-center justify-between bg-[#f6efe4]/90 px-5 py-3 backdrop-blur-md">
                         <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => navigate(`${routePrefix}/step-personal`)}
                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm transition-transform active:scale-95"
                        >
                            <ArrowLeft size={18} strokeWidth={2.5} />
                        </motion.button>
                        <div className="rounded-full bg-slate-900/5 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600 border border-slate-900/5">
                            Step 2 of 4
                        </div>
                    </div>

                    <section className="space-y-3">
                        <div className="flex items-center gap-3">
                             <div className="flex h-11 w-11 items-center justify-center rounded-[1.25rem] bg-slate-900 text-white shadow-xl shadow-slate-900/10">
                                <Gift size={22} strokeWidth={2.5} />
                            </div>
                            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                Rewards Program
                            </span>
                        </div>
                        <h1 className="text-[48px] font-bold leading-[1] tracking-[-0.04em] text-slate-900">
                            Got a <span className="text-slate-500">Code?</span>
                        </h1>
                        <p className="text-[15px] leading-relaxed text-slate-500 font-bold opacity-80 max-w-[28ch]">
                            Invited by a Hello Parth driver? Enter their referral code. Rewards follow the current referral programme.
                        </p>
                    </section>
                </header>

                {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-[0_10px_30px_rgba(244,63,94,0.08)]">
                        {error}
                    </div>
                )}

                <section className="space-y-5 rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
                    <div className="space-y-1 px-1">
                        <h2 className="text-lg font-bold tracking-tight text-slate-900">Referral Code</h2>
                        <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Optional Bonus</p>
                    </div>

                    <div className="space-y-4">
                        <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-200 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                            <div className="flex items-center gap-4">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                                    <Tag size={20} strokeWidth={2.5} />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0.5 overflow-hidden">
                                    <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">Referral Code</label>
                                    <input
                                        value={referral}
                                        onChange={(e) => setReferral(e.target.value.toUpperCase())}
                                        placeholder="Enter referral code"
                                        className="w-full border-none bg-transparent p-0 text-base font-semibold text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-500 tracking-wider uppercase"
                                    />
                                </div>
                            </div>
                        </div>

                    </div>
                </section>

                <p className="px-2 text-center text-[12px] font-semibold text-slate-500">
                    A referral code is not required. Leave it empty to continue.
                </p>

                <div className="fixed bottom-0 left-0 right-0 px-6 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
                    <div className="mx-auto max-w-sm">
                        <motion.button
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            // no code typed = continue without one (it used to stay greyed out, so drivers thought the code was compulsory)
                            onClick={() => handleNext(!referral.trim())}
                            disabled={loading}
                            className="group flex h-16 w-full items-center justify-center gap-3 rounded-[1.8rem] bg-slate-900 text-[15px] font-bold tracking-tight text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)] transition-all relative overflow-hidden active:bg-black"
                        >
                            {loading ? (
                                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span className="relative z-10 uppercase tracking-widest">{referral.trim() ? 'Apply & Continue' : 'Continue'}</span>
                                    <ChevronRight size={18} strokeWidth={3} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </motion.button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default StepReferral;

