import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, ChevronRight, Clock } from 'lucide-react';
import { buildAvatarFallback } from './activityHelpers';
import ServiceArt from '../ServiceArt';

const STATUS_STYLES = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  danger: 'bg-rose-50 text-rose-700 border-rose-100',
  default: 'bg-amber-50 text-amber-700 border-amber-100',
};

const ActivityCard = ({ type, title, address, date, time, status, statusTone, price, onClick, driverName, driverImage, vehicleImage, eyebrow }) => {
  const [driverBroken, setDriverBroken] = useState(false);
  const resolvedDriverImage = driverBroken ? buildAvatarFallback(driverName) : driverImage;
  // No picture (or it fails to load) -> a vehicle glyph, never a leftover placeholder image.
  const artHint = type === 'parcel' ? 'parcel' : type === 'bus' ? 'bus' : type === 'pooling' ? 'pooling' : title;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full cursor-pointer rounded-[20px] p-3.5 text-left transition-colors sm:p-4"
      style={{ background: 'var(--user-card-bg)', border: '1px solid var(--user-border)', boxShadow: 'var(--user-card-shadow)' }}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="service-art relative h-[64px] w-[64px] shrink-0 rounded-2xl sm:h-[72px] sm:w-[72px]">
          <ServiceArt src={vehicleImage} label={type} hint={artHint} size={28} imgClassName="h-full w-full object-cover" />
          <div className="absolute bottom-1 right-1 h-7 w-7 overflow-hidden rounded-full" style={{ border: '2px solid var(--user-card-bg)', background: 'var(--user-card-bg)' }}>
            <img
              src={resolvedDriverImage}
              alt={driverName}
              className="h-full w-full object-cover"
              draggable={false}
              onError={() => setDriverBroken(true)}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="line-clamp-2 break-words text-[15px] font-semibold leading-tight" style={{ color: 'var(--user-text-primary)' }}>{title}</h4>
              <p className="mt-1 line-clamp-2 break-words text-[11px] font-medium" style={{ color: 'var(--user-text-muted)' }}>
                {eyebrow || driverName}
              </p>
              <p className="mt-1.5 line-clamp-2 text-[12px]" style={{ color: 'var(--user-text-secondary)' }}>{address}</p>
            </div>
            <span className="shrink-0 whitespace-nowrap pl-1 text-[14px] font-semibold" style={{ color: 'var(--user-text-primary)' }}>Rs {price}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 text-[11px] font-medium leading-none" style={{ color: 'var(--user-text-muted)' }}>
              <Calendar size={11} strokeWidth={2.4} />
              <span>{date}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-medium leading-none" style={{ color: 'var(--user-text-muted)' }}>
              <Clock size={11} strokeWidth={2.4} />
              <span>{time}</span>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none sm:ml-auto ${STATUS_STYLES[statusTone] || STATUS_STYLES.default}`}>
              {String(status || '').charAt(0).toUpperCase() + String(status || '').slice(1).toLowerCase()}
            </span>
          </div>
        </div>

        <ChevronRight size={18} strokeWidth={2.4} className="mt-1 shrink-0" style={{ color: 'var(--user-text-muted)' }} />
      </div>
    </motion.button>
  );
};

export default ActivityCard;
