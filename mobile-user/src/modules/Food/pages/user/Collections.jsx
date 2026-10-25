import React, { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Svg, { Polygon } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus, Share2, UtensilsCrossed, Store, X } from "lucide-react-native";
import { Link, useNavigate } from "@/lib/router";
import { AppImage, Dialog, Screen, Text, TextInput } from "@/native/ui";
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme";
import useAppBackNavigation from "@food/hooks/useAppBackNavigation";

// Import banner
import collectionsBanner from "@food/assets/collectionspagebanner.png";

// Gradient colors for collection cards (bg-gradient-to-br). "to-#991B1B" is not a valid Tailwind class on the web,
// so those two cards fade to transparent there — kept the same here.
const gradientColors = [
  [colors.red[400], colors.red[600]],
  [colors.orange[400], alpha(colors.orange[400], 0)],
  [colors.purple[500], colors.pink[600]],
  [colors.green[400], colors.emerald[600]],
  [colors.orange[400], colors.red[500]],
  [colors.amber[400], colors.yellow[600]],
  [colors.pink[400], colors.rose[600]],
  [colors.amber[400], alpha(colors.amber[400], 0)],
];

export default function Collections() {
  const navigate = useNavigate();
  const goBack = useAppBackNavigation();
  const t = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState("delivery");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  // Delivery collections
  const [deliveryCollections, setDeliveryCollections] = useState([
    { id: "bookmarks", name: "Bookmarks", dishes: 0, restaurants: 0, isDefault: true },
  ]);

  // Dining collections
  const [diningCollections, setDiningCollections] = useState([
    { id: "bookmarks", name: "Bookmarks", dishes: 0, restaurants: 0, isDefault: true },
  ]);

  const currentCollections = activeTab === "delivery" ? deliveryCollections : diningCollections;
  const setCurrentCollections = activeTab === "delivery" ? setDeliveryCollections : setDiningCollections;

  const handleCreateCollection = () => {
    if (newCollectionName.trim()) {
      const newCollection = {
        id: `collection-${Date.now()}`,
        name: newCollectionName.trim(),
        dishes: 0,
        restaurants: 0,
        isDefault: false,
      };
      setCurrentCollections((prev) => [...prev, newCollection]);
      setNewCollectionName("");
      setIsCreateDialogOpen(false);
    }
  };

  const closeDialog = () => {
    setIsCreateDialogOpen(false);
    setNewCollectionName("");
  };

  const getGradientColor = (index) => gradientColors[index % gradientColors.length];

  const cardWidth = (width - sp(4) * 2 - sp(4)) / 2;

  const renderTab = (id, label) => {
    const active = activeTab === id;
    return (
      <Pressable key={id} onPress={() => setActiveTab(id)} style={s.tab}>
        <Text style={[s.tabText, { color: active ? (t.dark ? colors.gray[100] : colors.gray[900]) : t.dark ? colors.gray[500] : colors.gray[400] }]}>
          {label}
        </Text>
        {active && <View style={s.tabIndicator} />}
      </Pressable>
    );
  };

  return (
    <Screen edges={["bottom"]} bg={t.dark ? "#0a0a0a" : colors.white}>
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingTop: insets.top }}>
        {/* Banner Section - Clean without dark overlay */}
        <LinearGradient colors={[colors.amber[50], colors.white]} style={[s.banner, { minHeight: height * 0.25 }]}>
          <AppImage src={collectionsBanner} style={s.absFill} contentFit="cover" />
        </LinearGradient>

        {/* Tabs */}
        <View style={s.tabs}>
          <View style={s.tabsRow}>
            {renderTab("delivery", "Delivery")}
            {renderTab("dining", "Dining")}
          </View>
        </View>

        {/* Content */}
        <View style={s.content}>
          <View style={s.grid}>
            {/* Collection Cards */}
            {currentCollections.map((collection, index) => {
              const [from, to] = getGradientColor(index);
              return (
                <Link
                  key={collection.id}
                  to={collection.isDefault ? "/user/profile/favorites" : `/user/collections/${collection.id}`}
                  style={{ width: cardWidth }}
                >
                  <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.collectionCard}>
                    {/* Share Button */}
                    <Pressable style={s.shareBtn} onPress={() => {}} hitSlop={6}>
                      <Share2 size={20} color={alpha(colors.white, 0.8)} />
                    </Pressable>

                    {/* Center Illustration - Two overlapping cards */}
                    <View style={s.illustrationWrap} pointerEvents="none">
                      <View style={s.illustration}>
                        {/* Left card - Food */}
                        <View style={[s.miniCard, s.miniCardLeft]}>
                          <View style={s.miniCardInner}>
                            <View style={s.foodCircle}>
                              <UtensilsCrossed size={16} color={colors.white} />
                            </View>
                          </View>
                          {/* Red flag */}
                          <Svg width={10} height={14} style={s.flag}>
                            <Polygon points="0,0 10,0 10,9.8 5,14 0,9.8" fill={colors.red[500]} />
                          </Svg>
                        </View>

                        {/* Right card - Restaurant */}
                        <View style={[s.miniCard, s.miniCardRight]}>
                          <View style={s.miniCardInner}>
                            <Store size={24} color="#DC2626" />
                          </View>
                          {/* Striped awning */}
                          <View style={s.awning}>
                            {Array.from({ length: 8 }).map((_, i) => (
                              <View key={i} style={{ width: 4, height: "100%", backgroundColor: i % 2 === 0 ? "#fb923c" : colors.white }} />
                            ))}
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Collection Info */}
                    <View style={s.info}>
                      <Text style={s.infoTitle}>{collection.name}</Text>
                      <Text style={s.infoSub}>
                        {collection.dishes} dish | {collection.restaurants} restaurant
                      </Text>
                    </View>
                  </LinearGradient>
                </Link>
              );
            })}

            {/* Create New Collection Card */}
            <Pressable
              onPress={() => setIsCreateDialogOpen(true)}
              style={({ pressed }) => [s.createCard, { width: cardWidth }, pressed && s.createCardPressed]}
            >
              <View style={s.plusCircle}>
                <Plus size={24} color="#DC2626" />
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={s.createText}>Create a new</Text>
                <Text style={s.createText}>Collection</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Back Button (fixed) */}
      <Pressable onPress={goBack} style={[s.backBtn, { top: insets.top + sp(4) }]}>
        <BlurView intensity={10} tint="dark" style={s.absFill} />
        <ArrowLeft size={20} color={colors.white} />
      </Pressable>

      {/* Custom Create Collection Modal */}
      <Dialog open={isCreateDialogOpen} onClose={closeDialog} backdropOpacity={0.4} style={s.dialog}>
        {/* Header */}
        <View style={s.dialogHeader}>
          <Text style={s.dialogTitle}>Create New Collection</Text>
          <Pressable onPress={closeDialog} style={({ pressed }) => [s.dialogClose, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}>
            <X size={20} color={t.dark ? colors.gray[400] : colors.gray[500]} />
          </Pressable>
        </View>

        {/* Body */}
        <View style={s.dialogBody}>
          <Text style={s.dialogHint}>Give your collection a unique name</Text>
          <TextInput
            placeholder="e.g., Weekend Favorites"
            placeholderTextColor={t.dark ? colors.gray[400] : colors.gray[500]}
            value={newCollectionName}
            onChangeText={setNewCollectionName}
            onSubmitEditing={() => {
              if (newCollectionName.trim()) handleCreateCollection();
            }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            style={[s.input, inputFocused && { borderColor: "#DC2626" }]}
            autoFocus
            returnKeyType="done"
          />

          {/* Preview */}
          {newCollectionName.trim() ? (
            <View style={s.preview}>
              <Text style={s.previewLabel}>Preview</Text>
              <Text style={s.previewName}>{newCollectionName.trim()}</Text>
            </View>
          ) : null}
        </View>

        {/* Footer */}
        <View style={s.dialogFooter}>
          <Pressable onPress={closeDialog} style={({ pressed }) => [s.footerBtn, s.cancelBtn, pressed && { backgroundColor: t.dark ? colors.gray[700] : colors.gray[100] }]}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleCreateCollection}
            disabled={!newCollectionName.trim()}
            style={({ pressed }) => [s.footerBtn, s.createBtn, pressed && { backgroundColor: "#991B1B" }, !newCollectionName.trim() && { opacity: 0.5 }]}
          >
            <Text style={s.createBtnText}>Create Collection</Text>
          </Pressable>
        </View>
      </Dialog>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  backBtn: {
    position: "absolute",
    left: sp(4),
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: alpha(colors.gray[800], 0.6),
    alignItems: "center",
    justifyContent: "center",
  },
  banner: { width: "100%", overflow: "hidden" },
  tabs: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : colors.gray[200],
  },
  tabsRow: { flexDirection: "row" },
  tab: { flex: 1, paddingVertical: sp(4), alignItems: "center" },
  tabText: { ...fontSize.base, fontWeight: "600", textAlign: "center" },
  tabIndicator: { position: "absolute", bottom: 0, alignSelf: "center", width: 80, height: 4, backgroundColor: "#DC2626", borderRadius: radius.full },
  content: { paddingHorizontal: sp(4), paddingVertical: sp(6) },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: sp(4) },
  collectionCard: { borderRadius: radius["2xl"], padding: sp(4), height: 192, overflow: "hidden" },
  shareBtn: { position: "absolute", top: sp(3), right: sp(3), zIndex: 10 },
  illustrationWrap: { ...{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, alignItems: "center", justifyContent: "center", paddingBottom: sp(10) },
  illustration: { width: 128, height: 96 },
  miniCard: { position: "absolute", width: 56, height: 44, backgroundColor: colors.white, borderRadius: radius.lg, ...shadow.lg, overflow: "hidden" },
  miniCardLeft: { left: 0, top: 8, transform: [{ rotate: "-12deg" }] },
  miniCardRight: { right: 0, top: 0, transform: [{ rotate: "12deg" }] },
  miniCardInner: { width: "100%", height: "100%", backgroundColor: colors.gray[50], alignItems: "center", justifyContent: "center", padding: sp(1) },
  foodCircle: { width: 32, height: 32, backgroundColor: colors.amber[400], borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  flag: { position: "absolute", top: -4, right: 8 },
  awning: { position: "absolute", top: -2, left: 0, right: 0, height: 8, flexDirection: "row", overflow: "hidden" },
  info: { position: "absolute", bottom: sp(4), left: sp(4), right: sp(4) },
  infoTitle: { color: colors.white, fontWeight: "700", ...fontSize.lg, marginBottom: sp(1) },
  infoSub: { color: alpha(colors.white, 0.8), ...fontSize.sm },
  createCard: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    borderRadius: radius["2xl"],
    padding: sp(4),
    height: 192,
    alignItems: "center",
    justifyContent: "center",
    gap: sp(3),
  },
  createCardPressed: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50], borderColor: t.dark ? colors.gray[600] : colors.gray[300] },
  plusCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: t.dark ? alpha("#DC2626", 0.2) : "#F9F9FB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: alpha("#DC2626", t.dark ? 0.4 : 0.3),
  },
  createText: { ...fontSize.base, color: t.dark ? colors.gray[300] : colors.gray[700], fontWeight: "600" },
  dialog: { width: "90%", maxWidth: 384, backgroundColor: t.dark ? "#1a1a1a" : colors.white, ...shadow["2xl"] },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: sp(4),
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : colors.gray[200],
  },
  dialogTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.gray[100] : colors.gray[900] },
  dialogClose: { width: 32, height: 32, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  dialogBody: { padding: sp(4), gap: sp(4) },
  dialogHint: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500] },
  input: {
    width: "100%",
    height: 48,
    ...fontSize.base,
    borderWidth: 2,
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    borderRadius: radius.xl,
    backgroundColor: t.dark ? "#2a2a2a" : colors.white,
    color: t.dark ? colors.white : colors.gray[900],
    paddingHorizontal: sp(3),
  },
  preview: { padding: sp(3), backgroundColor: t.dark ? colors.gray[800] : colors.gray[50], borderRadius: radius.xl },
  previewLabel: { ...fontSize.xs, color: t.dark ? colors.gray[500] : colors.gray[400], marginBottom: sp(1) },
  previewName: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.gray[200] : colors.gray[800] },
  dialogFooter: { flexDirection: "row", gap: sp(3), padding: sp(4), backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] },
  footerBtn: { flex: 1, height: 44, borderRadius: radius.xl, alignItems: "center", justifyContent: "center" },
  cancelBtn: { borderWidth: 1, borderColor: t.dark ? colors.gray[700] : colors.gray[200], backgroundColor: t.dark ? alpha("#f2f0ea", 0.3) : colors.white, ...shadow.xs },
  cancelText: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700] },
  createBtn: { backgroundColor: "#DC2626" },
  createBtnText: { ...fontSize.sm, fontWeight: "600", color: colors.white },
}));
