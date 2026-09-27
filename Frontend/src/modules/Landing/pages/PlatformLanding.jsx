import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowRight,
  Bike,
  Bus,
  Car,
  ExternalLink,
  Menu,
  Package,
  ShieldCheck,
  Users as UsersIcon,
  UtensilsCrossed,
  Wallet,
  X,
  Zap,
} from "lucide-react"
import { publicLandingAPI } from "@/modules/Global/api/globalAdminAPI"
import { DEFAULT_BRAND_LOGO } from "@/shared/constants/brandLogo"

/**
 * Public marketing site at `/`. Shown only to guests — a logged-in visitor is sent straight into the app
 * (see RootGate in app/routes.jsx). Food and Taxi sections link into the real apps; "Other Services" is a
 * dynamic, admin-managed list of outside links (Global admin → Landing Page).
 */

const FOOD_POINTS = [
  { Icon: UtensilsCrossed, text: "Thousands of restaurants, one tap away" },
  { Icon: Zap, text: "Live order tracking, fast delivery" },
  { Icon: Wallet, text: "Wallet, offers and easy checkout" },
]

const TAXI_POINTS = [
  { Icon: Car, text: "Bike, auto, sedan and SUV rides" },
  { Icon: Package, text: "Same-city parcel delivery" },
  { Icon: Bus, text: "Bus tickets and shared pooling rides" },
]

const FLEET_BADGES = [
  { Icon: Car, label: "Cabs", tint: "rgba(245,158,11,0.14)", color: "#d97706" },
  { Icon: Bus, label: "Bus", tint: "rgba(14,165,233,0.14)", color: "#0284c7" },
  { Icon: UsersIcon, label: "Pooling", tint: "rgba(139,92,246,0.14)", color: "#7c3aed" },
  { Icon: Bike, label: "Parcel", tint: "rgba(16,185,129,0.14)", color: "#059669" },
]

const BASE_NAV_LINKS = [
  { href: "#food", label: "Food" },
  { href: "#taxi", label: "Taxi" },
]

const scrollToId = (id) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

const Logo = ({ className = "h-9" }) => (
  <img src={DEFAULT_BRAND_LOGO} alt="Hello Parth" className={`${className} w-auto object-contain`} />
)

function Navbar({ showOtherServices }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const navLinks = showOtherServices
    ? [...BASE_NAV_LINKS, { href: "#other-services", label: "Other Services" }]
    : BASE_NAV_LINKS

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-colors duration-200 ${
        scrolled ? "bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="shrink-0">
          <Logo className="h-8 sm:h-9" />
        </button>

        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => scrollToId(link.href.slice(1))}
              className="text-sm font-semibold text-[#334155] hover:text-[#0b1220] transition-colors"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="rounded-xl border-2 border-[#0b1220] px-4 py-2 text-sm font-semibold text-[#0b1220] hover:bg-[#0b1220] hover:text-white transition-colors"
          >
            Log in
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="md:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-[#0b1220]"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-slate-200 bg-white px-5 py-4 space-y-1">
          {navLinks.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => {
                setOpen(false)
                scrollToId(link.href.slice(1))
              }}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#334155] hover:bg-slate-50"
            >
              {link.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mt-2 block w-full rounded-xl bg-[#0b1220] px-3 py-3 text-center text-sm font-semibold text-white"
          >
            Log in
          </button>
        </div>
      )}
    </header>
  )
}

