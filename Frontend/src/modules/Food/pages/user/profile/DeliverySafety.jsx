import { Link, useLocation } from "react-router-dom"
import { ArrowLeft, Shield, KeyRound, MapPin, PhoneCall, AlertTriangle } from "lucide-react"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"

// What the app really does to keep an order and its delivery partner safe (only features that exist in the app).
const POINTS = [
  {
    icon: KeyRound,
    title: "Delivery code (OTP)",
    text: "Your order is handed over only against the delivery code shown in your order screen. Share it with the partner at the door and with nobody else.",
  },
  {
    icon: MapPin,
    title: "Live tracking",
    text: "Once a partner picks up your order you can follow the route on the map until it reaches you.",
  },
  {
    icon: PhoneCall,
    title: "Contact your partner",
    text: "Call or message your delivery partner from the order screen if you need to explain the address or a landmark.",
  },
  {
    icon: AlertTriangle,
    title: "Something feels wrong?",
    text: "Report a safety concern at any time. Our team is notified and follows up with you.",
  },
]

export default function DeliverySafety() {
  const goBack = useAppBackNavigation()
  const location = useLocation()

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      <div className="max-w-md md:max-w-2xl mx-auto px-4 py-6 pb-16">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={goBack} aria-label="Go back" className="p-2 rounded-full hover:bg-white dark:hover:bg-gray-800">
            <ArrowLeft className="h-5 w-5 text-gray-900 dark:text-white" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Delivery partner safety</h1>
        </div>

        <div className="flex items-center gap-3 mb-5 text-[#DC2626]">
          <Shield className="h-6 w-6" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">How we keep your delivery safe</p>
        </div>

        <div className="space-y-3">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="bg-white dark:bg-[#1a1a1a] border-0 shadow-sm">
              <CardContent className="p-4 flex gap-3">
                <Icon className="h-5 w-5 mt-0.5 shrink-0 text-gray-600 dark:text-gray-400" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button asChild className="w-full mt-6 bg-[#DC2626] hover:bg-[#B91C1C] text-white">
          <Link to="/food/user/profile/report-safety-emergency" state={{ returnTo: location.pathname }}>
            Report a safety concern
          </Link>
        </Button>
      </div>
    </AnimatedPage>
  )
}
