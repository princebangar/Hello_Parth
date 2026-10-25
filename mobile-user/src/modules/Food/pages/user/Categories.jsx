import React, { useState, useEffect, useMemo, useRef } from "react";
import { Animated, FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { BlurView } from "expo-blur";
import { ArrowLeft, Search, Grid2x2 } from "lucide-react-native";
import { Link, useNavigate } from "@/lib/router";
import { Screen, Text, TextInput, Skeleton } from "@/native/ui";
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme";
import { adminAPI } from "@food/api";
import { foodImages } from "@food/constants/images";
import OptimizedImage from "@food/components/OptimizedImage";
import { useLocation } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";
import useAppBackNavigation from "@food/hooks/useAppBackNavigation";
import { API_BASE_URL } from "@food/api/config";
import { useProfile } from "@food/context/ProfileContext";
import { isNonVegCategoryScope } from "@food/utils/vegMode";

const COLUMNS = 4;
const GAP_X = sp(4);
const GAP_Y = sp(10);

/** motion.div initial {opacity:0, y:10} -> animate, delay index * 0.03s */
function FadeInItem({ index, style, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(anim, { toValue: 1, duration: 300, delay: index * 30, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [anim, index]);
  return (
    <Animated.View
      style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

export default function Categories() {
  const navigate = useNavigate();
  const goBack = useAppBackNavigation();
  const t = useTheme();
  const s = useStyles();
  const { width } = useWindowDimensions();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const { vegMode } = useProfile();
  const { location } = useLocation();
  const { zoneId } = useZone(location);

  const BACKEND_ORIGIN = useMemo(() => API_BASE_URL.replace(/\/api\/?$/, ""), []);
  const itemWidth = (width - sp(4) * 2 - GAP_X * (COLUMNS - 1)) / COLUMNS;

  const normalizeImageUrl = (imageUrl) => {
    if (typeof imageUrl !== "string") return "";
    const trimmed = imageUrl.trim();
    if (!trimmed) return "";
    if (/^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) return trimmed;

    const normalizedInput = trimmed
      .replace(/\\/g, "/")
      .replace(/^(https?):\/(?!\/)/i, "$1://")
      .replace(/^(https?:\/\/)(https?:\/\/)/i, "$1");

    if (/^(https?:)?\/\//i.test(normalizedInput)) return normalizedInput;

    return normalizedInput.startsWith("/")
      ? `${BACKEND_ORIGIN}${normalizedInput}`
      : `${BACKEND_ORIGIN}/${normalizedInput.replace(/^\.?\/*/, "")}`;
  };

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        const response = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {});
        const list =
          response?.data?.data?.categories ||
          response?.data?.categories ||
          [];

        if (Array.isArray(list)) {
          const transformed = list.map((cat, idx) => ({
            id: String(cat?.id || cat?._id || cat?.slug || idx),
            name: cat?.name || "",
            slug: cat?.slug || String(cat?.name || "").toLowerCase().replace(/\s+/g, "-"),
            image: normalizeImageUrl(cat?.image || cat?.imageUrl) || foodImages[idx % foodImages.length],
            type: cat?.type || "",
            foodTypeScope: cat?.foodTypeScope || "",
          }));
          setCategories(transformed);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, BACKEND_ORIGIN]);

  const filteredCategories = categories.filter((cat) => {
    if (vegMode && isNonVegCategoryScope(cat)) return false;
    return (cat.name || "").toLowerCase().includes(searchQuery.toLowerCase());
  });

  const listHeader = (
    <View style={s.searchWrap}>
      <View>
        <View style={s.searchIcon} pointerEvents="none">
          <Search size={20} color={searchFocused ? "#DC2626" : t.dark ? colors.gray[500] : colors.neutral[400]} />
        </View>
        <TextInput
          placeholder="Search specialties, cuisines..."
          placeholderTextColor={t.dark ? colors.gray[600] : colors.neutral[400]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          style={[s.searchInput, searchFocused && s.searchInputFocused]}
          returnKeyType="search"
        />
      </View>
    </View>
  );

  const renderCategory = ({ item: category, index }) => (
    <FadeInItem index={index} style={{ width: itemWidth }}>
      <Link to={`/food/user/category/${category.slug}`}>
        {({ pressed }) => (
          <View style={s.catItem}>
            <View style={[s.catCircle, { width: itemWidth, height: itemWidth, transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
              <OptimizedImage
                src={category.image}
                alt={category.name}
                style={s.fill}
                sizes="(max-width: 640px) 25vw, 15vw"
              />
            </View>
            <Text style={s.catName}>{category.name}</Text>
          </View>
        )}
      </Link>
    </FadeInItem>
  );

  const emptyState =
    filteredCategories.length === 0 && !loading ? (
      <View style={s.empty}>
        <View style={s.emptyIconWrap}>
          <Grid2x2 size={40} color={t.dark ? colors.gray[700] : colors.neutral[300]} />
        </View>
        <Text style={s.emptyTitle}>No results found</Text>
        <Text style={s.emptyText}>We couldn't find any categories matching your search. Try another keyword!</Text>
        <Pressable onPress={() => setSearchQuery("")} style={({ pressed }) => [s.emptyBtn, pressed && { transform: [{ scale: 0.95 }] }]}>
          <Text style={s.emptyBtnText}>Show all categories</Text>
        </Pressable>
      </View>
    ) : null;

  return (
    <Screen edges={["top", "bottom"]} bg={t.dark ? "#0a0a0a" : colors.white}>
      {/* Header (sticky, bg-white/80 + backdrop-blur-md) */}
      <View style={s.header}>
        <BlurView intensity={30} tint={t.dark ? "dark" : "light"} style={[s.absFill, { backgroundColor: t.dark ? alpha("#0a0a0a", 0.8) : alpha(colors.white, 0.8) }]} />
        <Pressable onPress={goBack} style={({ pressed }) => [s.backBtn, pressed && s.backBtnPressed]} hitSlop={6}>
          <ArrowLeft size={24} color={t.dark ? colors.white : colors.neutral[800]} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>All Categories</Text>
          <Text style={s.subtitle}>WHAT'S ON YOUR MIND?</Text>
        </View>
      </View>

      {loading ? (
        <FlatList
          data={Array.from({ length: 12 }, (_, i) => i)}
          keyExtractor={(i) => `sk-${i}`}
          numColumns={COLUMNS}
          ListHeaderComponent={listHeader}
          keyboardShouldPersistTaps="handled"
          columnWrapperStyle={s.row}
          contentContainerStyle={s.listContent}
          renderItem={() => (
            <View style={[s.catItem, { width: itemWidth, gap: sp(3) }]}>
              <Skeleton width={itemWidth} height={itemWidth} rounded={radius.full} style={s.skelCircle} />
              <Skeleton width={48} height={8} rounded={radius.full} style={s.skelLine} />
            </View>
          )}
        />
      ) : (
        <FlatList
          data={filteredCategories}
          keyExtractor={(item, index) => String(item.id || index)}
          numColumns={COLUMNS}
          renderItem={renderCategory}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyState}
          keyboardShouldPersistTaps="handled"
          columnWrapperStyle={s.row}
          contentContainerStyle={s.listContent}
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { width: "100%", height: "100%" },
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  header: {
    zIndex: 50,
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : colors.neutral[100],
    paddingHorizontal: sp(4),
    paddingVertical: sp(4),
    flexDirection: "row",
    alignItems: "center",
    gap: sp(4),
  },
  backBtn: { padding: sp(2), borderRadius: radius.full },
  backBtnPressed: { transform: [{ scale: 0.95 }], backgroundColor: t.dark ? colors.gray[800] : colors.neutral[100] },
  title: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.neutral[900], letterSpacing: -0.5 },
  subtitle: { fontSize: 10, lineHeight: 10, marginTop: sp(1), fontWeight: "700", color: t.dark ? colors.gray[400] : colors.neutral[500], letterSpacing: 1 },
  searchWrap: { paddingVertical: sp(6) },
  searchIcon: { position: "absolute", left: sp(4), top: 0, bottom: 0, justifyContent: "center", zIndex: 1 },
  searchInput: {
    width: "100%",
    paddingLeft: sp(12),
    paddingRight: sp(4),
    paddingVertical: sp(4),
    backgroundColor: t.dark ? colors.gray[900] : colors.neutral[50],
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.neutral[100],
    borderRadius: radius["2xl"],
    ...fontSize.sm,
    fontWeight: "500",
    color: t.dark ? colors.white : colors.gray[900],
  },
  searchInputFocused: { borderColor: "#DC2626" },
  listContent: { paddingHorizontal: sp(4), paddingBottom: sp(10) },
  row: { gap: GAP_X, marginBottom: GAP_Y },
  catItem: { alignItems: "center", gap: sp(2.5) },
  catCircle: {
    borderRadius: radius.full,
    overflow: "hidden",
    ...shadow.sm,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.neutral[100],
    backgroundColor: t.dark ? colors.gray[900] : colors.white,
  },
  catName: { fontSize: 11, lineHeight: 14, fontWeight: "700", color: t.dark ? colors.gray[300] : colors.neutral[700], textAlign: "center" },
  skelCircle: { backgroundColor: t.dark ? colors.gray[800] : colors.neutral[100], borderWidth: 1, borderColor: t.dark ? colors.gray[700] : colors.neutral[50] },
  skelLine: { backgroundColor: t.dark ? colors.gray[800] : colors.neutral[100] },
  empty: { paddingVertical: sp(20), alignItems: "center", paddingHorizontal: sp(6) },
  emptyIconWrap: {
    height: 80,
    width: 80,
    backgroundColor: t.dark ? colors.gray[900] : colors.neutral[50],
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sp(6),
  },
  emptyTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.neutral[900] },
  emptyText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.neutral[500], marginTop: sp(2), maxWidth: 240, textAlign: "center" },
  emptyBtn: {
    marginTop: sp(8),
    paddingHorizontal: sp(8),
    paddingVertical: sp(3),
    backgroundColor: t.dark ? colors.white : colors.neutral[900],
    borderRadius: radius["2xl"],
    ...shadow.lg,
  },
  emptyBtnText: { ...fontSize.sm, fontWeight: "700", color: t.dark ? colors.black : colors.white },
}));
