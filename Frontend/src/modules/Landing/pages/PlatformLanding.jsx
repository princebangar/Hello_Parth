import { Fragment, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowRight,
  BadgeCheck,
  Car,
  ChevronRight,
  CreditCard,
  Headphones,
  MapPin,
  MapPinned,
  Menu,
  Smartphone,
  Star,
  Tag,
  UserRound,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { FaApple } from "react-icons/fa"
import { publicLandingAPI } from "@/modules/Global/api/globalAdminAPI"
import { DEFAULT_BRAND_LOGO } from "@/shared/constants/brandLogo"
import heroTaxiCar from "@/modules/Taxi/assets/ride-removebg-preview.png"
import ctaRoadBg from "@/modules/Taxi/assets/images/premium-taxi-bg.png"

const HERO_FOOD_IMAGE = "/food/veg_biryani_aromatic.png"

/**
 * Public marketing site at `/`. Shown only to guests — a logged-in visitor is sent straight into the app
 * (see RootGate in app/routes.jsx). Food and Taxi sections link into the real apps; "Other Services" is a
 * dynamic, admin-managed list of outside links (Global admin → Landing Page).
 */

const NAV_LINKS = [
  { href: "#top", label: "Home" },
  { href: "#why-us", label: "Features" },
  { href: "#services", label: "About" },
  { href: "#download", label: "Download" },
]

const WHY_CHOOSE = [
  { Icon: UtensilsCrossed, title: "Wide Restaurant Choice", desc: "From local favourites to popular brands, all in one place." },
  { Icon: Car, title: "Fast & Reliable Rides", desc: "Quick booking, live tracking and safer journeys." },
  { Icon: CreditCard, title: "Secure Payments", desc: "UPI, cards and wallet — pick what suits you." },
  { Icon: MapPinned, title: "Real-time Tracking", desc: "Track your food or ride from the moment it's confirmed." },
  { Icon: Tag, title: "Best Offers & Discounts", desc: "Save more with wallet credits and running deals." },
  { Icon: Headphones, title: "24/7 Support", desc: "We're here whenever you need a hand." },
]

const HOW_IT_WORKS = [
  { Icon: Smartphone, step: "1", title: "Open the App", desc: "Download Hello Parth and create your account." },
  { Icon: UtensilsCrossed, step: "2", title: "Choose Service", desc: "Pick Food or Taxi as per your need." },
  { Icon: MapPin, step: "3", title: "Make a Booking", desc: "Select location, place order or book a ride." },
  { Icon: BadgeCheck, step: "4", title: "Relax & Enjoy", desc: "Sit back and let us handle the rest." },
]

const APP_PREVIEW_ICONS = [
  { Icon: UtensilsCrossed, label: "Food" },
  { Icon: Car, label: "Taxi" },
  { Icon: Tag, label: "Offers" },
  { Icon: UserRound, label: "Profile" },
]

/** Data-driven so the numbers can be updated later without touching the markup. */
const IMPACT_STATS = [
  { id: "restaurants", Icon: UtensilsCrossed, value: "10K+", label: "Restaurants" },
  { id: "rides", Icon: Car, value: "50K+", label: "Rides Daily" },
  { id: "users", Icon: UserRound, value: "1M+", label: "Happy Users" },
  { id: "rating", Icon: Star, value: "4.8 ★", label: "Average Rating" },
]

const scrollToId = (id) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/** The official 4-colour Google Play triangle mark, drawn flat since react-icons only ships it monochrome. */
function GooglePlayIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <polygon points="92,70 340,200 340,256 92,256" fill="#01c3f4" />
      <polygon points="340,200 446,256 340,256" fill="#fe3944" />
      <polygon points="92,256 340,256 340,312 92,442" fill="#1ecb62" />
      <polygon points="340,256 340,312 446,256" fill="#ffce00" />
    </svg>
  )
}

function Logo({ light = false }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src={DEFAULT_BRAND_LOGO} alt="Hello Parth" className="h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12" />
      <span className={`text-xl font-extrabold tracking-tight sm:text-2xl ${light ? "text-white" : "text-[#0b1220]"}`}>
        Hello <span className="text-[#ea580c]">Parth</span>
      </span>
    </span>
  )
}

/** Reusable device frame used across the hero / services / app-preview sections. */
function PhoneFrame({ children, width = "w-56", className = "" }) {
  return (
    <div className={`relative ${width} shrink-0 ${className}`} aria-hidden="true">
      <div className="rounded-[2.5rem] border-[6px] border-[#0b1220] bg-[#0b1220] shadow-2xl">
        <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#0b1220]" />
        <div className="aspect-[9/18.5] overflow-hidden rounded-[2rem] bg-white">{children}</div>
      </div>
    </div>
  )
}

