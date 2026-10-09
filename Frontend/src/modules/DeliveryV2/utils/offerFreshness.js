/**
 * An offer only pops up and rings while it is recent. An order that has sat unassigned in the zone for a long
 * time (nobody took it, or its dispatch stopped) still shows in the Orders tab, but must not ring a rider who
 * has just opened the app. Reference time = the latest of: restaurant accepted, last time it was offered.
 */
export const OFFER_FRESH_MS = 10 * 60 * 1000;

export function isOfferFresh(order, now = Date.now()) {
  if (!order) return false;
  const times = [
    order.acceptedAt,
    order.dispatch?.assignedAt,
    ...(Array.isArray(order.dispatch?.offeredTo) ? order.dispatch.offeredTo.map((entry) => entry?.at) : []),
  ]
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter(Number.isFinite);

  // A live socket payload may not carry any time: treat it as fresh.
  if (!times.length) return true;
  return now - Math.max(...times) <= OFFER_FRESH_MS;
}
