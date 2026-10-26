/**
 * Normalize API / network errors for rider-facing UI.
 * Technical prefixes (e.g. Flutter "Upload/API Failed") stay in the console only.
 */

import { toast } from "@/lib/toast";

const USER_FACING_ERROR_TOAST_ID = "user-facing-api-error";

function tryParseJsonMessage(raw) {
  if (!raw || typeof raw !== "string") return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function stripHtmlToText(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function statusFallback(status) {
  if (status === 502 || status === 503 || status === 504) {
    return "Server temporarily unavailable. Please try again in a moment.";
  }
  if (status === 413) {
    return "File is too large. Please upload a smaller image.";
  }
  if (status === 401 || status === 403) {
    return "Session expired. Please log in again.";
  }
  if (status >= 500) {
    return "Something went wrong on our side. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

/** The web asked the Flutter wrapper to hide its own snackbar here. The app has no such snackbar: nothing to hide. */
function dismissNativeApiErrorBanner() {}

function isTechnicalErrorText(text) {
  if (!text || typeof text !== "string") return true;
  const t = text.trim();
  if (!t) return true;
  if (/upload\/api\s*failed/i.test(t)) return true;
  if (/xhr\s*network\s*error/i.test(t)) return true;
  if (/^api\s*failed/i.test(t)) return true;
  if (/^request failed with status code/i.test(t)) return true;
  if (/bad\s*gateway/i.test(t)) return true;
  if (/gateway\s*timeout/i.test(t)) return true;
  if (/service\s*unavailable/i.test(t)) return true;
  if (t.startsWith("{") && t.includes("}")) return true;
  if (/^\s*<!DOCTYPE/i.test(t) || /^\s*<html/i.test(t)) return true;
  if (/<\/?[a-z][\s\S]*>/i.test(t) && t.length > 80) return true;
  return false;
}

function extractStatusFromNativeText(text) {
  if (!text || typeof text !== "string") return null;
  const match =
    text.match(/Upload\/API\s*Failed\s*\((\d{3})\)/i) ||
    text.match(/\bstatus(?:\s*code)?[:\s]+(\d{3})\b/i) ||
    text.match(/\b(\d{3})\s*Bad Gateway\b/i);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

/**
 * @param {unknown} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function getUserFacingApiError(
  err,
  fallback = "Something went wrong. Please try again.",
) {
  const status = err?.response?.status ?? err?.status ?? null;
  const data = err?.response?.data;

  if (typeof console !== "undefined" && console.error) {
    console.error("[API Error]", {
      status,
      data,
      message: err?.message,
      url: err?.config?.url,
    });
  }

  if (status === 429) {
    const rateMsg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      null;
    return (
      rateMsg ||
      "Too many requests. Please wait a few minutes and try again."
    );
  }

  if (status && status >= 500) {
    return statusFallback(status);
  }

  if (
    !err?.response &&
    (err?.code === "ERR_NETWORK" ||
      /network error|xhr/i.test(String(err?.message || "")))
  ) {
    const fromJson = tryParseJsonMessage(err?.message);
    return (
      fromJson ||
      "Network issue. Please check your connection and try again."
    );
  }

  let msg =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    null;

  if (!msg && data?.message && typeof data.message === "object") {
    msg = data.message.message || null;
  }

  if (!msg && typeof data === "string") {
    const stripped = stripHtmlToText(data);
    const fromJson = tryParseJsonMessage(data) || tryParseJsonMessage(stripped);
    if (fromJson) msg = fromJson;
    else if (stripped && !isTechnicalErrorText(stripped) && stripped.length < 160) {
      msg = stripped;
    }
  }

  if (!msg && typeof err?.message === "string") {
    const fromJson = tryParseJsonMessage(err.message);
    if (fromJson) msg = fromJson;
    else if (!isTechnicalErrorText(err.message)) msg = err.message;
  }

  if (msg && isTechnicalErrorText(msg)) {
    const fromJson = tryParseJsonMessage(msg);
    msg = fromJson || null;
  }

  if (!msg || isTechnicalErrorText(msg)) {
    return status ? statusFallback(status) : fallback;
  }
  return msg.trim();
}

/**
 * Show a single clean error toast (replaces prior error toast).
 * Also best-effort dismisses Flutter Material snackbar when present.
 */
export function showUserFacingApiError(
  err,
  fallback = "Something went wrong. Please try again.",
) {
  const message = getUserFacingApiError(err, fallback);
  dismissNativeApiErrorBanner();
  toast.dismiss(USER_FACING_ERROR_TOAST_ID);
  toast.error(message, {
    id: USER_FACING_ERROR_TOAST_ID,
    duration: 4500,
  });
  return message;
}

/**
 * Handle raw native-shell error text (Flutter snackbar / bridge payload).
 */
export function showNativeShellApiError(
  raw,
  fallback = "Something went wrong. Please try again.",
) {
  const text =
    typeof raw === "string"
      ? raw
      : raw?.message || raw?.error || raw?.body || String(raw || "");

  if (typeof console !== "undefined" && console.error) {
    console.error("[Native API Error]", text);
  }

  const status = extractStatusFromNativeText(text);
  const fromJson = tryParseJsonMessage(text);
  const stripped = stripHtmlToText(text);

  let message = fromJson;
  if (!message && stripped && !isTechnicalErrorText(stripped) && stripped.length < 160) {
    message = stripped;
  }
  if (!message || isTechnicalErrorText(message) || isTechnicalErrorText(text)) {
    message = status ? statusFallback(status) : fallback;
  }

  dismissNativeApiErrorBanner();
  toast.dismiss(USER_FACING_ERROR_TOAST_ID);
  toast.error(message, {
    id: USER_FACING_ERROR_TOAST_ID,
    duration: 4500,
  });
  return message;
}

/**
 * The web turned the Flutter wrapper's raw error banners (DOM nodes it injected) into toasts. The app has no wrapper
 * and no DOM: only the event / global entry points remain, so anything that reports a raw native error still gets the
 * same clean toast. Safe to call once at app boot.
 */
export function installNativeApiErrorBridge() {
  if (typeof window === "undefined") return;
  if (window.__helloParthNativeApiErrorBridgeInstalled) return;
  window.__helloParthNativeApiErrorBridgeInstalled = true;

  const handlePayload = (payload) => {
    if (payload == null) return;
    showNativeShellApiError(payload);
  };

  window.helloParthOnNativeApiError = handlePayload;
  window.handleNativeApiError = handlePayload;
  window.showApiErrorToast = handlePayload;
  window.__helloParthHandleNativeApiError = handlePayload;

  window.addEventListener("helloparth:native-api-error", (event) => {
    handlePayload(event?.detail);
  });
}

export function isAlreadyExistsError(errOrMessage) {
  const text =
    typeof errOrMessage === "string"
      ? errOrMessage
      : getUserFacingApiError(errOrMessage, "");
  return /already exists/i.test(text || "");
}
