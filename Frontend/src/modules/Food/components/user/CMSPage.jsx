import { useNavigate } from "react-router-dom"
import { useState, useEffect, useRef } from "react"
import { ArrowLeft, Lock, Mail, Phone, MessageSquare, Clock, ShieldCheck, MapPin, Ticket } from "lucide-react"
import { motion } from "framer-motion"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import PolicyPageLoader from "@/shared/components/PolicyPageLoader"
import { fetchPolicyPage, readPolicyPage } from "@/shared/utils/policyPages"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { loadBusinessSettings, getCachedSettings } from "@food/utils/businessSettings"
import { isModuleAuthenticated } from "@food/utils/auth"

const toPageData = (page, defaultTitle) => ({
  title: page?.title || defaultTitle,
  content: page?.content || "",
  email: page?.email || "",
  mobile: page?.mobile || "",
  faq: page?.faq || "",
})

const formatBusinessPhone = (phone) => {
  if (!phone) return ""
  if (typeof phone === "string") return phone.trim()
  const number = String(phone.number || "").trim()
  if (!number) return ""
  return `${String(phone.countryCode || "").trim()} ${number}`.trim()
}

/**
 * Shared CMS display component for Help & Support (and other legal pages).
 * Props:
 *   endpoint    - API endpoint to fetch the page data from
 *   title       - Default page title (fallback if API doesn't return one)
 *   module      - "USER" | "RESTAURANT" | "DELIVERY" (default: "USER")
 *   goBack      - Optional override for back navigation (for restaurant/delivery portals)
 *   fallbackPath - Where to navigate when there's no history (default: "/user")
 */