function HeroPhoneScreen() {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#fff7ed] to-white px-4 pb-5 pt-2">
      <div className="flex items-center justify-between px-1 text-[9px] font-bold text-[#0b1220]">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <div className="flex items-end gap-0.5">
            <span className="h-1 w-0.5 rounded-full bg-[#0b1220]" />
            <span className="h-1.5 w-0.5 rounded-full bg-[#0b1220]" />
            <span className="h-2 w-0.5 rounded-full bg-[#0b1220]" />
          </div>
          <div className="h-2.5 w-4 rounded-[2px] border border-[#0b1220]" />
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b1220] text-[#f97316] shadow-lg">
          <MapPinned size={22} strokeWidth={2.4} />
        </span>
        <p className="text-base font-extrabold text-[#0b1220]">
          Hello <span className="text-[#ea580c]">Parth</span>
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">Food • Taxi</p>
      </div>
      <div className="mt-auto space-y-2.5">
        <div className="flex items-center justify-center gap-2 rounded-xl bg-[#ea580c] py-2.5 text-xs font-bold text-white shadow-md">
          <UtensilsCrossed size={14} />
          Order Food
        </div>
        <div className="flex items-center justify-center gap-2 rounded-xl bg-[#fbbf24] py-2.5 text-xs font-bold text-[#0b1220] shadow-md">
          <Car size={14} />
          Book Taxi
        </div>
      </div>
    </div>
  )
}

function FoodAppScreen() {
  return (
    <div className="flex h-full flex-col gap-2.5 bg-white px-3 pb-4 pt-6">
      <p className="text-[11px] font-bold text-[#0b1220]">Good food, good mood</p>
      <div className="h-6 rounded-lg bg-[#f1f5f9]" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-14 rounded-lg bg-gradient-to-br from-[#fed7aa] to-[#fdba74]" />
        <div className="h-14 rounded-lg bg-gradient-to-br from-[#fecaca] to-[#fca5a5]" />
      </div>
      <div className="space-y-1.5">
        <div className="h-2 w-3/4 rounded-full bg-[#e2e8f0]" />
        <div className="h-2 w-1/2 rounded-full bg-[#e2e8f0]" />
      </div>
      <div className="mt-auto flex items-center justify-between rounded-xl bg-[#f8fafc] px-2 py-2">
        {[UtensilsCrossed, Tag, UserRound].map((Icon, index) => (
          <Icon key={index} size={14} className={index === 0 ? "text-[#ea580c]" : "text-[#94a3b8]"} />
        ))}
      </div>
    </div>
  )
}

function TaxiAppScreen() {
  return (
    <div className="relative flex h-full flex-col bg-[#eef2f7] px-3 pb-4 pt-6">
      <p className="text-[11px] font-bold text-[#0b1220]">Your ride is on the way</p>
      <svg viewBox="0 0 100 120" className="mt-2 h-24 w-full" aria-hidden="true">
        <path d="M10 100 C 30 70, 40 50, 70 40 S 90 15, 92 10" fill="none" stroke="#fbbf24" strokeWidth="3" strokeDasharray="1 8" strokeLinecap="round" />
        <circle cx="10" cy="100" r="4" fill="#0b1220" />
        <circle cx="92" cy="10" r="4" fill="#ea580c" />
      </svg>
      <div className="mt-auto rounded-xl bg-white px-2.5 py-2 shadow-sm">
        <p className="text-[10px] font-bold text-[#0b1220]">Arriving in 2 min</p>
        <p className="text-[9px] text-[#94a3b8]">Sedan • Live tracking</p>
      </div>
    </div>
  )
}

function Navbar({ showOtherServices }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const navLinks = showOtherServices
    ? [...NAV_LINKS, { href: "#other-services", label: "Other Services" }]
    : NAV_LINKS

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
      <div className="mx-auto flex h-14 max-w-[1320px] items-center justify-between px-5 sm:px-8">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="shrink-0">
          <Logo />
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
            className="rounded-full bg-[#ea580c] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,0.7)] transition-transform hover:brightness-105 active:scale-[0.98]"
          >
            Get Started
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
            className="mt-2 block w-full rounded-full bg-[#ea580c] px-3 py-3 text-center text-sm font-semibold text-white"
          >
            Get Started
          </button>
        </div>
      )}
    </header>
  )
}

