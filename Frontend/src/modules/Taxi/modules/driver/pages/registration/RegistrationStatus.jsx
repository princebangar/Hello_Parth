import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Clock3,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  Mail,
} from "lucide-react";
import { motion } from "framer-motion";
import { DEFAULT_BRAND_LOGO } from "@/shared/constants/brandLogo";
import { useSettings } from "../../../../shared/context/SettingsContext";
import {
  clearDriverRegistrationSession,
  getDriverApprovalStatus,
  getDriverDocumentTemplates,
  clearDriverAuthState,
  getLocalDriverToken,
  getStoredDriverRole,
  persistDriverAuthSession,
} from "../../services/registrationService";

const unwrapDriver = (response) =>
  response?.data?.data || response?.data || response;

const normalizePortalRole = (role) => {
  const normalized = String(role || "driver").toLowerCase();
  if (normalized === "owner") return "owner";
  if (
    normalized === "bus_driver" ||
    normalized === "bus-driver" ||
    normalized === "busdriver"
  ) {
    return "bus_driver";
  }
  return "driver";
};

const getRoleCopy = (role) => {
  const normalized = normalizePortalRole(role);
  if (normalized === "owner") {
    return {
      label: "Owner",
      accountLabel: "owner account",
      pendingTitleLine1: "Your owner account is",
      pendingTitleLine2: "under review",
      pendingBody:
        "Admin received your onboarding details successfully. Our team will verify your owner account and activate your dashboard once approval is complete.",
      loginPath: "/taxi/owner/login",
      homePath: "/taxi/owner/home",
      displayFallback: "Owner",
    };
  }
  if (normalized === "bus_driver") {
    return {
      label: "Bus Driver",
      accountLabel: "bus driver account",
      pendingTitleLine1: "Your bus driver account is",
      pendingTitleLine2: "under review",
      pendingBody:
        "Admin received your onboarding details successfully. Our team will verify your bus driver account and activate your dashboard once approval is complete.",
      loginPath: "/taxi/driver/login",
      homePath: "/taxi/driver/bus-home",
      displayFallback: "Bus Driver",
    };
  }
  return {
    label: "Driver",
    accountLabel: "driver account",
    pendingTitleLine1: "Your driver account is",
    pendingTitleLine2: "under review",
    pendingBody:
      "Admin received your onboarding details successfully. Our team will verify your driver account and activate your dashboard once approval is complete.",
    loginPath: "/taxi/driver/login",
    homePath: "/taxi/driver/home",
    displayFallback: "Driver",
  };
};

const isAccountApproved = (account) => {
  if (!account) {
    return false;
  }

  const approval = String(account.approve ?? "").toLowerCase();
  const status = String(account.status || "").toLowerCase();

  return (
    account.approve === true ||
    account.approve === 1 ||
    ["true", "1", "yes", "approved"].includes(approval) ||
    ["approved", "active", "verified"].includes(status)
  );
};

const isAccountRejected = (account) => {
  const status = String(account?.status || "").toLowerCase();
  return ["rejected", "declined", "failed", "blocked"].includes(status);
};

