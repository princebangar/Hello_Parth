import React from "react";
import { Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { markBrandToastShown } from "./toastGuard";

const WORDMARK_SIZES = {
  sm: "h-10 w-10 text-[11px]",
  md: "h-12 w-12 text-[13px]",
  lg: "h-14 w-14 text-[15px]",
};

/** "Hello / Parth" wordmark (the login screen's Pacifico lettering, one word under the other) on the brand red, as the
 *  leading icon of branded toasts. */
export const BrandToastIcon = ({ size = "lg" }) => (
  <div
    className={`brand-toast-icon ${WORDMARK_SIZES[size] || WORDMARK_SIZES.lg} flex-shrink-0 rounded-2xl bg-gradient-to-br from-[#DC2626] to-[#991B1B] shadow-lg flex flex-col items-center justify-center text-white`}
    style={{ fontFamily: "'Pacifico', cursive", lineHeight: 0.95, textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
    aria-label="Hello Parth"
  >
    <span>Hello</span>
    <span>Parth</span>
  </div>
);

const NOTIF_TOAST_ID = "app-notification-toast";

export const showNotificationToast = ({ title, message } = {}) => {
  markBrandToastShown(6000);
  toast.dismiss(NOTIF_TOAST_ID);
  toast.custom(() => (
    <div className="w-[calc(100vw-32px)] sm:w-[380px] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-3xl pointer-events-auto flex items-center gap-4 p-3.5 border border-gray-50 animate-in fade-in slide-in-from-top-4">
      <BrandToastIcon size="md" />
      <div className="flex-1 pr-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{title || "Notification"}</p>
        {message && (
          <p className="text-[12px] font-medium text-gray-500 mt-0.5 line-clamp-2 leading-snug">{message}</p>
        )}
      </div>
    </div>
  ), {
    id: NOTIF_TOAST_ID,
    duration: 6000,
    position: 'top-center',
  });
};

export const showHelloParthBrandedToast = ({ title, message, id = "helloparth-branded-toast", duration = 4000 } = {}) => {
  markBrandToastShown(duration);
  toast.custom(
    () => (
      <div className="w-[calc(100vw-32px)] sm:w-[380px] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-3xl pointer-events-auto flex items-center gap-4 p-3.5 border border-gray-50 animate-in fade-in slide-in-from-top-4 z-[11000]">
        <BrandToastIcon />
        <div className="flex-1 pr-2 min-w-0">
          <p className="text-[14px] font-bold text-gray-800 leading-tight">{title}</p>
          {message ? (
            <p className="text-[13px] font-medium text-gray-500 mt-1">{message}</p>
          ) : null}
        </div>
      </div>
    ),
    {
      id,
      duration,
      position: "top-center",
    }
  );
};

export const showAddressRemovedToast = () => {
  showHelloParthBrandedToast({
    title: "Address Removed Successfully",
    id: "address-removed-toast",
  });
};

export const showAccountDeletedToast = () => {
  toast.custom(() => (
    <div className="flex items-center gap-3 bg-[#f0fdf4] border border-[#bbf7d0] px-4 py-3 rounded-xl shadow-lg min-w-[300px] animate-in fade-in slide-in-from-top-4">
      <div className="relative">
        <Trash2 className="w-6 h-6 text-[#ef4444]" />
        <div className="absolute -top-1 -right-1 bg-white rounded-full">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] fill-[#22c55e] stroke-white" />
        </div>
      </div>
      <p className="text-[#15803d] font-bold text-sm">Account Deleted successfully</p>
    </div>
  ), {
    duration: 4000,
  });
};
