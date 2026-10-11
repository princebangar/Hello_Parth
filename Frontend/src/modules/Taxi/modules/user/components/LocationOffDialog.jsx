import React from 'react';
import { createPortal } from 'react-dom';
import { MapPinOff } from 'lucide-react';

// "Use current location" could not read the device position: location is switched off for the phone / the app
// (or the permission was refused). One dialog for every screen that has such a button.
// `reason`: 'denied' (permission refused) or anything else (GPS off / no signal).
const LocationOffDialog = ({ open, reason = 'off', onRetry, onClose }) => {
  if (!open || typeof document === 'undefined') return null;

  const denied = reason === 'denied';

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Turn on location"
    >
      <div className="w-full max-w-[340px] rounded-[28px] bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-amber-600">
          <MapPinOff size={26} />
        </div>
        <h3 className="mt-4 text-[18px] font-black text-slate-900">Turn on location</h3>
        <p className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-500">
          {denied
            ? 'Location access is blocked for Hello Parth. Allow it in your phone / browser settings, then tap Try again.'
            : 'Your phone location (GPS) is off. Turn it on in the phone settings to use your current location, then tap Try again.'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-2xl border border-slate-200 bg-white text-[13px] font-bold text-slate-600 active:scale-95"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="h-12 rounded-2xl bg-slate-900 text-[13px] font-bold text-white active:scale-95"
          >
            Try again
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LocationOffDialog;
