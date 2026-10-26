// Small input rules shared by the Taxi forms (vehicle plate, GST, phone).

// Keeps only letters/digits, upper-cased, max 10 characters — what an Indian plate is (MP09AB1234).
export const formatPlateNumber = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);

// State/UT code (2 letters) + RTO (1-2 digits) + series (0-3 letters) + 4 digits, or the BH series (22BH1234AA).
const PLATE_REGEX = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
const BH_PLATE_REGEX = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

export const isValidPlateNumber = (value) => {
  const plate = formatPlateNumber(value);
  return PLATE_REGEX.test(plate) || BH_PLATE_REGEX.test(plate);
};

export const PLATE_ERROR = 'Enter a valid plate number like MP09AB1234';

// GST number: 15 characters (2 digits state, 10 char PAN, entity digit, Z, check character).
export const formatGstNumber = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 15);

const GST_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const isValidGstNumber = (value) => GST_REGEX.test(formatGstNumber(value));

export const GST_ERROR = 'Enter a valid 15-character GST number';
