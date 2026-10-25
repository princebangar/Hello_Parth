// The server refuses a new booking (409, code PREVIOUS_RIDE_UNPAID) while an online ride is still unpaid - like the
// "clear your dues" rule in Uber / Rapido. These helpers send the rider straight to that ride's payment screen.

export const getUnpaidRideFromError = (error) => {
  const data = error?.response?.data || error?.data || {};
  const details = data?.details || error?.details || null;
  if (details && String(details.code || '') === 'PREVIOUS_RIDE_UNPAID' && details.rideId) {
    return { ...details, message: data?.message || error?.message || '' };
  }
  return null;
};

export const openUnpaidRidePayment = (navigate, pathname, unpaid) => {
  const base = String(pathname || '').startsWith('/taxi/user') ? '/taxi/user' : '/taxi';
  navigate(`${base}/ride/complete`, {
    replace: true,
    state: {
      rideId: String(unpaid.rideId),
      fare: Number(unpaid.fare || 0),
      paymentMethod: 'online',
      pickup: unpaid.pickup || 'Pickup',
      drop: unpaid.drop || 'Drop',
      serviceType: unpaid.serviceType || 'ride',
      status: 'completed',
      liveStatus: 'completed',
      unpaidNotice: unpaid.message || '',
    },
  });
};
