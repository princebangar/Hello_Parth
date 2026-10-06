import { useNavigate } from "react-router-dom"
import {
  Store,
  Clock,
  MapPin,
  ChefHat,
  UserRound,
  Power,
  Package,
  Tags,
  PlusCircle,
  History,
  CalendarCheck,
  Wallet,
  Landmark,
  ShieldCheck,
  Download,
  Star,
  LifeBuoy,
  ChevronRight,
  MapPinned,
  Receipt,
  MessageSquareWarning,
  Heart,
} from "lucide-react"
import { BASE } from "./kit"
import { PageHeader } from "./ui"

const T = {
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  cyan: "bg-cyan-50 text-cyan-600",
  orange: "bg-orange-50 text-orange-600",
  indigo: "bg-indigo-50 text-indigo-600",
  teal: "bg-teal-50 text-teal-600",
  pink: "bg-pink-50 text-pink-600",
  lime: "bg-lime-50 text-lime-700",
  sky: "bg-sky-50 text-sky-600",
}

const GROUPS = [
  {
    title: "Outlet",
    items: [
      { label: "Outlet info", hint: "Name, photos and listing", icon: Store, tone: "rose", to: "outlet-info" },
      { label: "Outlet timings", hint: "Opening hours for each day", icon: Clock, tone: "blue", to: "outlet-timings" },
      { label: "Address", hint: "Restaurant address and location", icon: MapPin, tone: "emerald", to: "edit-address" },
      { label: "Cuisines", hint: "What you serve", icon: ChefHat, tone: "amber", to: "edit-cuisines" },
      { label: "Zone setup", hint: "Pin your location on the map", icon: MapPinned, tone: "violet", to: "zone-setup" },
      { label: "Delivery & takeaway", hint: "Pause or resume new orders", icon: Power, tone: "cyan", to: "status" },
    ],
  },
  {
    title: "Orders & menu",
    items: [
      { label: "Inventory", hint: "Dishes, prices and stock", icon: Package, tone: "orange", to: "inventory" },
      { label: "Menu categories", hint: "Create and edit categories", icon: Tags, tone: "indigo", to: "inventory?tab=categories" },
      { label: "Add-ons", hint: "Extras customers can add", icon: PlusCircle, tone: "teal", to: "inventory?tab=addons" },
      { label: "Order history", hint: "All past orders", icon: History, tone: "pink", to: "orders?view=history" },
      { label: "Dining setup", hint: "Table booking settings & photos", icon: CalendarCheck, tone: "lime", to: "reservations?tab=setup" },
    ],
  },
  {
    title: "Finance & compliance",
    items: [
      { label: "Earnings", hint: "Balance and withdrawals", icon: Wallet, tone: "emerald", to: "earnings" },
      { label: "Invoices & taxes", hint: "Order invoices and totals", icon: Receipt, tone: "orange", to: "earnings?tab=invoices" },
      { label: "Bank & UPI", hint: "Payout account details", icon: Landmark, tone: "blue", to: "update-bank-details" },
      { label: "Business & FSSAI", hint: "PAN, GST and licence", icon: ShieldCheck, tone: "violet", to: "fssai" },
      { label: "Download report", hint: "Export sales as CSV", icon: Download, tone: "sky", to: "download-report" },
    ],
  },
  {
    title: "Feedback & help",
    items: [
      { label: "Reviews", hint: "What customers say", icon: Star, tone: "amber", to: "reviews" },
      { label: "Complaints", hint: "Issues raised by customers", icon: MessageSquareWarning, tone: "pink", to: "reviews?tab=complaints" },
      { label: "Help & Support", hint: "Raise a ticket", icon: LifeBuoy, tone: "rose", to: "support" },
      { label: "Share your feedback", hint: "Rate your experience with us", icon: Heart, tone: "teal", to: "share-feedback" },
    ],
  },
]

export default function DesktopSettings() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Outlet Settings" subtitle="Everything about your restaurant in one place" />
      <div className="space-y-8">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map(({ label, hint, icon: Icon, tone, to }) => (
                <button
                  key={label}
                  onClick={() => navigate(`${BASE}/${to}`)}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${T[tone]}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{label}</span>
                    <span className="block truncate text-xs text-slate-500">{hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
