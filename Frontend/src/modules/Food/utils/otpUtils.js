/**
 * OTP Utility Functions — shared food/taxi test-phone helpers.
 * Default test phone comes from VITE_DEFAULT_TEST_PHONE (Backend DEFAULT_TEST_PHONE).
 */

const envTestPhone = String(import.meta.env.VITE_DEFAULT_TEST_PHONE || '8962843670')
  .replace(/\D/g, '')
  .slice(-10);

const TEST_PHONE_NUMBERS = [
  envTestPhone,
  '8962843670',
].filter(Boolean);

export const DEFAULT_TEST_OTP = '1234';

export const extractPhoneDigits = (phone) => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(-10);
  }
  return digits.length <= 10 ? digits : digits.slice(-10);
};

export const isTestPhoneNumber = (phone) => {
  const phoneDigits = extractPhoneDigits(phone);
  return TEST_PHONE_NUMBERS.includes(phoneDigits);
};

export const getDefaultOTP = (phone) => {
  return isTestPhoneNumber(phone) ? DEFAULT_TEST_OTP : null;
};
