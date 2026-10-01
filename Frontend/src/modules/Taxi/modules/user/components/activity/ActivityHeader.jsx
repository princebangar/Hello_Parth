import React from 'react';
import { ArrowLeft } from 'lucide-react';

const ActivityHeader = ({ helperText, onBack }) => {
  return (
    <header style={{ background: 'var(--user-card-bg)', borderBottom: '1px solid var(--user-border)' }}>
      <div className="flex items-start gap-3 px-5 pb-4 pt-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="-ml-2 cursor-pointer rounded-full p-2 transition-all active:scale-95"
          style={{ color: 'var(--user-text-primary)' }}
        >
          <ArrowLeft size={22} strokeWidth={2.4} />
        </button>
        <div className="min-w-0">
          <p className="text-[12px] font-medium" style={{ color: 'var(--user-text-muted)' }}>My bookings</p>
          <h1 className="mt-0.5 truncate text-[20px] font-bold tracking-tight" style={{ color: 'var(--user-text-primary)' }}>
            Recent activity
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--user-text-secondary)' }}>{helperText}</p>
        </div>
      </div>
    </header>
  );
};

export default ActivityHeader;