function StoreBadge({ Icon, small, big, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#0b1220] px-5 text-white shadow-[0_14px_28px_-14px_rgba(11,18,32,0.7)] transition-transform active:scale-[0.99] sm:w-auto sm:justify-start"
    >
      <Icon size={22} />
      <span className="text-left leading-tight">
        <span className="block text-[10px] font-medium text-slate-300">{small}</span>
        <span className="block text-sm font-bold">{big}</span>
      </span>
    </button>
  )
}

/** Hand-drawn-style curved arrow used next to the hero's cursive annotations. */
function CurvedArrow({ flip = false, className = "" }) {
  return (
    <svg
      width="34"
      height="46"
      viewBox="0 0 34 46"
      fill="none"
      className={`${flip ? "-scale-x-100" : ""} ${className}`}
      aria-hidden="true"
    >
      <path
        d="M4 4 C 4 22, 4 30, 27 39"
        stroke="#0b1220"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="1 5"
      />
      <path
        d="M19 35 L29 41 L25 31"
        stroke="#0b1220"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function Hero() {
  const navigate = useNavigate()

  return (
    <section id="top" className="relative overflow-hidden bg-[#fff8f0]">
      <div
        className="pointer-events-none absolute -top-32 right-[-10rem] h-[32rem] w-[32rem] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(closest-side, #fed7aa, transparent)" }}
        aria-hidden="true"
      />
      <div className="relative mx-auto grid max-w-[1320px] grid-cols-1 items-center gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-2 lg:gap-8 lg:py-14">
        <div className="text-center lg:text-left">
          <p className="text-sm font-extrabold tracking-wide text-[#ea580c]">Food • Taxi</p>
          <h1 className="mt-3 text-5xl font-extrabold leading-[1.05] tracking-tight text-[#0b1220] sm:text-6xl">
            Hello <span className="text-[#ea580c]">Parth</span>
          </h1>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#0b1220] sm:text-4xl">Your Everyday Partner</p>

          <p className="mx-auto mt-5 max-w-md text-base leading-7 text-[#64748b] lg:mx-0">
            Craving food? Need a ride? Hello Parth brings it all together — Food, Taxi and more, in one simple app.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <StoreBadge Icon={GooglePlayIcon} small="GET IT ON" big="Google Play" onClick={() => navigate("/login")} />
            <StoreBadge Icon={FaApple} small="Download on the" big="App Store" onClick={() => navigate("/login")} />
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-lg items-center justify-center pb-6 pt-24 lg:max-w-none lg:pb-8 lg:pt-20">
          <div
            className="pointer-events-none absolute h-80 w-80 rounded-full opacity-60 blur-2xl"
            style={{ background: "radial-gradient(closest-side, #fde68a, transparent)" }}
            aria-hidden="true"
          />

          <div className="absolute left-0 top-0 z-30 flex flex-col items-start">
            <span
              className="-rotate-6 text-2xl leading-6 text-[#0b1220] sm:text-3xl sm:leading-7"
              style={{ fontFamily: "'Caveat', cursive" }}
            >
              Delicious
              <br />
              Food
            </span>
            <CurvedArrow className="ml-8 mt-0.5" />
          </div>

          <div className="absolute right-0 top-0 z-30 flex flex-col items-end">
            <span
              className="rotate-6 text-2xl leading-6 text-[#0b1220] sm:text-3xl sm:leading-7"
              style={{ fontFamily: "'Caveat', cursive" }}
            >
              Fast &amp; Safe
              <br />
              Rides
            </span>
            <CurvedArrow flip className="mr-8 mt-0.5" />
          </div>

          <div className="relative flex items-center">
            <img
              src={HERO_FOOD_IMAGE}
              alt="A bowl of delicious vegetarian biryani"
              className="relative z-10 -mr-8 h-28 w-28 shrink-0 self-end rounded-full object-cover shadow-2xl ring-4 ring-white sm:-mr-10 sm:h-36 sm:w-36"
            />

            <PhoneFrame width="w-48 sm:w-56" className="relative z-20 shrink-0">
              <HeroPhoneScreen />
            </PhoneFrame>

            <img
              src={heroTaxiCar}
              alt="Hello Parth taxi car"
              className="relative z-10 -ml-10 w-32 shrink-0 self-end drop-shadow-2xl sm:-ml-14 sm:w-44"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function ServiceCard({ id, Icon, iconBg, iconColor = "#fff", title, desc, cta, onCta }) {
  return (
    <div id={id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: iconBg, color: iconColor }}>
        <Icon size={22} strokeWidth={2.2} />
      </span>
      <h3 className="mt-4 text-lg font-bold text-[#0b1220]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#64748b]">{desc}</p>
      <button
        type="button"
        onClick={onCta}
        className="mt-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#fde8d5] text-[#ea580c] transition-transform hover:translate-x-0.5"
        aria-label={cta}
        title={cta}
      >
        <ArrowRight size={18} />
      </button>
    </div>
  )
}

function ServicesOverview() {
  const navigate = useNavigate()

  return (
    <section id="services" className="scroll-mt-16 bg-white py-14 sm:py-16">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0b1220] sm:text-4xl">Two Services in One App.</h2>
          <p className="mt-4 text-base leading-7 text-[#475569]">
            Whether it's your favourite food or your next ride, Hello Parth makes life easier, faster and better.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 lg:gap-5">
            <ServiceCard
              id="food"
              Icon={UtensilsCrossed}
              iconBg="#ea580c"
              iconColor="#ffffff"
              title="Food Delivery"
              desc="Explore top restaurants, your favourite dishes, and get them delivered to your doorstep."
              cta="Explore Food"
              onCta={() => navigate("/login")}
            />
            <ServiceCard
              id="taxi"
              Icon={Car}
              iconBg="#ffc107"
              iconColor="#171a1f"
              title="Taxi Service"
              desc="Book a ride anytime, anywhere with just a few taps. Safe, reliable and affordable."
              cta="Continue to Taxi"
              onCta={() => navigate("/login")}
            />
          </div>

          <div className="relative flex items-center justify-center gap-4 py-6">
            <div
              className="pointer-events-none absolute h-64 w-64 rounded-full opacity-50 blur-2xl"
              style={{ background: "radial-gradient(closest-side, #fed7aa, transparent)" }}
              aria-hidden="true"
            />
            <PhoneFrame width="w-40 sm:w-48" className="relative z-10 -rotate-3">
              <FoodAppScreen />
            </PhoneFrame>
            <PhoneFrame width="w-40 sm:w-48" className="relative z-20 mt-10 rotate-3">
              <TaxiAppScreen />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  )
}