const RegistrationStatus = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const [checking, setChecking] = useState(true);
  const [account, setAccount] = useState(null);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const mountedRef = useRef(false);
  const requestInFlightRef = useRef(false);

  const appName = settings.general?.app_name || "App";
  const appLogo = DEFAULT_BRAND_LOGO;
  const routePrefix = location.pathname.startsWith("/taxi/owner")
    ? "/taxi/owner"
    : "/taxi/driver";

  const role = useMemo(() => {
    const fromState = location.state?.role;
    const fromStored = getStoredDriverRole();
    const fromPath = location.pathname.startsWith("/taxi/owner") ? "owner" : "";
    return normalizePortalRole(fromState || fromStored || fromPath || "driver");
  }, [location.pathname, location.state?.role]);

  const roleCopy = useMemo(() => getRoleCopy(role), [role]);
  // Only for post-approval vehicle edits — not first-time signup (approve/status pending).
  const isVehicleReapproval =
    location.state?.statusReason === "vehicle-update" ||
    account?.vehicleApprovalRequested === true ||
    (typeof window !== "undefined" &&
      localStorage.getItem("driver_vehicle_reapproval_pending") === "true");

  const redirectToLogin = () => {
    clearDriverAuthState();
    clearDriverRegistrationSession();
    navigate(roleCopy.loginPath, { replace: true });
  };

  useEffect(() => {
    mountedRef.current = true;

    if (location.state?.role) {
      persistDriverAuthSession({ role: normalizePortalRole(location.state.role) });
    }

    const onboardingToken =
      location.state?.completedRegistration?.token ||
      location.state?.token ||
      "";

    if (onboardingToken) {
      persistDriverAuthSession({
        token: onboardingToken,
        role,
      });
    }

    const fetchTemplates = async () => {
      try {
        const response = await getDriverDocumentTemplates(role);
        const templates =
          response?.data?.data?.results ||
          response?.data?.results ||
          [];
        if (mountedRef.current) {
          setDocumentTemplates(templates);
        }
      } catch {
        // Templates are optional on pending screen.
      }
    };

    const checkApproval = async () => {
      if (!mountedRef.current || requestInFlightRef.current) {
        return;
      }

      requestInFlightRef.current = true;
      const token = getLocalDriverToken();

      if (!token) {
        if (mountedRef.current) {
          setChecking(false);
        }
        redirectToLogin();
        requestInFlightRef.current = false;
        return;
      }

      try {
        const response = await getDriverApprovalStatus();
        const accountData = unwrapDriver(response);
        if (!mountedRef.current) {
          return;
        }

        setAccount(accountData);

        if (isAccountApproved(accountData)) {
          clearDriverRegistrationSession();
          try {
            localStorage.removeItem("driver_vehicle_reapproval_pending");
          } catch {
            // ignore
          }
          navigate(roleCopy.homePath, { replace: true });
          return;
        }
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        if (error?.status === 401 || error?.status === 404) {
          redirectToLogin();
          return;
        }
      } finally {
        requestInFlightRef.current = false;
        if (mountedRef.current) {
          setChecking(false);
        }
      }
    };

    fetchTemplates();
    checkApproval();

    // Restaurant/delivery style: check again only when user returns to the tab.
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkApproval();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      mountedRef.current = false;
      requestInFlightRef.current = false;
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [location.state, navigate, role, roleCopy.homePath, roleCopy.loginPath]);

  const getStatusColor = (status) => {
    const s = String(status || "").toLowerCase();
    if (["approved", "active", "verified", "true", "1"].includes(s)) {
      return "text-emerald-500 bg-emerald-50";
    }
    if (["rejected", "declined", "failed", "blocked"].includes(s)) {
      return "text-rose-500 bg-rose-50";
    }
    return "text-amber-500 bg-amber-50";
  };

  const getDocumentStatus = (doc = {}) =>
    String(
      doc?.status ||
        doc?.verificationStatus ||
        doc?.approvalStatus ||
        doc?.reviewStatus ||
        "pending",
    ).toLowerCase();

  const getDocumentReason = (doc = {}) =>
    String(
      doc?.comment ||
        doc?.remarks ||
        doc?.reason ||
        doc?.admin_comment ||
        doc?.rejection_reason ||
        "",
    ).trim();

  const getDocumentImage = (doc = {}) =>
    String(doc?.previewUrl || doc?.secureUrl || doc?.url || "").trim();

  const getDocumentReviewTimestamp = (doc = {}) => {
    const reviewTime = new Date(
      doc?.reverificationRequestedAt ||
        doc?.uploadedAt ||
        doc?.updatedAt ||
        0,
    ).getTime();
    const reviewedTime = new Date(doc?.reviewedAt || 0).getTime();

    if (!Number.isFinite(reviewTime) || reviewTime <= 0) {
      return false;
    }

    return (
      Number.isFinite(reviewedTime) &&
      reviewedTime > 0 &&
      reviewTime >= reviewedTime
    );
  };

  const docDetails = useMemo(() => {
    if (!account || !documentTemplates.length) return [];

    const docs = account.documents || {};
    const flatFields = documentTemplates.flatMap((t) => t.fields || []);

    return flatFields.map((field) => {
      const doc = docs[field.key];
      const status = getDocumentStatus(doc);
      return {
        label: field.label || field.name || field.key,
        status,
        reason: getDocumentReason(doc),
        key: field.key,
        previewUrl: getDocumentImage(doc),
        reverificationPending:
          status === "pending" && getDocumentReviewTimestamp(doc),
      };
    });
  }, [account, documentTemplates]);

  const rejectedDocs = docDetails.filter(
    (d) => d.status === "rejected" || d.status === "declined",
  );
  const pendingReverificationDocs = docDetails.filter(
    (doc) => doc.reverificationPending,
  );
  const rejected = isAccountRejected(account) || rejectedDocs.length > 0;
  const pendingPhone =
    account?.phone ||
    String(location.state?.phone || "").replace(/\D/g, "").slice(-10);

  return (
    <div
      className="min-h-[100dvh] overflow-y-auto overscroll-contain px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10 bg-gradient-to-br from-slate-50 via-amber-50/30 to-zinc-100 select-none"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-md min-h-[calc(100dvh-2rem)] flex-col justify-center py-2 sm:py-0">
        <div className="mb-5 flex justify-center">
          <img
            src={appLogo}
            alt={appName}
            className="h-10 object-contain drop-shadow-sm"
          />
        </div>

        <div className="w-full rounded-[20px] sm:rounded-[28px] border border-slate-200 bg-white p-5 sm:p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="mb-4 sm:mb-6 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Clock3 className="h-8 w-8" />
            </div>
          </div>

          <div className="mb-4 sm:mb-6 text-center">
            {rejected ? (
              <>
                <h1 className="text-xl font-extrabold text-slate-950">
                  Action Required
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Some of your {roleCopy.accountLabel} documents need attention.
                  Please fix them to continue.
                </p>
              </>
            ) : pendingReverificationDocs.length > 0 ? (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.32em] text-amber-600">
                  Re-verification Pending
                </p>
                <h1 className="mx-auto max-w-[19rem] text-center text-[15px] font-extrabold leading-5 text-slate-950 sm:text-xl sm:leading-tight">
                  Updated documents are under review
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Your updated documents were sent back to admin for another
                  review.
                </p>
              </>
            ) : isVehicleReapproval ? (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.32em] text-amber-600">
                  Update In Review
                </p>
                <h1 className="mx-auto max-w-[19rem] text-center text-[15px] font-extrabold leading-5 text-slate-950 sm:text-xl sm:leading-tight">
                  Vehicle update pending admin approval
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Your vehicle changes were submitted. Please wait for admin
                  approval before continuing.
                </p>
              </>
            ) : (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.32em] text-amber-600">
                  Pending Admin Approval
                </p>
                <h1 className="mx-auto max-w-[19rem] text-center text-[15px] font-extrabold leading-5 text-slate-950 sm:text-xl sm:leading-tight">
                  <span className="block">{roleCopy.pendingTitleLine1}</span>
                  <span className="block">{roleCopy.pendingTitleLine2}</span>
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {roleCopy.pendingBody}
                </p>
              </>
            )}

            {checking ? (
              <p className="mt-3 min-h-[1rem] text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Checking latest approval status...
              </p>
            ) : (
              <div className="mt-3 min-h-[1rem]" aria-hidden="true" />
            )}
          </div>

          {account ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
                  <Mail size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-extrabold text-slate-900">
                    {account.name || roleCopy.displayFallback}
                  </h4>
                  <p className="truncate text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {roleCopy.label}
                    {pendingPhone ? ` · +91 ${pendingPhone}` : ""}
                  </p>
                </div>
                <div className="rounded-full bg-amber-100 px-3 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-amber-700">
                  {account.status || "Pending"}
                </div>
              </div>
            </motion.div>
          ) : null}

          <div className="mb-4 sm:mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4">
            <div className="flex items-start gap-3">
              {rejected ? (
                <>
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
                  <div className="text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">What to do next</p>
                    <p className="mt-1">
                      Fix rejected documents below, or contact support if you need
                      help with your {roleCopy.accountLabel}.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
                  <div className="text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">What happens next</p>
                    <p className="mt-1">
                      We will notify you once your {roleCopy.accountLabel} is
                      approved by admin. You can close this page and come back
                      later.
                    </p>
                    {pendingPhone ? (
                      <p className="mt-2 text-slate-500">
                        Registered phone:{" "}
                        <span className="font-medium text-slate-700">
                          +91 {pendingPhone}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>

          {docDetails.length > 0 ? (
            <section className="mb-4 space-y-3">
              <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                Document checklist
              </h3>
              <div className="space-y-3">
                {docDetails.map((doc) => (
                  <div
                    key={doc.key}
                    className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-extrabold text-slate-800">
                        {doc.label}
                      </span>
                      <span
                        className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${getStatusColor(doc.status)}`}
                      >
                        {doc.status}
                      </span>
                    </div>
                    {doc.reason ? (
                      <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                        <p className="text-[12px] font-bold leading-relaxed text-rose-600">
                          <span className="mb-1 block text-[10px] uppercase tracking-widest opacity-60">
                            Reason
                          </span>
                          {doc.reason}
                        </p>
                      </div>
                    ) : null}
                    {(doc.status === "rejected" || doc.status === "declined") && (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`${routePrefix}/documents`, {
                            state: {
                              focusDocumentKey: doc.key,
                              fromRegistrationStatus: true,
                              role,
                            },
                          })
                        }
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[12px] font-black uppercase tracking-widest text-white active:scale-95"
                      >
                        Fix Document <ChevronRight size={14} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() =>
                navigate(`${routePrefix}/support/chat`, {
                  state: {
                    backPath: `${routePrefix}/registration-status`,
                    backState: location.state || null,
                  },
                })
              }
              className="h-12 w-full rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-700 active:scale-[0.98]"
            >
              Contact Support
            </button>
            <button
              type="button"
              onClick={redirectToLogin}
              className="h-12 w-full rounded-xl bg-slate-950 text-base font-semibold text-white active:scale-[0.98]"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrationStatus;
