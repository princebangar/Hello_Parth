import React from 'react';

const ActivityTabs = ({ tabs, activeTab, onChange }) => {
  return (
    <div className="px-5 py-3" style={{ background: 'var(--user-card-bg)', borderBottom: '1px solid var(--user-border)' }}>
      <div
        className="inline-flex max-w-full gap-1 overflow-x-auto no-scrollbar rounded-full p-1"
        style={{
          background: 'var(--user-card-soft)',
          maskImage: 'linear-gradient(to right, black 85%, transparent 98%)',
          WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 98%)'
        }}
      >
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={`${String(tab || '').trim() || 'tab'}-${index}`}
              type="button"
              onClick={() => onChange(tab)}
              aria-pressed={isActive}
              className="shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold transition-colors active:scale-[0.99]"
              style={isActive
                ? { background: 'var(--user-accent)', color: 'var(--user-accent-ink)', boxShadow: '0 2px 8px rgba(255,196,0,0.35)' }
                : { color: 'var(--user-text-secondary)' }}
            >
              {tab}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityTabs;
