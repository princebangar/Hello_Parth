// The web code reads its config as import.meta.env.VITE_*; the ported files read the same names from globalThis.__ENV__.
// EXPO_PUBLIC_* values are inlined at build time, so every one has to be written out here literally.
export const ENV = Object.freeze({
  DEV: __DEV__,
  PROD: !__DEV__,
  MODE: __DEV__ ? 'development' : 'production',
  VITE_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://helloparth.in/api/v1',
  VITE_SOCKET_URL: process.env.EXPO_PUBLIC_SOCKET_URL || 'https://helloparth.in',
  VITE_BACKEND_ORIGIN: process.env.EXPO_PUBLIC_BACKEND_ORIGIN || 'https://helloparth.in',
  VITE_ASSET_BASE_URL: process.env.EXPO_PUBLIC_ASSET_BASE_URL || 'https://helloparth.in',
  VITE_PUBLIC_APP_URL: 'https://helloparth.in',
  VITE_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  VITE_RAZORPAY_KEY_ID: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || '',
  VITE_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  VITE_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  VITE_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  VITE_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  VITE_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  VITE_FIREBASE_MEASUREMENT_ID: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
  VITE_FIREBASE_DATABASE_URL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || '',
});

export const API_BASE_URL = ENV.VITE_API_BASE_URL.replace(/\/$/, '');
export const BACKEND_ORIGIN = ENV.VITE_BACKEND_ORIGIN.replace(/\/$/, '');
export const GOOGLE_MAPS_API_KEY = ENV.VITE_GOOGLE_MAPS_API_KEY;
export const ANDROID_PACKAGE = 'com.helloparth.user';
