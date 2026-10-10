import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/axiosInstance';

const unwrap = (response) => response?.data?.data || response?.data || response || {};
const money = (value) => `Rs ${Number(value || 0).toFixed(Number(value || 0) % 1 === 0 ? 0 : 2)}`;

/** After a cancel: one toast saying what happened to the fee (the cancel response carries it). */
export const announceCancellationFee = (response) => {
  const fee = unwrap(response)?.cancellationFee;
  if (!fee || !(Number(fee.amount) > 0)) {
    return;
  }
  toast(
    fee.status === 'paid'
      ? `${money(fee.amount)} cancellation fee was deducted from your wallet.`
      : `${money(fee.amount)} cancellation fee will be added to your next ride.`,
    { duration: 5000 },
  );
};

/**
 * What cancelling this ride costs the rider right now (Set Price > Cancellation Fee for User, set by the admin).
 * Used inside every "Cancel ride?" popup, so the rider sees the amount BEFORE confirming:
 *   - no driver assigned yet  -> free
 *   - driver assigned         -> the fee, taken from the wallet now, or added to the next ride if the wallet is short
 * `open` is the popup's visibility: the amount is fetched fresh every time the popup opens.
 */
export const useCancellationFee = (rideId, open) => {
  const [state, setState] = useState({ loading: false, fee: null });

  useEffect(() => {
    if (!open || !rideId) {
      return undefined;
    }

    let active = true;
    setState({ loading: true, fee: null });
    api.get(`/rides/${rideId}/cancellation-fee`)
      .then((response) => {
        if (active) setState({ loading: false, fee: unwrap(response) });
      })
      .catch(() => {
        // never block a cancel because the amount could not be loaded
        if (active) setState({ loading: false, fee: null });
      });

    return () => {
      active = false;
    };
  }, [open, rideId]);

  return state;
};

const CancellationFeeNotice = ({ rideId, open = true }) => {
  const { loading, fee } = useCancellationFee(rideId, open);

  if (loading) {
    return (
      <div className="mb-5 rounded-2xl bg-slate-50 px-4 py-3 text-left text-[12px] font-semibold text-slate-400 animate-pulse">
        Checking cancellation fee...
      </div>
    );
  }

  if (!fee) {
    return null;
  }

  if (!fee.applies) {
    return (
      <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-left">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        <p className="text-[12px] font-bold leading-snug text-emerald-700">No cancellation fee - you can cancel for free.</p>
      </div>
    );
  }

  const fromWallet = fee.payFrom === 'wallet';

  return (
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-left" data-testid="cancel-fee-notice">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-[13px] font-black text-amber-800">Cancellation fee: {money(fee.feeAmount)}</p>
          <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-amber-700">
            Your captain has already been assigned, so cancelling now has a fee.
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex items-start gap-2.5 border-t border-amber-200/70 pt-2.5">
        <Wallet size={15} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-[11.5px] font-bold leading-snug text-amber-800">
          {fromWallet
            ? `It will be deducted from your wallet now (balance ${money(fee.walletBalance)}).`
            : `Your wallet balance (${money(fee.walletBalance)}) is not enough, so ${money(fee.feeAmount)} will be added to the fare of your next ride.`}
        </p>
      </div>
    </div>
  );
};

/**
 * Shown before booking: a cancellation fee the rider still owes from an earlier ride (wallet was short) is added to
 * the fare of the ride being booked once it starts.
 */
export const PendingCancellationDueNotice = ({ className = '' }) => {
  const [due, setDue] = useState(0);

  useEffect(() => {
    let active = true;
    api.get('/rides/cancellation-due/me')
      .then((response) => {
        if (active) setDue(Number(unwrap(response).amount || 0));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!(due > 0)) {
    return null;
  }

  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left ${className}`} data-testid="pending-due-notice">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
      <p className="text-[12px] font-bold leading-snug text-amber-800">
        {money(due)} cancellation fee from your earlier cancelled ride will be added to this ride's fare when the trip starts.
      </p>
    </div>
  );
};

export default CancellationFeeNotice;