function Hero() {
  const navigate = useNavigate()

  return (
    <section className="relative overflow-hidden bg-[#f6f7fb]">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(closest-side, #ffc400, transparent)" }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-16 text-center sm:px-8 sm:pb-24 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#fde68a] bg-[#fffbeb] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#b45309]">
          <ShieldCheck size={14} />
          One account, two apps
        </span>

        <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-[#0b1220] sm:text-5xl lg:text-6xl">
          Food delivered.
          <br />
          Rides booked.
          <br />
          <span className="text-[#d97706]">All in one place.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#475569] sm:text-lg">
          Hello Parth brings restaurants, cabs, parcels, bus tickets and pooling rides together — sign in once,
          switch between Food and Taxi whenever you like.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate("/food/user")}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#0b1220] px-7 text-base font-semibold text-white shadow-[0_14px_28px_-14px_rgba(11,18,32,0.7)] transition-transform active:scale-[0.99] sm:w-auto"
          >
            <UtensilsCrossed size={20} />
            Order Food
          </button>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#0b1220] px-7 text-base font-semibold text-[#0b1220] transition-colors hover:bg-[#0b1220] hover:text-white sm:w-auto"
          >
            <Car size={20} />
            Book a Ride
          </button>
        </div>

        <div className="mx-auto mt-12 grid max-w-lg grid-cols-4 gap-3">
          {FLEET_BADGES.map(({ Icon, label, tint, color }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm"
                style={{ backgroundColor: tint, color }}
              >
                <Icon size={22} strokeWidth={2.2} />
              </span>
              <span className="text-xs font-semibold text-[#475569]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ServiceSection({ id, eyebrow, title, description, points, image, imageAlt, cta, onCta, reverse, accent }) {
  return (
    <section id={id} className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className={`grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
          <div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>
              {eyebrow}
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#0b1220] sm:text-4xl">{title}</h2>
            <p className="mt-4 text-base leading-7 text-[#475569]">{description}</p>

            <ul className="mt-6 space-y-3">
              {points.map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${accent}1f`, color: accent }}
                  >
                    <Icon size={17} strokeWidth={2.2} />
                  </span>
                  <span className="text-sm font-medium text-[#334155]">{text}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={onCta}
              className="mt-8 inline-flex h-13 items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-[0.99]"
              style={{ backgroundColor: accent, boxShadow: `0 14px 28px -14px ${accent}` }}
            >
              {cta}
              <ArrowRight size={17} />
            </button>
          </div>

          <div className="relative">
            <div
              className="absolute -inset-4 rounded-[2rem] opacity-70 blur-2xl"
              style={{ background: `radial-gradient(closest-side, ${accent}33, transparent)` }}
              aria-hidden="true"
            />
            <img
              src={image}
              alt={imageAlt}
              loading="lazy"
              className="relative w-full rounded-[1.75rem] object-cover shadow-2xl"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function OtherServices({ services }) {
  return (
    <section id="other-services" className="bg-[#f6f7fb] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-[#7c3aed]">More from us</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#0b1220] sm:text-4xl">Other Services</h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#475569]">
            A few more places worth a visit.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <a
              key={service.id}
              href={service.url}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fffbeb] text-lg font-bold uppercase text-[#b45309]">
                  {service.name.charAt(0) || "?"}
                </span>
                <ExternalLink size={16} className="mt-1 shrink-0 text-slate-300 transition-colors group-hover:text-[#0b1220]" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#0b1220]">{service.name}</h3>
              {service.description && (
                <p className="mt-1.5 text-sm leading-6 text-[#64748b] line-clamp-3">{service.description}</p>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const navigate = useNavigate()
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-slate-200 bg-white py-10">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Logo className="h-8" />
            <p className="text-sm text-[#64748b]">Food and taxi, one app.</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-[#475569]">
            <button type="button" onClick={() => navigate("/taxi/about")} className="hover:text-[#0b1220]">About</button>
            <button type="button" onClick={() => navigate("/taxi/contact")} className="hover:text-[#0b1220]">Contact</button>
            <button type="button" onClick={() => navigate("/taxi/terms")} className="hover:text-[#0b1220]">Terms</button>
            <button type="button" onClick={() => navigate("/taxi/privacy")} className="hover:text-[#0b1220]">Privacy</button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-[#94a3b8] sm:text-left">
          © {year} Hello Parth. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

export default function PlatformLanding() {
  const navigate = useNavigate()
  const [otherServices, setOtherServices] = useState([])

  useEffect(() => {
    let cancelled = false
    publicLandingAPI
      .getOtherServices()
      .then((response) => {
        if (!cancelled) setOtherServices(response?.data?.data?.services || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-dvh w-full bg-white text-[#0b1220]">
      <Navbar showOtherServices={otherServices.length > 0} />
      <Hero />
      <ServiceSection
        id="food"
        eyebrow="Food"
        title="Everything you're craving, delivered fast"
        description="Order from your favourite local restaurants and get it delivered hot, with live tracking every step of the way."
        points={FOOD_POINTS}
        image="/bg_food.png"
        imageAlt="Food delivery"
        cta="Explore Food"
        onCta={() => navigate("/food/user")}
        accent="#ea580c"
      />
      <ServiceSection
        id="taxi"
        eyebrow="Taxi"
        title="Rides, parcels, bus and pooling — one tap away"
        description="Book a cab across town, send a parcel, reserve a bus seat or share a pooling ride, all from the same app."
        points={TAXI_POINTS}
        image="/bg_ride.png"
        imageAlt="Taxi and rides"
        cta="Continue to Taxi"
        onCta={() => navigate("/login")}
        accent="#0284c7"
        reverse
      />
      {otherServices.length > 0 && <OtherServices services={otherServices} />}
      <Footer />
    </div>
  )
}
