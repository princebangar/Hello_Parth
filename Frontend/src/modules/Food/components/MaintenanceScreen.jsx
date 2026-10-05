import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
// One copy of the artwork, in public/maintenance/: index.html paints the same screen on a refresh, before any JS runs.
const DIR = "/maintenance";
const maintenanceArt = `${DIR}/maintenance-art.png`;
const maintenancePattern = `${DIR}/maintenance-pattern.jpg`;
const ICONS = {
  cloche: `${DIR}/maintenance-icon-experience.png`,
  "food-taxi": `${DIR}/maintenance-icon-food-taxi.png`,
  rocket: `${DIR}/maintenance-icon-rocket.png`,
  gift: `${DIR}/maintenance-icon-gift.png`,
};

/**
 * Full-screen Under Maintenance UI, shared by the Food screen (Food admin switch) and the all-apps screen (Global
 * admin switch). Same design for both; only the three points differ — they come in through `content`.
 * Title / subtitle are part of the board artwork; the points and footer are real text so they can be edited.
 */
export default function MaintenanceScreen({ content, onBack, backLabel = "Back" }) {
  useEffect(() => {
    const prev = document.title;
    document.title = "We're Under Maintenance!";
    // The same screen was already painted by index.html on a refresh; now that this one is up, take that layer away.
    const frame = requestAnimationFrame(() => {
      const root = document.documentElement;
      if (root.getAttribute("data-boot") === "maint") {
        root.removeAttribute("data-boot");
        root.removeAttribute("data-maint");
        root.removeAttribute("data-maint-back");
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      document.title = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[2000000] overflow-y-auto bg-[#FDF6ED]"
      style={{ backgroundImage: `url(${maintenancePattern})`, backgroundSize: "100% auto", backgroundRepeat: "repeat-y" }}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="fixed left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow-md ring-1 ring-black/5 active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : null}

      <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col justify-center px-5 pb-8 pt-10">
        <img src={maintenanceArt} alt="We're Under Maintenance" className="mx-auto w-full select-none" draggable={false} />

        <ul className="mt-6 px-1">
          {content.features.map((feature, index) => (
            <li
              key={feature.id}
              className={`flex items-center gap-5 py-4 ${index < content.features.length - 1 ? "border-b-2 border-dashed border-[#F3C9A0]" : ""}`}
            >
              <img src={ICONS[feature.icon]} alt="" className="h-[84px] w-[84px] shrink-0 select-none" draggable={false} />
              <div className="min-w-0">
                <h2 className="text-[22px] font-bold leading-tight tracking-tight text-[#3A2312]">{feature.title}</h2>
                <p className="mt-1 text-[16px] font-medium leading-snug text-[#3A2312]/85">{feature.body}</p>
              </div>
            </li>
          ))}
        </ul>

        {content.footer ? <p className="mt-3 text-center text-[14px] font-semibold text-[#C2570C]">{content.footer}</p> : null}
      </div>
    </div>
  );
}
