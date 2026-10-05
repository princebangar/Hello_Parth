import { FoodSystemConfig } from '../models/systemConfig.model.js';
import { invalidateAppSwitches, isMaintenanceModeOn } from '../../../../core/platform/appSwitches.service.js';

/**
 * Two Under Maintenance switches:
 *  - Food:   Food admin > Customization Settings > "Food Under Maintenance" (FoodSystemConfig) locks the Food apps
 *            (user, restaurant, delivery) only.
 *  - Global: Global admin > Customization Settings > "Under Maintenance" (platform_settings) locks every app,
 *            Food and Taxi (user, restaurant, delivery, driver).
 * Admin panels always stay available. A missing setting or a DB error keeps the apps open.
 */
const FOOD_KEY = 'maintenance_mode_enabled';
const CACHE_TTL_MS = 3000;

let foodValue = false;
let foodCachedAt = 0;
let foodInflight = null;

async function isFoodMaintenanceOn() {
  if (Date.now() - foodCachedAt < CACHE_TTL_MS) return foodValue;
  if (foodInflight) return foodInflight;

  foodInflight = (async () => {
    try {
      const doc = await FoodSystemConfig.findOne({ key: FOOD_KEY }).lean();
      foodValue = doc?.value === true;
    } catch {
      // Fail open: never lock apps if the config lookup fails.
      foodValue = false;
    }
    foodCachedAt = Date.now();
    foodInflight = null;
    return foodValue;
  })();

  return foodInflight;
}

/** `{ global, food }`: global locks everything, food locks only the Food apps. */
export async function getMaintenanceState() {
  const [global, food] = await Promise.all([isMaintenanceModeOn(), isFoodMaintenanceOn()]);
  return { global: global === true, food: food === true };
}

/** Drop the cached answers so clients / APIs flip instantly after an admin saves. */
export function invalidateMaintenanceModeCache(nextFoodValue) {
  invalidateAppSwitches();
  foodCachedAt = 0;
  if (typeof nextFoodValue === 'boolean') {
    foodValue = nextFoodValue === true;
    foodCachedAt = Date.now();
  }
}
