import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ShieldCheck, Wallet, Clock, TrendingUp, Sparkles } from 'lucide-react';
import DriverHero from '@/assets/driver_welcome_hero.png';
import { useSettings } from '../../../../shared/context/SettingsContext';

const DriverWelcome = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const appName = settings.general?.app_name || 'App';
    const appLogo = settings.general?.logo || settings.customization?.logo;

    const perks = [
        { icon: <Wallet size={18} />, title: 'Weekly Payouts', sub: 'Receive your earnings directly every week.' },
        { icon: <Clock size={18} />, title: 'Set Your Schedule', sub: 'Ultimate flexibility to drive whenever you want.' },
        { icon: <ShieldCheck size={18} />, title: 'Premium Support', sub: 'Dedicated 24/7 assistance for our partners.' },
        { icon: <TrendingUp size={18} />, title: 'Growth Incentives', sub: 'Earn bonuses for high performance and trips.' }
    ];

    return (
        <div 
            className="min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] select-none overflow-x-hidden"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
            {/* Hero Section */}
            <header className="relative h-[48vh] overflow-hidden rounded-b-[3.5rem] shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent z-10" />
                <img 
                    src={DriverHero} 
                    alt={`Drive with ${appName}`} 
                    className="w-full h-full object-cover scale-110"
                />
                
                {/* Branding Top Overlay */}
                <div className="absolute top-10 left-8 z-20">
                     {appLogo ? (
                         <img src={appLogo} alt={appName} className="h-10 drop-shadow-sm" />
                     ) : (
                         <div className="rounded-2xl bg-white px-4 py-2 text-sm font-black tracking-tighter text-slate-900 shadow-xl">
                            {appName}
                         </div>
                     )}
                </div>

                {/* Overlay Greeting */}
                <div className="absolute bottom-12 left-8 right-8 text-white z-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="space-y-4"
                    >
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-amber-400 border border-white/10">
                             <Sparkles size={12} strokeWidth={3} /> Partner Program
                        </div>
                        <h1 className="font-['Outfit'] text-[48px] font-black leading-[0.95] tracking-[-0.05em]">
                            Drive & <span className="text-amber-400">Earn Daily</span>
                        </h1>
                        <p className="max-w-[24ch] text-[15px] font-bold text-white/70 leading-relaxed opacity-90">
                            Join the professional network of {appName} partners and take control of your time.
                        </p>
                    </motion.div>
                </div>
            </header>

            {/* Content Section */}
            <main className="px-6 pt-12 pb-36 space-y-12">
                <section className="space-y-8">
                    <div className="flex items-center justify-between px-1">
                        <div className="space-y-1">
                            <h3 className="text-lg font-black tracking-tight text-slate-900">
                                Partner Benefits
                            </h3>
                            <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest opacity-60">Why partners choose {appName}</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-5">
                        {perks.map((perk, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 * index }}
                                className="flex items-start gap-5 bg-white p-5 rounded-[2rem] border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.04)] transition-all hover:scale-[1.02] active:scale-[0.98] group"
                            >
                                <div className="mt-1 w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-lg shadow-slate-900/10 group-hover:scale-110 transition-transform duration-500">
                                    {perk.icon}
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-[17px] font-black text-slate-900 tracking-tight">{perk.title}</h4>
                                    <p className="text-[13px] font-bold text-slate-500 leading-relaxed opacity-80">{perk.sub}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </section>

            </main>

            {/* Sticky Action Footer */}
            <div className="fixed bottom-0 left-0 right-0 px-6 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-slate-50 via-slate-50 to-transparent z-50">
                <div className="mx-auto max-w-sm">
                    <motion.button 
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/taxi/driver/lang-select')}
                        className="group w-full bg-slate-900 h-16 rounded-[1.8rem] flex items-center justify-center gap-3 text-[15px] font-black uppercase tracking-widest text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)] active:bg-black transition-all"
                    >
                        Apply to Drive <ChevronRight size={18} strokeWidth={3} className="group-hover:translate-x-1 transition-transform" />
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default DriverWelcome;

