import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bike,
  Car,
  Clock,
  Navigation,
  Phone,
  Package,
  X,
} from 'lucide-react';
import { getScheduledRideCountdown } from '../utils/scheduledRideTime';

const Motion = motion;
const DEFAULT_ACCEPT_REJECT_SECONDS = 15;

const normalizePayment = (value = '') => String(value || 'cash').toUpperCase();

const getRequestExpiryTime = (data, requestDurationSeconds) => {
  const safeData = data || {};
  const rawExpiryTime = safeData.requestExpiresAt || safeData.raw?.requestExpiresAt;
  const expiryTimestamp = rawExpiryTime ? new Date(rawExpiryTime).getTime() : NaN;

  if (Number.isFinite(expiryTimestamp) && expiryTimestamp > Date.now()) {
    return expiryTimestamp;
  }

  return Date.now() + (requestDurationSeconds * 1000);
};

const getRequestDurationSeconds = (data) => {
  const safeData = data || {};
  const rawDuration = safeData.acceptRejectDurationSeconds ||
    safeData.expiresInSeconds ||
    safeData.raw?.acceptRejectDurationSeconds ||
    safeData.raw?.expiresInSeconds;
  const duration = Number(rawDuration);

  return Number.isFinite(duration) && duration > 0
    ? Math.ceil(duration)
    : DEFAULT_ACCEPT_REJECT_SECONDS;
};

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Schedule time not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Schedule time not available';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const IncomingRideRequest = ({
  visible,
  onAccept,
  onDecline,
  onSubmitBid,
  onClose,
  requestData,
  isAccepting = false,
  onPreviewCancel,
  isPreviewCancelling = false,
  canPreviewCancel = true,
  previewCancelDisabledLabel = 'Cancel unavailable',
  previewCancelHelpText = '',
  mode = 'live',
}) => {
  const isPreviewMode = mode === 'preview';
  const requestDurationSeconds = getRequestDurationSeconds(requestData);
  const [timer, setTimer] = useState(requestDurationSeconds);
  const [previewNow, setPreviewNow] = useState(() => Date.now());
  const data = requestData;
  const onDeclineRef = useRef(onDecline);
  onDeclineRef.current = onDecline;
  // One fixed expiry per ride request, so parent re-renders can never restart the countdown.
  const expiryRef = useRef({ key: '', expiresAt: 0 });

  useEffect(() => {
    if (isPreviewMode || !visible || !data?.rideId) {
      return undefined;
    }

    const requestKey = `${data.rideId}|${data.requestExpiresAt || data.raw?.requestExpiresAt || ''}`;
    if (expiryRef.current.key !== requestKey) {
      expiryRef.current = { key: requestKey, expiresAt: getRequestExpiryTime(data, requestDurationSeconds) };
    }
    const { expiresAt } = expiryRef.current;
    let hasExpired = false;

    const syncTimer = () => {
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setTimer(remainingSeconds);

      if (!hasExpired && remainingSeconds <= 0) {
        hasExpired = true;
        onDeclineRef.current?.();
      }
    };

    syncTimer();
    const interval = setInterval(syncTimer, 250);

    return () => {
      clearInterval(interval);
    };
  }, [visible, requestDurationSeconds, data?.rideId, data?.requestExpiresAt, isPreviewMode]);

  useEffect(() => {
    if (!visible || !isPreviewMode) {
      return undefined;
    }

    setPreviewNow(Date.now());
    const interval = setInterval(() => {
      setPreviewNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [visible, isPreviewMode]);

  if (!visible || !data) return null;

  const isParcel = data.type === 'parcel';
  const isIntercity = data.type === 'intercity';
  const scheduledAt = data.scheduledAt || data.raw?.scheduledAt || data.raw?.ride?.scheduledAt || null;
  const isScheduledRequest = Boolean(scheduledAt);
  const title = isPreviewMode
    ? (isParcel ? 'Scheduled delivery' : isIntercity ? 'Scheduled intercity trip' : 'Scheduled ride')
    : (isScheduledRequest
      ? (isParcel ? 'Scheduled delivery request' : isIntercity ? 'Scheduled intercity request' : 'Scheduled ride request')
      : (isParcel ? 'New delivery request' : isIntercity ? 'New intercity request' : 'New ride request'));
  const intercityRoute = [data.raw?.intercity?.fromCity, data.raw?.intercity?.toCity].filter(Boolean).join(' to ');
  const category = data.raw?.parcel?.category || data.raw?.parcel?.weight || (isParcel ? 'Parcel delivery' : isIntercity ? intercityRoute || 'Intercity trip' : 'Passenger ride');
  const payment = normalizePayment(data.payment);
  const timerProgress = Math.max(0, Math.min(100, (timer / requestDurationSeconds) * 100));
  const accentClass = isParcel ? 'bg-orange-500' : isIntercity ? 'bg-yellow-400' : 'bg-blue-600';
  const accentTextClass = isParcel ? 'text-orange-600' : isIntercity ? 'text-yellow-700' : 'text-blue-600';
  const pickupAddress = data.raw?.pickupAddress || data.pickup || 'Pickup point';
  const dropAddress = data.raw?.dropAddress || data.drop || 'Drop point';
  const rideStops = (Array.isArray(data.raw?.stops) ? data.raw.stops : Array.isArray(data.stops) ? data.stops : [])
    .map((stop) => String((stop && typeof stop === 'object' ? stop.address : stop) || '').trim())
    .filter(Boolean);
  const attemptCount = Number(data.attempt || data.raw?.attempt || 1);
  const maxAttempts = Number(data.maxAttempts || data.raw?.maxAttempts || 1);
  const searchRadiusMeters = Number(data.raw?.radius || data.radius || 0);
  const searchRadiusLabel = searchRadiusMeters > 0 ? `${(searchRadiusMeters / 1000).toFixed(1)} km` : 'nearby';
  const customerName = data.customer?.name || data.raw?.user?.name || 'Customer';
  const customerPhone = [data.customer?.countryCode, data.customer?.phone]
    .filter(Boolean)
    .join(' ')
    .trim() || data.raw?.user?.phone || '';
  const pricingNegotiationMode = String(data.raw?.pricingNegotiationMode || 'none').toLowerCase();
  const isBidding = pricingNegotiationMode === 'driver_bid' && (Boolean(data.raw?.bidding?.enabled) || String(data.raw?.bookingMode || '').toLowerCase() === 'bidding');
  const isUserIncrementOnly = pricingNegotiationMode === 'user_increment_only';
  const fareWasIncreased = isUserIncrementOnly && Number(data.raw?.fare || 0) > Number(data.raw?.baseFare || data.raw?.fare || 0);
  const bidBaseFare = Number(data.raw?.bidding?.baseFare || data.raw?.baseFare || data.raw?.fare || 0);
  const bidFloorFare = Number(data.raw?.bidding?.bidFloorFare || bidBaseFare);
  const bidMaxFare = Number(data.raw?.bidding?.userMaxBidFare || data.raw?.userMaxBidFare || bidBaseFare);
  const bidStepAmount = Number(data.raw?.bidding?.bidStepAmount || 10);
  // The big number is what the driver earns (fare + promo paid by the platform - admin commission), not the rider fare.
  const requestFare = Number(data.raw?.fare || 0);
  const requestPromoDiscount = Math.max(0, Number(data.raw?.promoDiscount || 0));
  const requestCommissionType = Number(data.raw?.pricingSnapshot?.admin_commission_type_from_driver ?? 1);
  const requestCommissionValue = Math.max(0, Number(data.raw?.pricingSnapshot?.admin_commission_from_driver ?? 0));
  const requestGrossFare = requestFare + requestPromoDiscount;
  const requestCommission = requestCommissionType === 1
    ? Math.round(requestGrossFare * requestCommissionValue) / 100
    : Math.min(requestGrossFare, requestCommissionValue);
  const estimatedEarning = requestFare > 0 && !isBidding
    ? Math.max(0, Math.round((requestGrossFare - requestCommission) * 100) / 100)
    : null;
  const vehicleIconType = String(data.raw?.vehicleIconType || '').toLowerCase();
  const RideVehicleIcon = /bike|scooty|scooter/.test(vehicleIconType) ? Bike : Car;
  const tripMinutes = Math.round(Number(data.raw?.estimatedDurationMinutes || 0));
  const scheduledCountdown = getScheduledRideCountdown(scheduledAt, previewNow);
  const bidOptions = isBidding
    ? Array.from({ length: Math.max(1, Math.floor((bidMaxFare - bidFloorFare) / bidStepAmount) + 1) }, (_, index) => bidFloorFare + (index * bidStepAmount))
    : [];

  // One blue theme for every request type (taxi, parcel, intercity) - same as the rest of the driver apps.
  const accentBg = 'bg-blue-600';
  const accentText = 'text-blue-600';
  const lightBg = 'bg-blue-50';
  const lightBorder = 'border-blue-100';
  const ringColor = '#2563eb';
  const TypeIcon = isParcel ? Package : isIntercity ? Navigation : RideVehicleIcon;
  const scheduleLine = isPreviewMode || isScheduledRequest ? formatScheduledDateTime(scheduledAt) : '';

  return (
    <AnimatePresence mode="wait">
      <Motion.div
        data-driver-overlay="request"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // Above the bottom bar (which also hides while this is open) and every page layer.
        className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/50 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onClick={(event) => {
          if (isPreviewMode && event.target === event.currentTarget) {
            (onClose || onDecline)?.();
          }
        }}
      >
        <Motion.div
          initial={{ y: 60, opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          className="relative flex w-full max-w-[420px] max-h-[min(calc(100dvh-1.5rem),640px)] flex-col overflow-hidden rounded-[26px] bg-white shadow-[0_24px_70px_rgba(0,0,0,0.35)]"
        >
          {!isPreviewMode ? (
            <div className="h-1 w-full shrink-0 bg-slate-100">
              <Motion.div className={`h-full ${accentBg}`} animate={{ width: `${timerProgress}%` }} transition={{ duration: 0.35 }} />
            </div>
          ) : null}

          {/* header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${accentBg} text-white`}>
              <TypeIcon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <span className={`inline-flex rounded-full ${lightBg} ${accentText} px-2 py-0.5 text-[9px] font-black uppercase tracking-wider`}>
                {isPreviewMode ? 'Scheduled trip' : isScheduledRequest ? 'Scheduled request' : 'Ride offer'}
              </span>
              <h2 className="mt-0.5 truncate text-[17px] font-black leading-tight text-slate-900">{title}</h2>
              <p className="truncate text-[11px] font-semibold text-slate-500">
                {scheduleLine ? `For ${scheduleLine}` : category}
              </p>
            </div>
            {isPreviewMode ? (
              <button
                type="button"
                onClick={onClose || onDecline}
                aria-label="Close"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 active:scale-95"
              >
                <X size={18} />
              </button>
            ) : (
              <div
                className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full"
                style={{ background: `conic-gradient(${ringColor} ${timerProgress}%, #e2e8f0 0)` }}
              >
                <div className="grid h-[42px] w-[42px] place-items-center rounded-full bg-white">
                  <span className="text-[17px] font-black leading-none text-slate-900">{timer}</span>
                </div>
              </div>
            )}
          </div>

          {/* body (scrolls on a short screen; the buttons below never leave the screen) */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/60">
              <div className="flex flex-col items-center justify-center px-2 py-2.5 text-center">
                <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Distance</p>
                <p className="mt-0.5 text-[14px] font-black text-slate-800">{data.distance || 'Nearby'}</p>
                {tripMinutes > 0 ? <p className="text-[10px] font-bold text-slate-400">~{tripMinutes} min</p> : null}
              </div>
              <div className="flex flex-col items-center justify-center bg-blue-600 px-2 py-2.5 text-center text-white">
                <p className="text-[9px] font-extrabold uppercase tracking-wider text-white/85">{estimatedEarning !== null ? 'You earn' : 'Fare'}</p>
                <p className="mt-0.5 text-[20px] font-black leading-none">{estimatedEarning !== null ? `Rs ${estimatedEarning}` : (data.fare || 'Rs 0')}</p>
                {estimatedEarning !== null ? <p className="mt-0.5 text-[9px] font-bold text-white/80">Fare Rs {requestFare}</p> : null}
              </div>
              <div className="flex flex-col items-center justify-center px-2 py-2.5 text-center">
                <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Payment</p>
                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${payment.includes('CASH') ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                  {payment}
                </span>
              </div>
            </div>

            {isPreviewMode || isScheduledRequest ? (
              <div className="mt-3 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
                <Clock size={18} className="mt-0.5 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <p className="text-[13px] font-black text-slate-800">{scheduleLine}</p>
                  <p className="text-[11px] font-black text-blue-600">{scheduledCountdown}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    {isPreviewMode ? 'Booked for later. Cancel only if you cannot make this pickup.' : 'Accept only if you can commit to this pickup time.'}
                  </p>
                </div>
              </div>
            ) : null}

            {isIntercity ? (
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-blue-100 bg-blue-50/40 px-3 py-2.5">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Trip</p>
                  <p className="truncate text-[12px] font-extrabold text-slate-800">{data.raw?.intercity?.tripType || 'Intercity'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Date</p>
                  <p className="truncate text-[12px] font-extrabold text-slate-800">{data.raw?.intercity?.travelDate || 'Today'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Pax</p>
                  <p className="truncate text-[12px] font-extrabold text-slate-800">{data.raw?.intercity?.passengers || 1}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-3">
              <div className="relative flex flex-col gap-3.5">
                <div className="absolute bottom-3 left-[8px] top-3 w-[2px] bg-slate-100" />
                <div className="flex items-start gap-3">
                  <span className="relative z-10 mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-emerald-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Pickup</p>
                    <p className="text-[13px] font-bold leading-snug text-slate-800">{pickupAddress}</p>
                  </div>
                </div>
                {rideStops.map((stop, index) => (
                  <div key={`stop-${index}`} className="flex items-start gap-3">
                    <span className="relative z-10 mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-amber-100 text-[9px] font-black text-amber-700">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-wider text-amber-700">Stop {index + 1}</p>
                      <p className="text-[13px] font-bold leading-snug text-slate-800">{stop}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-3">
                  <span className="relative z-10 mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-rose-100">
                    <span className="h-2 w-2 rounded-sm bg-rose-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-wider text-rose-700">Drop</p>
                    <p className="text-[13px] font-bold leading-snug text-slate-800">{dropAddress}</p>
                  </div>
                </div>
              </div>
            </div>

            {Array.isArray(data.raw?.riderPreferences) && data.raw.riderPreferences.length > 0 ? (
              <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/50 px-3 py-2.5">
                <p className="text-[9px] font-black uppercase tracking-wider text-blue-600">Rider wants</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {data.raw.riderPreferences.map((item) => (
                    <span key={item} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm">{item}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-3 py-2">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-[13px] font-extrabold text-slate-600">
                {customerName.substring(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Rider</p>
                <p className="truncate text-[13px] font-extrabold text-slate-800">{customerName}</p>
              </div>
              {customerPhone ? (
                <a href={`tel:${customerPhone}`} className={`flex items-center gap-1 rounded-full ${lightBg} px-3 py-1.5 text-[11px] font-bold ${accentText}`}>
                  <Phone size={11} strokeWidth={2.5} /> Call
                </a>
              ) : null}
            </div>

            {isBidding && !isPreviewMode ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {bidOptions.slice(0, 6).map((bidValue) => (
                  <button
                    key={bidValue}
                    type="button"
                    onClick={() => onSubmitBid?.(bidValue)}
                    disabled={isAccepting}
                    className={`rounded-xl border ${lightBorder} ${lightBg} py-2 text-[11px] font-extrabold uppercase tracking-wide ${accentText} active:scale-95 disabled:opacity-60`}
                  >
                    Rs {bidValue}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* actions: always visible */}
          <div className="shrink-0 border-t border-slate-100 bg-white px-4 pb-3 pt-3">
            {isPreviewMode ? (
              onPreviewCancel ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={onClose || onDecline}
                    disabled={isPreviewCancelling}
                    className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[12px] font-bold uppercase tracking-[0.12em] text-slate-600 active:scale-95 disabled:opacity-60"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (canPreviewCancel) {
                        onPreviewCancel(data);
                      }
                    }}
                    disabled={isPreviewCancelling || !canPreviewCancel}
                    className="flex h-12 items-center justify-center rounded-2xl bg-rose-500 px-4 text-[12px] font-bold uppercase tracking-[0.12em] text-white active:scale-95 disabled:opacity-60"
                  >
                    {isPreviewCancelling ? 'Cancelling...' : canPreviewCancel ? 'Cancel ride' : previewCancelDisabledLabel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onClose || onDecline}
                  className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 px-5 text-[12px] font-bold uppercase tracking-[0.12em] text-white active:scale-95"
                >
                  Close details
                </button>
              )
            ) : (
              <>
                <div className="grid grid-cols-[64px_1fr] items-center gap-3">
                  <button
                    type="button"
                    onClick={onDecline}
                    disabled={isAccepting}
                    aria-label="Decline"
                    className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 active:scale-95 disabled:opacity-60"
                  >
                    <X size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => (isBidding ? onSubmitBid?.(bidBaseFare) : onAccept(data))}
                    disabled={isAccepting}
                    className={`flex h-12 w-full items-center justify-center rounded-2xl ${accentBg} px-5 text-[13px] font-extrabold uppercase tracking-[0.12em] text-white shadow-[0_8px_18px_rgba(37,99,235,0.3)] active:scale-95 disabled:opacity-70`}
                  >
                    {isAccepting ? (isBidding ? 'Submitting...' : 'Accepting...') : (isBidding ? 'Send Bid' : 'Accept ride')}
                  </button>
                </div>
                <p className="mt-2 text-center text-[10px] font-bold text-slate-400">Request auto-declines when the timer ends.</p>
              </>
            )}
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
};

export default IncomingRideRequest;
