// Web: modules/Food/pages/user/help/Help.jsx — Help Center (static FAQ categories with search + contact block).
// Texts, contact rows and the "Start Chat" alert are the web's own content, unchanged.
import React, { useState } from "react"
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import {
  Search,
  HelpCircle,
  Package,
  CreditCard,
  User,
  Truck,
  MessageCircle,
  Phone,
  Mail,
  ChevronDown,
  ChevronRight,
  Shield,
  Clock,
} from "lucide-react-native"
import { Link } from "@/lib/router"
import { Screen, Text } from "@/native/ui"
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import ScrollReveal from "@food/components/user/ScrollReveal"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { tokensFor } from "@food/components/ui/tokens"

const RED = "#DC2626"

// color: the web's Tailwind text class per category ("text-#991B1B" on Delivery is not a valid class on the web,
// so that icon takes the surrounding text colour -> null here)
const helpCategories = [
  {
    id: "ordering",
    title: "Ordering",
    icon: Package,
    color: RED,
    bgColor: colors.orange[50],
    description: "Learn how to place and manage orders",
    topics: [
      { question: "How do I place an order?", answer: "To place an order, browse restaurants, add items to your cart, and proceed to checkout. Select your delivery address and payment method, then confirm your order." },
      { question: "Can I modify or cancel my order?", answer: "You can modify or cancel your order within 5 minutes of placing it. After that, please contact support for assistance." },
      { question: "How do I track my order?", answer: "Go to 'My Orders' in your profile, select the order you want to track, and you'll see real-time updates on your order status." },
      { question: "What is the minimum order amount?", answer: "The minimum order amount varies by restaurant, typically ranging from $10 to $15. This information is displayed on each restaurant's page." },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    icon: CreditCard,
    color: RED,
    bgColor: colors.orange[50],
    description: "Payment methods and billing questions",
    topics: [
      { question: "What payment methods do you accept?", answer: "We accept all major credit cards, debit cards, digital wallets (Apple Pay, Google Pay), and cash on delivery in select areas." },
      { question: "Is my payment information secure?", answer: "Yes, we use industry-standard encryption to protect your payment information. We never store your full card details." },
      { question: "Can I get a refund?", answer: "Refunds are processed for cancelled orders, incorrect items, or quality issues. Contact support within 24 hours of delivery for assistance." },
      { question: "Why was my payment declined?", answer: "Payment can be declined due to insufficient funds, incorrect card details, or bank restrictions. Please verify your payment method and try again." },
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    icon: Truck,
    color: null,
    bgColor: colors.orange[50],
    description: "Delivery times, fees, and tracking",
    topics: [
      { question: "What are your delivery times?", answer: "Delivery times typically range from 30-60 minutes, depending on the restaurant and your location. Estimated time is shown before checkout." },
      { question: "How much is the delivery fee?", answer: "Delivery fees vary by restaurant and distance, typically ranging from $2.99 to $5.99. The exact fee is shown before you place your order." },
      { question: "Can I schedule a delivery for later?", answer: "Yes, you can schedule orders for up to 7 days in advance during checkout. Select your preferred delivery time." },
      { question: "What if my order is late?", answer: "If your order is significantly delayed, contact support. We'll investigate and may provide compensation or a refund." },
    ],
  },
  {
    id: "account",
    title: "Account & Profile",
    icon: User,
    color: RED,
    bgColor: colors.orange[50],
    description: "Manage your account and preferences",
    topics: [
      { question: "How do I update my profile?", answer: "Go to 'Profile' in the menu, then select 'Edit Profile' to update your name, email, phone number, and other information." },
      { question: "How do I change my password?", answer: "Go to Profile > Settings > Security to change your password. You'll need to verify your current password first." },
      { question: "How do I manage my addresses?", answer: "Navigate to Profile > Addresses to view, add, edit, or delete delivery addresses. Set a default address for faster checkout." },
      { question: "How do I save my favorite restaurants?", answer: "Click the heart icon on any restaurant page to add it to your favorites. View all favorites in Profile > Favorites." },
    ],
  },
  {
    id: "refunds",
    title: "Refunds & Returns",
    icon: Shield,
    color: RED,
    bgColor: colors.orange[50],
    description: "Refund policy and return process",
    topics: [
      { question: "What is your refund policy?", answer: "We offer full refunds for cancelled orders, incorrect items, or quality issues reported within 24 hours of delivery." },
      { question: "How long do refunds take?", answer: "Refunds are typically processed within 5-7 business days, depending on your payment method. You'll receive a confirmation email." },
      { question: "Can I return food items?", answer: "Due to food safety regulations, we cannot accept returns of food items. However, we'll provide a full refund for quality issues." },
      { question: "What if I received the wrong order?", answer: "Contact support immediately with your order number. We'll arrange a replacement or full refund, and you can keep the incorrect order." },
    ],
  },
  {
    id: "general",
    title: "General Questions",
    icon: HelpCircle,
    color: colors.gray[600],
    bgColor: colors.gray[50],
    description: "Other frequently asked questions",
    topics: [
      { question: "Do you offer discounts or promotions?", answer: "Yes! Check the 'Offers' section for current promotions, discount codes, and special deals from restaurants." },
      { question: "How do I contact customer support?", answer: "You can contact us via phone, email, or live chat. Visit the 'Contact Support' section below for all contact options." },
      { question: "Is there a mobile app?", answer: "Yes, our mobile app is available for iOS and Android. Download it from the App Store or Google Play for the best experience." },
      { question: "Do you deliver to my area?", answer: "Enter your delivery address to see available restaurants in your area. We're constantly expanding our delivery zones." },
    ],
  },
]

export default function Help() {
  const t = useTheme()
  const k = tokensFor(t)
  const s = useStyles()
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedCategory, setExpandedCategory] = useState(null)
  const [expandedQuestion, setExpandedQuestion] = useState(null)

  const filteredCategories = helpCategories.filter(
    (category) =>
      category.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.topics.some(
        (topic) => topic.question.toLowerCase().includes(searchQuery.toLowerCase()) || topic.answer.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  )

  const toggleCategory = (categoryId) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId)
    setExpandedQuestion(null)
  }

  const toggleQuestion = (questionIndex) => {
    setExpandedQuestion(expandedQuestion === questionIndex ? null : questionIndex)
  }

  const QuickAction = ({ icon: Icon, bg, title, text }) => (
    <CardContent style={{ padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ padding: 8, backgroundColor: bg, borderRadius: 10 }}>
          <Icon size={20} color={RED} />
        </View>
        <View>
          <Text style={[s.qaTitle, { color: k.foreground }]}>{title}</Text>
          <Text style={[s.qaText, { color: k.mutedForeground }]}>{text}</Text>
        </View>
      </View>
    </CardContent>
  )

  const ContactRow = ({ icon: Icon, title, text, children }) => (
    <View style={s.contactRow}>
      <View style={{ padding: 8, backgroundColor: colors.orange[100], borderRadius: 10 }}>
        <Icon size={20} color={RED} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.contactTitle, { color: k.foreground }]}>{title}</Text>
        <Text style={[s.contactText, { color: k.mutedForeground }]}>{text}</Text>
        {children}
      </View>
    </View>
  )

  return (
    <Screen bg={t.dark ? "#0a0a0a" : colors.white}>
      {!t.dark && (
        <LinearGradient
          colors={[alpha(colors.yellow[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      <AnimatedPage style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <ScrollReveal>
            <View style={{ alignItems: "center", gap: 12, marginBottom: 24 }}>
              <Text style={[s.h1, { color: k.foreground }]}>Help Center</Text>
              <Text style={[s.lead, { color: k.mutedForeground }]}>Find answers to common questions or contact our support team</Text>
            </View>
          </ScrollReveal>

          {/* Search Bar */}
          <ScrollReveal>
            <Card style={shadow.lg}>
              <CardContent style={{ padding: 16 }}>
                <View style={{ justifyContent: "center" }}>
                  <View style={{ position: "absolute", left: 12, zIndex: 1 }} pointerEvents="none">
                    <Search size={20} color={k.mutedForeground} />
                  </View>
                  <Input
                    type="text"
                    placeholder="Search for help topics, questions, or keywords..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={{ paddingLeft: 40, height: 48, fontSize: 16 }}
                  />
                </View>
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* Quick Actions (the web's links have no card around them) */}
          <ScrollReveal>
            <View style={{ gap: 16 }}>
              <Link to="/food/user/orders">
                <QuickAction icon={Package} bg={colors.yellow[100]} title="Track Your Order" text="View order status" />
              </Link>
              <Link to="/food/user/profile">
                <QuickAction icon={User} bg={colors.orange[100]} title="Manage Account" text="Update profile & settings" />
              </Link>
              <QuickAction icon={MessageCircle} bg={colors.orange[100]} title="Contact Support" text="Get help from our team" />
            </View>
          </ScrollReveal>

          {/* Help Categories */}
          <ScrollReveal>
            <View style={{ gap: 16 }}>
              <Text style={[s.h2, { color: k.foreground }]}>Browse by Category</Text>
              {filteredCategories.length === 0 ? (
                <Card>
                  <CardContent style={{ paddingVertical: 48, alignItems: "center" }}>
                    <HelpCircle size={64} color={k.mutedForeground} style={{ marginBottom: 16 }} />
                    <Text style={[s.noResTitle, { color: k.foreground }]}>No results found</Text>
                    <Text style={{ color: k.mutedForeground, marginBottom: 16, textAlign: "center" }}>Try searching with different keywords</Text>
                    <Button variant="outline" onPress={() => setSearchQuery("")}>
                      Clear Search
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                filteredCategories.map((category) => {
                  const Icon = category.icon
                  const isExpanded = expandedCategory === category.id
                  const Chevron = isExpanded ? ChevronDown : ChevronRight
                  return (
                    <Card key={category.id} style={shadow.lg}>
                      <CardHeader onPress={() => toggleCategory(category.id)} style={{ padding: 16, alignItems: "stretch" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                            <View style={{ padding: 8, backgroundColor: category.bgColor, borderRadius: 10 }}>
                              <Icon size={20} color={category.color || k.cardForeground} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <CardTitle style={{ fontSize: 18, lineHeight: 28 }}>{category.title}</CardTitle>
                              <CardDescription style={{ fontSize: 14 }}>{category.description}</CardDescription>
                            </View>
                          </View>
                          <Chevron size={20} color={k.mutedForeground} />
                        </View>
                      </CardHeader>
                      {isExpanded && (
                        <CardContent style={{ padding: 16, paddingTop: 0, gap: 12 }}>
                          {category.topics.map((topic, topicIndex) => {
                            const questionIndex = `${category.id}-${topicIndex}`
                            const isQuestionExpanded = expandedQuestion === questionIndex
                            const QChevron = isQuestionExpanded ? ChevronDown : ChevronRight
                            return (
                              <View key={topicIndex} style={[s.topic, { borderColor: k.border }]}>
                                <Pressable onPress={() => toggleQuestion(questionIndex)} style={s.topicBtn}>
                                  <Text style={[s.topicQ, { color: k.foreground }]}>{topic.question}</Text>
                                  <QChevron size={16} color={k.mutedForeground} />
                                </Pressable>
                                {isQuestionExpanded && (
                                  <View style={[s.answer, { borderTopColor: k.border, backgroundColor: alpha(t.dark ? "#262626" : "#f5f3ee", 0.3) }]}>
                                    <Text style={{ color: k.mutedForeground }}>{topic.answer}</Text>
                                  </View>
                                )}
                              </View>
                            )
                          })}
                        </CardContent>
                      )}
                    </Card>
                  )
                })
              )}
            </View>
          </ScrollReveal>

          {/* Contact Support Section */}
          <ScrollReveal>
            <Card style={[{ borderColor: colors.yellow[200], overflow: "hidden" }, shadow.lg]}>
              <LinearGradient colors={[colors.yellow[50], colors.orange[50]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <CardHeader style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MessageCircle size={20} color={RED} />
                  <CardTitle style={{ fontSize: 20, lineHeight: 28 }}>Still Need Help?</CardTitle>
                </View>
                <CardDescription style={{ fontSize: 14 }}>Our support team is here to assist you 24/7</CardDescription>
              </CardHeader>
              <CardContent style={{ padding: 16, gap: 16 }}>
                <View style={{ gap: 16 }}>
                  <ContactRow icon={Phone} title="Phone Support" text="Call us anytime">
                    <Text style={[s.link, { color: k.primary }]} onPress={() => Linking.openURL("tel:+1-800-123-4567").catch(() => {})}>
                      +1 (800) 123-4567
                    </Text>
                  </ContactRow>
                  <ContactRow icon={Mail} title="Email Support" text="We'll respond within 24 hours">
                    <Text style={[s.link, { color: k.primary }]} onPress={() => Linking.openURL("mailto:support@helloparth.com").catch(() => {})}>
                      support@helloparth.com
                    </Text>
                  </ContactRow>
                  <ContactRow icon={MessageCircle} title="Live Chat" text="Available 24/7">
                    <Button variant="outline" size="sm" style={{ marginTop: 4, alignSelf: "flex-start" }} onPress={() => Alert.alert("", "Live chat would open here")}>
                      Start Chat
                    </Button>
                  </ContactRow>
                </View>
                <View style={[s.divider, { borderTopColor: k.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                    <Clock size={16} color={k.mutedForeground} style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 14, lineHeight: 20, color: k.mutedForeground }}>Average response time: Less than 5 minutes</Text>
                  </View>
                </View>
              </CardContent>
            </Card>
          </ScrollReveal>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  )
}


const useStyles = makeStyles(() => ({
  page: { padding: 16, gap: 16 },
  h1: { fontSize: 30, lineHeight: 36, fontWeight: "700", textAlign: "center" },
  lead: { fontSize: 16, lineHeight: 24, textAlign: "center" },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: "700" },
  qaTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  qaText: { fontSize: 12, lineHeight: 16 },
  noResTitle: { fontSize: 18, lineHeight: 28, fontWeight: "600", marginBottom: 8 },
  topic: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  topicBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topicQ: { fontWeight: "600", paddingRight: 16, flex: 1 },
  answer: { padding: 16, borderTopWidth: 1 },
  contactRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, backgroundColor: colors.white, borderRadius: 10 },
  contactTitle: { fontWeight: "600", marginBottom: 4 },
  contactText: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  divider: { paddingTop: 16, borderTopWidth: 1 },
}))
