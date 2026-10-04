import { useEffect } from "react";
import { toast } from "sonner";
import { NO_INTERNET_MESSAGE } from "../shared/utils/networkError.js";

// App-wide: tell the user when the device loses / regains internet (one notice that stays until it is back).
export default function ConnectionStatus() {
  useEffect(() => {
    const ID = "connection-status";
    const offline = () => toast.error(NO_INTERNET_MESSAGE, { id: ID, duration: Infinity });
    const online = () => { toast.dismiss(ID); toast.success("Back online", { id: ID + "-back", duration: 2500 }); };
    if (typeof navigator !== "undefined" && navigator.onLine === false) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);
  return null;
}
