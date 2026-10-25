import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "@food/api/axios";
import { shouldEnforceMaintenanceOnClient } from "@food/utils/maintenanceEnv";

const POLL_WHEN_ON_MS = 2500;
const POLL_WHEN_OFF_MS = 8000;

const OFF = { food: false, global: false };

// Last answer from the server (kept by applyFlags below), so a refresh while maintenance is on goes straight to the
// maintenance screen instead of showing the app for a second until the first request returns.
const readCachedFlags = () => {
  try {
    const cached = JSON.parse(localStorage.getItem("helloparth_customization_settings") || "null") || {};
    return { food: cached.maintenance_mode_enabled === true, global: cached.global_maintenance_enabled === true };
  } catch {
    return OFF;
  }
};

/**
 * Strict maintenance flags, only true when the API says so AND this client is allowed to enforce it
 * (live only; local stays open).
 *  - `food`:   Food admin's "Food Under Maintenance" (Food apps only)
 *  - `global`: Global admin's "Under Maintenance" (Food and Taxi, every app)
 *  - `enabled`: either of the two
 */
export function useMaintenanceMode({ active = true } = {}) {
  const enforce = shouldEnforceMaintenanceOnClient();
  const [flags, setFlags] = useState(() => (enforce && active ? readCachedFlags() : OFF));
  const [ready, setReady] = useState(false);
  const enabledRef = useRef(flags.food || flags.global);

  const applyFlags = useCallback(
    (settings) => {
      const real = {
        food: settings?.maintenance_mode_enabled === true,
        global: settings?.global_maintenance_enabled === true,
      };
      // UI lock only follows the real flags when this client may enforce them.
      const next = enforce ? real : OFF;
      enabledRef.current = next.food || next.global;
      setFlags((prev) => (prev.food === next.food && prev.global === next.global ? prev : next));

      try {
        const raw = localStorage.getItem("helloparth_customization_settings");
        const parsed = raw ? JSON.parse(raw) : {};
        // Keep the real DB flags in cache; UI lock only follows `next`.
        localStorage.setItem(
          "helloparth_customization_settings",
          JSON.stringify({
            ...parsed,
            maintenance_mode_enabled: real.food,
            global_maintenance_enabled: real.global,
          })
        );
      } catch {
        /* ignore */
      }
    },
    [enforce]
  );

  const fetchFlags = useCallback(async () => {
    if (!enforce) {
      applyFlags(null);
      setReady(true);
      return;
    }

    try {
      const response = await apiClient.get("/food/public/customization-settings");
      applyFlags(response?.data?.data || response?.data || {});
    } catch {
      applyFlags(null);
    } finally {
      setReady(true);
    }
  }, [applyFlags, enforce]);

  useEffect(() => {
    if (!active || !enforce) {
      setFlags(OFF);
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      await fetchFlags();
      if (cancelled) return;
      const delay = enabledRef.current ? POLL_WHEN_ON_MS : POLL_WHEN_OFF_MS;
      timer = setTimeout(tick, delay);
    };

    tick();

    const onFocus = () => {
      fetchFlags();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchFlags();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    // A 503 MAINTENANCE_MODE from the API (or an admin save) asks for a fresh read of both flags.
    window.addEventListener("maintenanceModeChanged", fetchFlags);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("maintenanceModeChanged", fetchFlags);
    };
  }, [active, fetchFlags, enforce]);

  return { enabled: flags.food || flags.global, food: flags.food, global: flags.global, ready };
}

export default useMaintenanceMode;
