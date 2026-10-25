// The parcel details screen opens the place picker on top of itself. The picker goes back with one history step
// (pushing the details screen again added an entry per location change, so Android back had to be pressed 2-3 times);
// the place that was picked is handed over here and read by the details screen when it shows again.
const PARCEL_PICKER_RESULT_KEY = 'parcelPickerResult';

const RESULT_FIELDS = ['pickup', 'drop', 'pickupCoords', 'dropCoords', 'activeInput', 'editPickup'];

export const saveParcelPickerResult = (state = {}) => {
  try {
    const result = {};
    RESULT_FIELDS.forEach((field) => {
      if (state[field] !== undefined) result[field] = state[field];
    });
    window.sessionStorage.setItem(PARCEL_PICKER_RESULT_KEY, JSON.stringify(result));
  } catch {
    // storage blocked: the details screen keeps the places it had
  }
};

export const peekParcelPickerResult = () => {
  try {
    return JSON.parse(window.sessionStorage.getItem(PARCEL_PICKER_RESULT_KEY) || 'null');
  } catch {
    return null;
  }
};

export const clearParcelPickerResult = () => {
  try {
    window.sessionStorage.removeItem(PARCEL_PICKER_RESULT_KEY);
  } catch {
    // nothing to clear
  }
};
