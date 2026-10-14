import React from 'react';
import { ShieldCheck, Zap, MapPin } from 'lucide-react';
import ridesStrip from '../../../assets/user-app/hero-rides-strip.webp';
import { preloadBannerImage } from '@/shared/utils/bannerImage';

/** Download the vehicle picture ahead of time (the Taxi start-up check calls this once it knows the default banner will be shown). */
export const preloadHeroArt = () => preloadBannerImage(ridesStrip);

// Where each vehicle sits in the artwork (left edge and width, in % of the picture) - the tap areas lie over it.
const VEHICLES = [
  { key: 'bike', label: 'Bike Ride', left: 15, width: 22 },
  { key: 'auto', label: 'Auto Ride', left: 38.5, width: 20 },
  { key: 'cab', label: 'Car Ride', left: 58, width: 25 },
];

const PERKS = [
  { Icon: ShieldCheck, text: 'Safe' },
  { Icon: Zap, text: 'Fast' },
  { Icon: MapPin, text: 'Affordable' },
];

// The artwork (hero-rides-strip.webp, 1170 x 292) - its proportions are fixed, so the box exists before the file arrives.
const STRIP_ASPECT = '1170 / 292';

/** Skyline silhouettes drawn in code so they stay sharp at any width. */
const Skyline = () => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute inset-x-0 bottom-[40%] h-[42%] w-full"
    viewBox="0 0 400 120"
    preserveAspectRatio="none"
  >
    <g fill="#04297a" opacity="0.55">
      <rect x="0" y="52" width="26" height="68" />
      <rect x="22" y="30" width="20" height="90" />
      <rect x="46" y="62" width="24" height="58" />
      <rect x="72" y="44" width="16" height="76" />
      <rect x="312" y="48" width="22" height="72" />
      <rect x="338" y="22" width="24" height="98" />
      <rect x="364" y="58" width="18" height="62" />
      <rect x="380" y="40" width="20" height="80" />
    </g>
    <g fill="#032a85" opacity="0.4">
      <rect x="88" y="70" width="18" height="50" />
      <rect x="290" y="66" width="20" height="54" />
    </g>
  </svg>
);

const FADE_TOP = 'linear-gradient(to bottom, transparent 0%, #000 7%, #000 100%)';

/**
 * The default Taxi home banner, shown while no image is uploaded in Global admin > User Management > Home Banners:
 * "Safe Rides, Every Time" with the three ride types underneath. Tapping a vehicle starts a booking for it.
 * Everything sits in its place from the first paint (no sliding in from below). The parent gives it its position and
 * size (className). fillHeight: the vehicles take whatever height is left under the text; without it (wide desktop
 * column) the picture takes the full width and the banner is as tall as it needs.
 */
const TaxiHeroBanner = ({ onPick, className = '', fillHeight = true }) => (
  <section
    aria-label="Safe rides, every time"
    className={`isolate flex flex-col overflow-hidden !text-white ${className}`}
    style={{
      // The very top is exactly the app bar's colour (#0B172A), so the bar and the banner read as ONE block with no
      // seam; the glow starts below the top edge (it is 0 there) and the lower part matches the artwork strip so its
      // edges disappear.
      background:
        'radial-gradient(120% 60% at 50% 46%, rgba(0,74,214,0.5) 0%, rgba(0,74,214,0) 70%), linear-gradient(180deg, #0B172A 0%, #0a2a70 22%, #00348f 52%, #002f84 78%, #002a77 100%)',
    }}
  >
    <Skyline />

    <div className="relative z-10 flex shrink-0 flex-col items-center px-4 pt-3 text-center">
      <div className="flex w-full items-center justify-center gap-2.5">
        <span className="h-px w-6 bg-gradient-to-r from-transparent to-blue-400/80" />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-blue-200/90">Get to your destination</span>
        <span className="h-px w-6 bg-gradient-to-l from-transparent to-blue-400/80" />
      </div>

      <h2 className="mt-1 text-[36px] font-black leading-[1.02] tracking-tight drop-shadow-[0_3px_12px_rgba(0,20,70,0.55)]">
        <span className="block !text-white">Safe Rides,</span>
        <span className="block !text-[#ffc929]">Every Time</span>
      </h2>

      <div className="mt-2 flex items-center justify-center text-[12.5px] font-semibold !text-white">
        {PERKS.map(({ Icon, text }, index) => (
          <React.Fragment key={text}>
            {index > 0 && <span className="mx-2.5 h-3.5 w-px bg-white/35" />}
            <span className="inline-flex items-center gap-1">
              <Icon size={15} strokeWidth={2.4} className={index === 1 ? 'fill-white/90' : ''} />
              {text}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>

    {/* The picture keeps its proportions and is centred in the space that is left; the tap areas sit in the same
        box, so they stay on the vehicles at any size. */}
    <div
      className={`relative z-10 mt-1 min-h-0 w-full select-none ${fillHeight ? 'flex-1' : ''}`}
      style={fillHeight ? undefined : { aspectRatio: STRIP_ASPECT }}
    >
      <div
        className={fillHeight ? 'absolute bottom-0 left-1/2 h-full max-w-none -translate-x-1/2' : 'absolute inset-0'}
        style={fillHeight ? { aspectRatio: STRIP_ASPECT } : undefined}
      >
        <img
          src={ridesStrip}
          alt=""
          draggable={false}
          width={1170}
          height={292}
          decoding="async"
          className="h-full w-full"
          style={{ WebkitMaskImage: FADE_TOP, maskImage: FADE_TOP }}
        />
        {VEHICLES.map((vehicle) => (
          <button
            key={vehicle.key}
            type="button"
            aria-label={vehicle.label}
            onClick={() => onPick?.(vehicle.key)}
            className="absolute top-[4%] h-[94%] rounded-2xl transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{ left: `${vehicle.left}%`, width: `${vehicle.width}%`, WebkitTapHighlightColor: 'transparent' }}
          />
        ))}
      </div>
    </div>
  </section>
);

export default TaxiHeroBanner;
