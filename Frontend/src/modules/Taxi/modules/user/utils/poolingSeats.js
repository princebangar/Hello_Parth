// Pooling seats are stored by grid position ("row-col", e.g. "0-1") because that is what the server books and checks.
// Riders must see the seat name painted on the seat map (the admin label, else S1, S2 ... by position).

export const getPoolingSeatLabel = (item, index) => item?.label || (item?.type === 'driver' ? 'DRV' : `S${index + 1}`);

export const getPoolingSeatLabelMap = (blueprint) => {
  const labels = new Map();
  (Array.isArray(blueprint?.layout) ? blueprint.layout : []).forEach((item, index) => {
    if (item?.type === 'seat') {
      labels.set(`${item.r}-${item.c}`, getPoolingSeatLabel(item, index));
    }
  });
  return labels;
};

export const formatPoolingSeatLabels = (blueprint, seatIds = []) => {
  const labels = getPoolingSeatLabelMap(blueprint);
  return (Array.isArray(seatIds) ? seatIds : []).map((seatId) => labels.get(String(seatId)) || String(seatId)).join(', ');
};
