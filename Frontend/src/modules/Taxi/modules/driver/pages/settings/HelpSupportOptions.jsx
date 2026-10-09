import React from 'react';
import { ArrowLeft, ChevronRight, Headset, Mail, MessageCircle, Phone } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const HelpSupportOptions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';

  return (
    <div className="min-h-screen bg-[#f8f9fb] p-6 pt-10 font-sans">
      <header className="sticky top-0 z-30 -mx-6 mb-6 flex items-center gap-4 bg-[#f8f9fb] px-6 py-3 text-slate-900">
        <button
          onClick={() => navigate(`${routePrefix}/profile`)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-black tracking-tight">Help & Support</h1>
      </header>

      <div className="space-y-4">
        {/* Owner Support: direct email / phone (used to sit at the bottom of the profile page) */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-900">Owner Support</h2>
          </div>

          <div className="space-y-5">
            <a href="mailto:helloparthg@gmail.com" className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Mail size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Email Support</p>
                <p className="truncate text-[14px] font-bold text-slate-800">helloparthg@gmail.com</p>
              </div>
            </a>

            <a href="tel:9193911911" className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Phone size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Call Support</p>
                <p className="text-[14px] font-bold text-slate-800">91-93-911-911</p>
              </div>
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate(`${routePrefix}/support/chat`)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <MessageCircle size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-slate-900">Live Chat</p>
              <p className="text-xs font-semibold text-slate-400">Talk instantly with support team</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-300" />
        </button>

        <button
          type="button"
          onClick={() => navigate(`${routePrefix}/support/tickets`)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Headset size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-slate-900">Support Ticket</p>
              <p className="text-xs font-semibold text-slate-400">Raise and track issue tickets</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-300" />
        </button>
      </div>
    </div>
  );
};

export default HelpSupportOptions;
