import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, Phone, HelpCircle, AlertCircle, XCircle, ShieldCheck, ChevronRight, Siren } from 'lucide-react';
import { SUPPORT_INFO } from '../../../shared/content/supportInfo';

const cardStyle = {
  background: 'var(--user-card-bg)',
  border: '1px solid var(--user-border)',
  boxShadow: 'var(--user-card-shadow)',
};

const Support = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  const helpTopics = [
    { title: "Driver didn't arrive", Icon: XCircle },
    { title: 'Safety concern', Icon: ShieldCheck },
    { title: 'I lost an item', Icon: HelpCircle },
    { title: 'Payment failure', Icon: AlertCircle },
  ];

  const handleCall = () => {
    window.open(`tel:${SUPPORT_INFO.phoneHref}`, '_self');
  };

  const openSupportChat = (topicTitle = '') => {
    const initialDraft = topicTitle ? `Hi, I need help with: ${topicTitle}.` : '';

    navigate(`${routePrefix}/ride/chat?admin=true&role=user`, {
      state: initialDraft ? { initialDraft } : undefined,
    });
  };

  const quickActions = [
    { title: 'Live chat', sub: 'Get quick help', Icon: MessageCircle, onClick: () => openSupportChat() },
    { title: 'Call support', sub: 'Talk to us', Icon: Phone, onClick: handleCall },
    { title: 'Emergency SOS', sub: 'Get safety help fast', Icon: Siren, onClick: () => navigate(`${routePrefix}/safety/sos`), danger: true },
  ];

  return (
    <div className="min-h-screen max-w-lg mx-auto flex flex-col font-sans relative pb-[calc(8.5rem+env(safe-area-inset-bottom))] overflow-x-hidden user-app-theme">
      <header className="relative z-20 sticky top-0" style={{ background: 'var(--user-card-bg)', borderBottom: '1px solid var(--user-border)' }}>
        <div className="px-5 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Back" className="p-2 -ml-2 active:scale-95 transition-all rounded-full" style={{ color: 'var(--user-text-primary)' }}>
            <ArrowLeft size={22} strokeWidth={2.4} />
          </button>
          <div className="min-w-0">
            <p className="text-[12px] font-medium" style={{ color: 'var(--user-text-muted)' }}>Support</p>
            <h1 className="mt-0.5 text-[19px] font-bold tracking-tight leading-tight truncate" style={{ color: 'var(--user-text-primary)' }}>
              Help &amp; Support
            </h1>
          </div>
        </div>
      </header>

      <div className="relative z-10 px-5 pt-5 flex-1 space-y-6">
        <div className="space-y-2.5">
          {quickActions.map(({ title, sub, Icon, onClick, danger }) => (
            <motion.button
              key={title}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={onClick}
              className="w-full flex items-center gap-4 rounded-[18px] px-4 py-3.5 text-left"
              style={cardStyle}
            >
              <div
                className={`w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 ${danger ? 'bg-rose-500/10 text-rose-600' : 'service-art'}`}
              >
                <Icon size={20} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--user-text-primary)' }}>{title}</div>
                <div className="mt-0.5 text-[12px] truncate" style={{ color: 'var(--user-text-secondary)' }}>{sub}</div>
              </div>
              <ChevronRight size={18} strokeWidth={2.4} className="shrink-0" style={{ color: 'var(--user-text-muted)' }} />
            </motion.button>
          ))}
        </div>

        <div>
          <h3 className="user-section-title mb-3">Choose a topic</h3>
          <div className="space-y-2.5">
            {helpTopics.map((topic) => (
              <motion.button
                key={topic.title}
                type="button"
                whileTap={{ scale: 0.99 }}
                onClick={() => openSupportChat(topic.title)}
                className="w-full text-left rounded-[18px] px-4 py-3.5 flex items-center justify-between gap-3"
                style={cardStyle}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0" style={{ background: 'var(--user-card-soft)', color: 'var(--user-text-primary)' }}>
                    <topic.Icon size={18} strokeWidth={2.2} />
                  </div>
                  <span className="text-[14px] font-semibold truncate" style={{ color: 'var(--user-text-primary)' }}>{topic.title}</span>
                </div>
                <ChevronRight size={18} strokeWidth={2.4} className="shrink-0" style={{ color: 'var(--user-text-muted)' }} />
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;
