import { PlatformSetting } from './platformSetting.model.js';
import { FoodSystemConfig } from '../../modules/food/admin/models/systemConfig.model.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Global admin > Customization Settings switches that apply to the whole app (Food + Taxi):
 *  - Under Maintenance (every app: Food user / restaurant / delivery and Taxi user / driver), Default Location Mode
 *  - User Global COD / User Wallet Payment / User Online Payment (customer payment methods)
 *
 * They live in `platform_settings`. Default location used to be a Food admin switch stored in FoodSystemConfig, so
 * until the Global admin saves it once the old Food value is still honoured. Food keeps its own, separate
 * "Food Under Maintenance" switch (maintenanceMode.service.js) that only locks the Food apps.
 *
 * Read on every API call (maintenance) and every order / ride, so the answer is cached for a few seconds and
 * dropped immediately when the Global admin changes a switch.
 */
const CACHE_TTL_MS = 3000;

const LEGACY_FOOD_KEYS = {
  default_location_enabled: 'default_location_enabled',
};

export const APP_SWITCH_DEFAULTS = {
  maintenance_mode_enabled: false,
  default_location_enabled: false,
  my_store_enabled: true,
  user_cod_enabled: true,
  user_wallet_enabled: true,
  user_online_enabled: true,
};

export const APP_SWITCH_KEYS = Object.keys(APP_SWITCH_DEFAULTS);

const USER_PAYMENT_SWITCH = {
  cod: 'user_cod_enabled',
  wallet: 'user_wallet_enabled',
  online: 'user_online_enabled',
};

const USER_PAYMENT_LABEL = {
  cod: 'Cash payment',
  wallet: 'Wallet payment',
  online: 'Online payment',
};

let cached = { ...APP_SWITCH_DEFAULTS };
let cachedAt = 0;
let inflight = null;

const loadSwitches = async () => {
  const [settings, legacyDocs] = await Promise.all([
    PlatformSetting.findOne({ scope: 'default' }).select('app user_payments').lean(),
    FoodSystemConfig.find({ key: { $in: Object.values(LEGACY_FOOD_KEYS) } }).select('key value').lean(),
  ]);
  const legacy = new Map(legacyDocs.map((doc) => [doc.key, doc.value === true]));

  const pickApp = (key) =>
    typeof settings?.app?.[key] === 'boolean' ? settings.app[key] : legacy.get(LEGACY_FOOD_KEYS[key]) === true;

  return {
    maintenance_mode_enabled: settings?.app?.maintenance_mode_enabled === true,
    default_location_enabled: pickApp('default_location_enabled'),
    my_store_enabled: settings?.app?.my_store_enabled !== false,
    user_cod_enabled: settings?.user_payments?.cod_enabled !== false,
    user_wallet_enabled: settings?.user_payments?.wallet_enabled !== false,
    user_online_enabled: settings?.user_payments?.online_enabled !== false,
  };
};

export const getAppSwitches = async () => {
  if (Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = loadSwitches()
    .then((next) => {
      cached = next;
      cachedAt = Date.now();
      return cached;
    })
    // Keep the last known answer when the lookup fails: never lock the apps or flip payments on a DB blip.
    .catch(() => cached)
    .finally(() => {
      inflight = null;
    });

  return inflight;
};

export const invalidateAppSwitches = () => {
  cachedAt = 0;
};

export const isMaintenanceModeOn = async () => (await getAppSwitches()).maintenance_mode_enabled === true;

/**
 * Global admin > Customization Settings > My Store. Off hides the whole My Store feature from customers and restaurant
 * partners (Explore More icon, store list, store dishes in search / categories, the Restaurant Partner | My Store choice on
 * login) and refuses new My Store sign-ins / registrations. Nothing is deleted; stores logged in already keep working.
 */
export const isMyStoreEnabled = async () => (await getAppSwitches()).my_store_enabled !== false;

/** `kind`: 'cod' | 'wallet' | 'online'. True unless the Global admin switched it off for all customers. */
export const isUserPaymentEnabled = async (kind) => (await getAppSwitches())[USER_PAYMENT_SWITCH[kind]] !== false;

export const assertUserPaymentEnabled = async (kind) => {
  if (!(await isUserPaymentEnabled(kind))) {
    throw new ApiError(403, `${USER_PAYMENT_LABEL[kind]} is currently unavailable`);
  }
};

/** Global admin save. Only boolean values for known keys are accepted. */
export const setAppSwitches = async (payload = {}, updatedBy = null) => {
  const set = {};
  for (const key of APP_SWITCH_KEYS) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== 'boolean') {
      throw new ApiError(400, `${key} must be true or false`);
    }
    if (key === 'maintenance_mode_enabled' || key === 'default_location_enabled' || key === 'my_store_enabled') {
      set[`app.${key}`] = payload[key];
    } else {
      set[`user_payments.${key.replace('user_', '')}`] = payload[key];
    }
  }

  if (Object.keys(set).length === 0) {
    throw new ApiError(400, `Nothing to update. Allowed: ${APP_SWITCH_KEYS.join(', ')}`);
  }

  await PlatformSetting.updateOne({ scope: 'default' }, { $set: { ...set, updatedBy } }, { upsert: true });
  invalidateAppSwitches();
  return getAppSwitches();
};