export default function CMSPage({
  endpoint,
  title: defaultTitle,
  module = "USER",
  goBack: externalGoBack,
  fallbackPath = "/user",
}) {
  const navigate = useNavigate()
  const appGoBack = useAppBackNavigation()
  // The last copy of this page (from an earlier visit, or fetched in the background by the login screen) is shown
  // at once; only a page that has never been loaded shows the loader.
  const [loading, setLoading] = useState(() => !readPolicyPage(endpoint))
  const [pageData, setPageData] = useState(() => toPageData(readPolicyPage(endpoint), defaultTitle))

  // Real company contact (admin > Business settings), used when the CMS page
  // itself has no email/phone — never show placeholder contact details.
  const [business, setBusiness] = useState(() => getCachedSettings())

  const shownEndpointRef = useRef(endpoint)
  useEffect(() => {
    let active = true

    if (shownEndpointRef.current !== endpoint) {
      // same component, different page: start from that page's cached copy (or the loader)
      shownEndpointRef.current = endpoint
      const cachedPage = readPolicyPage(endpoint)
      setPageData(toPageData(cachedPage, defaultTitle))
      setLoading(!cachedPage)
    }

    fetchPolicyPage(endpoint).then((page) => {
      if (!active) return
      if (page) setPageData(toPageData(page, defaultTitle))
      setLoading(false)
    })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  useEffect(() => {
    let active = true
    loadBusinessSettings().then((settings) => {
      if (active && settings) setBusiness(settings)
    })
    return () => {
      active = false
    }
  }, [])

  const handleBack = () => {
    if (externalGoBack) {
      externalGoBack()
      return
    }
    if (window.history.length > 2) {
      appGoBack()
    } else {
      navigate(fallbackPath)
    }
  }

  const isSupport = endpoint?.includes("support") || defaultTitle?.toLowerCase().includes("support")
  const hasActualContent = pageData.content && pageData.content.replace(/<[^>]*>/g, "").trim().length > 0;
  const contactEmail = String(pageData.email || business?.email || "").trim()
  const contactPhone = String(pageData.mobile || formatBusinessPhone(business?.phone) || "").trim()
  const contactAddress = [business?.address, business?.state, business?.pincode]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(", ")
  // Only the customer app has the ticket flow (restaurant/delivery have their own).
  const canRaiseTicket = isSupport && module === "USER"
  const handleRaiseTicket = () => {
    if (isModuleAuthenticated("user")) {
      navigate("/food/user/profile/support")
    } else {
      navigate("/login", { state: { from: "/food/user/profile/support" } })
    }
  }

  if (loading) {
    return <PolicyPageLoader />
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a] pb-10">
      {/* Premium Sticky Header */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-900">
        <div className="max-w-4xl mx-auto px-4 h-16 md:h-20 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="h-10 w-10 rounded-full flex items-center justify-center bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95 border-0 outline-none cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="h-6 w-6 text-gray-800 dark:text-gray-200" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
              {pageData.title || defaultTitle}
            </h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
              {module === "DRIVER"
                ? "Hello Parth Captain"
                : module === "RESTAURANT"
                  ? "Hello Parth Restaurant Partner"
                  : module === "DELIVERY"
                    ? "Hello Parth Delivery Partner"
                    : "Hello Parth"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#111] rounded-[2rem] p-6 md:p-10 shadow-sm border border-gray-50 dark:border-gray-900"
        >
          {/* Support Contact Cards */}
          {isSupport && (
            <div className={hasActualContent ? "mb-10" : "mb-0"}>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4 tracking-tight">
                Contact us
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contactEmail && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 flex flex-col items-center text-center group transition-all hover:border-[#CB202D]/30">
                    <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                      <Mail className="w-6 h-6 text-[#CB202D]" />
                    </div>
                    <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2">
                      Email Us
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium break-all">{contactEmail}</p>
                    <a
                      href={`mailto:${contactEmail}`}
                      className="mt-4 text-xs font-black text-[#CB202D] uppercase tracking-widest hover:underline"
                    >
                      Send Message
                    </a>
                  </div>
                )}
                {contactPhone && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 flex flex-col items-center text-center group transition-all hover:border-[#CB202D]/30">
                    <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                      <Phone className="w-6 h-6 text-[#CB202D]" />
                    </div>
                    <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2">
                      Call Us
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{contactPhone}</p>
                    <a
                      href={`tel:${contactPhone.replace(/\s+/g, "")}`}
                      className="mt-4 text-xs font-black text-[#CB202D] uppercase tracking-widest hover:underline"
                    >
                      Call Now
                    </a>
                  </div>
                )}
                {contactAddress && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                      <MapPin className="w-6 h-6 text-[#CB202D]" />
                    </div>
                    <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2">
                      Office
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{contactAddress}</p>
                  </div>
                )}
                {canRaiseTicket && (
                  <button
                    type="button"
                    onClick={handleRaiseTicket}
                    className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 flex flex-col items-center text-center group transition-all hover:border-[#CB202D]/30"
                  >
                    <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                      <Ticket className="w-6 h-6 text-[#CB202D]" />
                    </div>
                    <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2">
                      Raise a support ticket
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                      Report an order, restaurant or app issue and track the reply.
                    </p>
                    <span className="mt-4 text-xs font-black text-[#CB202D] uppercase tracking-widest">
                      Raise ticket
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main Content */}
          {hasActualContent ? (
            <div
              className="prose prose-slate dark:prose-invert max-w-none
                prose-headings:font-black prose-headings:text-gray-900 dark:prose-headings:text-white
                prose-p:text-base prose-p:font-medium prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-p:leading-relaxed
                prose-strong:font-black prose-strong:text-gray-900 dark:prose-strong:text-white
                prose-a:text-[#CB202D] dark:prose-a:text-[#DC2626]
                prose-li:text-base prose-li:font-medium prose-li:text-gray-600 dark:prose-li:text-gray-300"
              dangerouslySetInnerHTML={{ __html: pageData.content }}
            />
          ) : (
            !isSupport && (
              <div className="text-center py-20">
                <Lock className="w-16 h-16 text-gray-100 dark:text-gray-800 mx-auto mb-4" />
                <p className="text-gray-400 font-medium">No additional content available at the moment.</p>
              </div>
            )
          )}

          {/* FAQ + Info Cards — Support pages only */}
          {isSupport && (
            <div className={`${hasActualContent ? "mt-12" : "mt-0"} pt-10 border-t border-gray-100 dark:border-gray-900`}>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-8 tracking-tight">
                Frequently Asked Questions
              </h2>
              <div className="grid gap-4">
                {(() => {
                  const defaultFaqs = [
                    {
                      q: "How do I track my order?",
                      a: "You can track your order in real-time through the 'My Orders' section in your profile.",
                    },
                    {
                      q: "What if I receive a wrong item?",
                      a: "Please contact our support immediately via call or email with your order ID for a quick resolution.",
                    },
                    {
                      q: "Can I cancel my order?",
                      a: "Orders can only be cancelled before the restaurant starts preparing your food.",
                    },
                  ];

                  let faqsToRender = defaultFaqs;
                  if (pageData.faq?.trim()) {
                    const lines = pageData.faq.split("\n").map((l) => l.trim()).filter(Boolean);
                    const parsed = [];
                    let currentQ = null;

                    for (const line of lines) {
                      if (line.startsWith("Q:")) {
                        currentQ = line.substring(2).trim();
                      } else if (line.startsWith("A:") && currentQ) {
                        parsed.push({ q: currentQ, a: line.substring(2).trim() });
                        currentQ = null;
                      }
                    }
                    if (parsed.length > 0) {
                      faqsToRender = parsed;
                    }
                  }

                  return faqsToRender.map((faq, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-4 p-5 rounded-3xl bg-gray-50 dark:bg-gray-900/30 border border-gray-100/50 dark:border-gray-800/50"
                    >
                      <MessageSquare className="w-5 h-5 text-[#CB202D] shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-xs md:text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                          {faq.q}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                          {faq.a}
                        </p>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  let hoursText = "Available 24/7 for emergency support. General inquiries: 9 AM - 11 PM.";
                  let privacyText = "Your conversations with our support team are encrypted and secure.";

                  if (pageData.faq?.trim()) {
                    const lines = pageData.faq.split("\n").map((l) => l.trim()).filter(Boolean);
                    for (const line of lines) {
                      if (line.startsWith("HOURS:")) {
                        hoursText = line.substring(6).trim();
                      } else if (line.startsWith("PRIVACY:")) {
                        privacyText = line.substring(8).trim();
                      }
                    }
                  }

                  return (
                    <>
                      <div className="flex items-start gap-4 p-5 rounded-3xl bg-gray-50 dark:bg-gray-900/30 border border-gray-100/50 dark:border-gray-800/50">
                        <Clock className="w-5 h-5 text-[#CB202D] shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">
                            Operational Hours
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                            {hoursText}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-5 rounded-3xl bg-gray-50 dark:bg-gray-900/30 border border-gray-100/50 dark:border-gray-800/50">
                        <ShieldCheck className="w-5 h-5 text-[#CB202D] shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">
                            Data Privacy
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                            {privacyText}
                          </p>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          </motion.div>

        <p className="text-center mt-10 text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] leading-relaxed">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}{" "}
          <br />
          © {new Date().getFullYear()} Hello Parth. All Rights Reserved.
        </p>
      </div>
    </AnimatedPage>
  )
}
