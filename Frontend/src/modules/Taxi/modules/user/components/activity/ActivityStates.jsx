import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Headset } from 'lucide-react';
import TaxiPageSkeleton from '@/shared/components/TaxiPageSkeleton';

const iconTileStyle = {
  background: 'var(--user-card-bg)',
  border: '1px solid var(--user-border)',
  boxShadow: 'var(--user-card-shadow)',
};

const primaryButtonStyle = {
  background: 'var(--user-accent)',
  color: 'var(--user-accent-ink)',
  boxShadow: '0 6px 16px rgba(255,196,0,0.35)',
};

export const ActivitySupportState = ({ onContact }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-20 text-center gap-5"
  >
    <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={iconTileStyle}>
      <Headset size={34} style={{ color: 'var(--user-text-secondary)' }} />
    </div>
    <div className="space-y-1">
      <h3 className="text-[17px] font-semibold" style={{ color: 'var(--user-text-primary)' }}>No support tickets</h3>
      <p className="text-[13px]" style={{ color: 'var(--user-text-secondary)' }}>You haven&apos;t raised any support tickets yet.</p>
    </div>
    <button
      type="button"
      onClick={onContact}
      className="mt-2 px-7 py-3 rounded-full text-[14px] font-semibold active:scale-95 transition-all"
      style={primaryButtonStyle}
    >
      Contact us
    </button>
  </motion.div>
);

// The trip list while it loads: skeleton cards, the same ones the Rides placeholder shows before the screen's code has
// arrived (TaxiPageSkeleton "activity"), so opening Rides goes placeholder -> list with nothing changing shape between.
export const ActivityLoadingState = () => <TaxiPageSkeleton variant="activity-list" />;

export const ActivityErrorState = ({ error, onRetry }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center py-20 text-center gap-3"
  >
    <div className="w-14 h-14 rounded-3xl flex items-center justify-center" style={iconTileStyle}>
      <AlertCircle size={24} className="text-rose-500" strokeWidth={2.6} />
    </div>
    <p className="text-[14px] font-medium" style={{ color: 'var(--user-text-primary)' }}>{error}</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-2 px-6 py-3 rounded-full text-[14px] font-semibold active:scale-95 transition-all"
      style={primaryButtonStyle}
    >
      Retry
    </button>
  </motion.div>
);

export const ActivityEmptyState = ({ activeTab }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center py-20 text-center gap-3"
  >
    <div className="w-14 h-14 rounded-3xl flex items-center justify-center text-[22px] font-semibold" style={{ ...iconTileStyle, color: 'var(--user-text-muted)' }}>
      -
    </div>
    <p className="text-[14px] font-medium" style={{ color: 'var(--user-text-secondary)' }}>No {activeTab.toLowerCase()} found</p>
  </motion.div>
);