function WhyChooseUs() {
  return (
    <section id="why-us" className="scroll-mt-16 bg-[#0b1220] py-14 sm:py-16">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,280px)_1fr] lg:gap-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#ea580c]">Why Choose Us</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Why Choose <span className="text-[#ea580c]">Hello Parth?</span>
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              We focus on what matters — your comfort, convenience and satisfaction.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_CHOOSE.map(({ Icon, title, desc }) => (
              <div key={title}>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#ea580c]/40 bg-[#ea580c]/10 text-[#ea580c]">
                  <Icon size={19} strokeWidth={2.2} />
                </span>
                <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-white py-14 sm:py-16">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-[#ea580c]">Simple Steps</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#0b1220] sm:text-4xl">How It Works</h2>
          <p className="mt-4 text-base leading-7 text-[#475569]">
            Get started in just a few taps and enjoy a seamless experience.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-start lg:gap-3">
          {HOW_IT_WORKS.map(({ Icon, step, title, desc }, index) => (
            <Fragment key={title}>
              <div className="flex flex-col items-center text-center">
                <div className="relative shrink-0">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fff3e8] text-[#ea580c]">
                    <Icon size={26} strokeWidth={2.2} />
                  </span>
                  <span className="absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#ea580c] text-xs font-bold text-white shadow">
                    {step}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-[#0b1220]">{title}</h3>
                <p className="mt-1 max-w-[11rem] text-sm leading-6 text-[#64748b]">{desc}</p>
              </div>

              {index < HOW_IT_WORKS.length - 1 && (
                <ChevronRight className="mt-8 hidden shrink-0 self-start text-slate-300 lg:block" size={22} />
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}

function AppPreviewImpact() {
  return (
    <section id="app-preview" className="scroll-mt-16 bg-[#fff8f0] py-14 sm:py-16">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_0.9fr_1fr] lg:gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#ea580c]">App Preview</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#0b1220] sm:text-4xl">Explore the App</h2>
            <p className="mt-4 max-w-sm text-base leading-7 text-[#475569]">
              A smooth and simple interface designed for the best experience.
            </p>

            <div className="mt-8 flex gap-3 sm:gap-4">
              {APP_PREVIEW_ICONS.map(({ Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#ea580c] shadow-sm">
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <span className="text-xs font-semibold text-[#475569]">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center justify-center gap-3 py-6">
            <div
              className="pointer-events-none absolute h-64 w-64 rounded-full opacity-50 blur-2xl"
              style={{ background: "radial-gradient(closest-side, #fed7aa, transparent)" }}
              aria-hidden="true"
            />
            <PhoneFrame width="w-36 sm:w-44" className="relative z-10 -rotate-6">
              <FoodAppScreen />
            </PhoneFrame>
            <PhoneFrame width="w-36 sm:w-44" className="relative z-20 mt-8 rotate-6">
              <TaxiAppScreen />
            </PhoneFrame>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#ea580c]">Our Impact</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#0b1220] sm:text-4xl">
              Making Life Better Every Day
            </h2>

            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6">
              {IMPACT_STATS.map(({ id, Icon, value, label }) => (
                <div key={id} className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#ea580c] shadow-sm">
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <span>
                    <span className="block text-lg font-extrabold text-[#0b1220]">{value}</span>
                    <span className="block text-xs text-[#64748b]">{label}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function OtherServices({ services }) {
  return (
    <section id="other-services" className="scroll-mt-16 bg-[#fff3e8] py-14 sm:py-16">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0b1220] sm:text-4xl">Other Services</h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#475569]">
            A few more places worth exploring, all from the Hello Parth team.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <a
              key={service.id}
              href={service.url}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col overflow-hidden rounded-2xl border-2 border-transparent bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#ea580c] hover:shadow-lg"
            >
              {service.image && (
                <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
                  <img
                    src={service.image}
                    alt={service.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-base font-semibold text-[#0b1220]">{service.name}</h3>
                {service.description && (
                  <p className="mt-1.5 text-sm leading-6 text-[#64748b] line-clamp-3">{service.description}</p>
                )}
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#ea580c] transition-all group-hover:gap-2.5">
                  Explore More
                  <ArrowRight size={16} />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTABanner() {
  const navigate = useNavigate()

  return (
    <section id="download" className="scroll-mt-16 bg-[#fff8f0] px-5 py-14 sm:px-8 sm:py-16">
      <div
        className="relative mx-auto max-w-[1320px] overflow-hidden rounded-[2rem] bg-cover bg-center sm:rounded-[2.5rem]"
        style={{
          backgroundImage: `linear-gradient(100deg, rgba(11,18,32,0.94) 0%, rgba(11,18,32,0.78) 45%, rgba(11,18,32,0.55) 100%), url(${ctaRoadBg})`,
        }}
      >
        <div className="relative flex flex-col items-center gap-8 px-6 py-12 text-center sm:px-10 sm:py-14 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:text-left">
          <div className="flex flex-col items-center gap-1 lg:items-start">
            <p className="text-2xl font-extrabold text-white">
              Hello <span className="text-[#ea580c]">Parth</span>
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Food • Taxi</p>
          </div>

          <div className="max-w-md">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to make your day easier?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Download Hello Parth now and enjoy the best food &amp; taxi services at your fingertips.
            </p>
          </div>

          <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <StoreBadge Icon={GooglePlayIcon} small="GET IT ON" big="Google Play" onClick={() => navigate("/login")} />
            <StoreBadge Icon={FaApple} small="Download on the" big="App Store" onClick={() => navigate("/login")} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const navigate = useNavigate()
  const year = new Date().getFullYear()

  return (
    <footer className="bg-[#171a1f] py-8">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Logo light />
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-300">
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="hover:text-white">Home</button>
            <button type="button" onClick={() => scrollToId("why-us")} className="hover:text-white">Features</button>
            <button type="button" onClick={() => scrollToId("services")} className="hover:text-white">About</button>
            <button type="button" onClick={() => navigate("/taxi/privacy")} className="hover:text-white">Privacy</button>
            <button type="button" onClick={() => navigate("/taxi/terms")} className="hover:text-white">Terms</button>
          </nav>

          <p className="text-xs text-slate-500">© {year} Hello Parth. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

export default function PlatformLanding() {
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

  const showOtherServices = otherServices.length > 0

  return (
    <div className="min-h-dvh w-full bg-white text-[#0b1220]" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <Navbar showOtherServices={showOtherServices} />
      <Hero />
      <ServicesOverview />
      {showOtherServices && <OtherServices services={otherServices} />}
      <WhyChooseUs />
      <HowItWorks />
      <AppPreviewImpact />
      <CTABanner />
      <Footer />
    </div>
  )
}
