import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Animated, Dimensions, Easing, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigate } from "@/lib/router";
import { Text, Skeleton } from "@/native/ui";
import { alpha, colors, makeStyles, radius, shadow, sp } from "@/theme";
import OptimizedImage from "@food/components/OptimizedImage";
import { useProfile } from "@food/context/ProfileContext";
import { isVegMenuItem } from "@food/utils/vegMode";
import { saveBrowseScroll, saveCategoryBrowseClick, getBrowseScrollY } from "@food/utils/browseScrollMemory";
import dishFallbackImage from "@food/assets/dish_fallback.webp";
import { toFoodUserPath, getRestaurantRouteId } from "@food/utils/mainTabRoutes";
import { getAppRoutePath } from "@/shared/utils/nativeShell";

const WEBVIEW_SESSION_CACHE_BUSTER = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const APP_HOSTNAME = (() => {
  try {
    return new URL(globalThis.location?.origin || "https://helloparth.in").hostname;
  } catch {
    return "helloparth.in";
  }
})();

/** The web's roundedClass ("rounded-t-md", "rounded-t-[20px]" ...) -> corner radius style. */
const roundedClassToStyle = (roundedClass) => {
  const value = String(roundedClass || "").trim();
  const m = value.match(/^rounded(?:-(t|b|l|r|tl|tr|bl|br))?(?:-(none|xs|sm|md|lg|xl|2xl|3xl|full|\[(\d+(?:\.\d+)?)px\]))?$/);
  if (!m) return {};
  const side = m[1] || "";
  const size = m[3] != null ? Number(m[3]) : radius[m[2] || "DEFAULT"] ?? radius.DEFAULT;
  const corners = {
    "": ["TopLeft", "TopRight", "BottomLeft", "BottomRight"],
    t: ["TopLeft", "TopRight"],
    b: ["BottomLeft", "BottomRight"],
    l: ["TopLeft", "BottomLeft"],
    r: ["TopRight", "BottomRight"],
    tl: ["TopLeft"],
    tr: ["TopRight"],
    bl: ["BottomLeft"],
    br: ["BottomRight"],
  }[side];
  return Object.fromEntries(corners.map((c) => [`border${c}Radius`, size]));
};

/** Home / category restaurant card image carousel (auto-swipe + dish overlay). */
const RestaurantImageCarousel = React.memo(
  ({
    restaurant,
    priority = false,
    backendOrigin = "",
    // web default "h-56 ..." (224px at phone width); callers pass { height } like the web's h-* class
    style,
    roundedClass = "rounded-t-md",
    roundedStyle,
    backFrom = "",
    focusId = "",
    visibleCount,
    categoryFallbackImage = null,
  }) => {
    const s = useStyles();
    const webviewSessionKeyRef = useRef(WEBVIEW_SESSION_CACHE_BUSTER);
    const navigate = useNavigate();
    const { vegMode } = useProfile();

    const withCacheBuster = useCallback(
      (url) => {
        if (typeof url !== "string" || !url) return "";
        if (/^data:/i.test(url) || /^blob:/i.test(url)) return url;

        const isRelative = !/^(https?:|\/\/|data:|blob:)/i.test(url.trim());
        const resolvedUrl =
          backendOrigin && isRelative
            ? `${backendOrigin.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`
            : url;

        const hasSignedParams =
          /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(
            resolvedUrl,
          );
        if (hasSignedParams) return resolvedUrl;

        try {
          const parsed = new URL(resolvedUrl, globalThis.location?.origin || "https://helloparth.in");
          const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname);
          const isSameHost = APP_HOSTNAME && parsed.hostname === APP_HOSTNAME;

          if (isLocalHost || isSameHost) {
            parsed.searchParams.set("_wv", webviewSessionKeyRef.current);
          }
          return parsed.toString();
        } catch {
          return resolvedUrl;
        }
      },
      [backendOrigin],
    );

    const slideItems = useMemo(() => {
      let items = [];
      if (Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length > 0) {
        restaurant.recommendedDishes.forEach((dish, idx) => {
          if (vegMode && !isVegMenuItem(dish)) return;
          const dishImg = dish.image || categoryFallbackImage;
          if (dishImg) {
            const finalSrc = dishImg === dishFallbackImage ? dishImg : withCacheBuster(dishImg);
            items.push({ id: dish.id || idx, src: finalSrc, dish });
          }
        });
      }

      if (items.length === 0) {
        const sourceImages =
          Array.isArray(restaurant.images) && restaurant.images.length > 0
            ? restaurant.images
            : [restaurant.image];
        const validImages = sourceImages
          .filter((img) => typeof img === "string")
          .map((img) => img.trim())
          .filter(Boolean);
        if (validImages.length > 0) {
          items.push({ id: "fallback", src: withCacheBuster(validImages[0]), dish: null });
        } else if (categoryFallbackImage) {
          const finalSrc = categoryFallbackImage === dishFallbackImage ? dishFallbackImage : withCacheBuster(categoryFallbackImage);
          items.push({ id: "fallback", src: finalSrc, dish: null });
        } else {
          items.push({ id: "fallback", src: dishFallbackImage, dish: null });
        }
      }
      return items;
    }, [restaurant.recommendedDishes, restaurant.images, restaurant.image, withCacheBuster, vegMode, categoryFallbackImage]);

    const carouselRef = useRef(null);
    const [slideWidth, setSlideWidth] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isImageUnavailable, setIsImageUnavailable] = useState(false);
    const [loadedIndices, setLoadedIndices] = useState(new Set([0]));

    const [isTransitioning, setIsTransitioning] = useState(true);
    const [displayIndex, setDisplayIndex] = useState(0);
    const translateX = useRef(new Animated.Value(0)).current;

    const infiniteSlides = useMemo(() => {
      if (slideItems.length <= 1) return slideItems;
      return [...slideItems, { ...slideItems[0], id: "clone-first" }];
    }, [slideItems]);

    const handleNext = useCallback(() => {
      if (slideItems.length <= 1) return;
      setIsTransitioning(true);
      setCurrentIndex((prev) => prev + 1);
    }, [slideItems.length]);

    const handlePrev = useCallback(() => {
      if (slideItems.length <= 1) return;
      setIsTransitioning(true);
      setCurrentIndex((prev) => (prev - 1 + infiniteSlides.length) % infiniteSlides.length);
    }, [slideItems.length, infiniteSlides.length]);

    // translateX(-index * 100%) with the web's 500ms ease-in-out transition
    useEffect(() => {
      const toValue = -currentIndex * slideWidth;
      if (isTransitioning && slideWidth > 0) {
        const anim = Animated.timing(translateX, {
          toValue,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        });
        anim.start();
        return () => anim.stop();
      }
      translateX.setValue(toValue);
      return undefined;
    }, [currentIndex, isTransitioning, slideWidth, translateX]);

    // Auto-slide every 3s, only while the card sits in the middle of the screen
    // (web: IntersectionObserver with rootMargin -20% top/bottom).
    useEffect(() => {
      if (slideItems.length <= 1) return undefined;
      const timer = setInterval(() => {
        const node = carouselRef.current;
        if (!node?.measureInWindow) return;
        node.measureInWindow((x, y, w, h) => {
          const screenH = Dimensions.get("window").height;
          const isCentered = h > 0 && y < screenH * 0.8 && y + h > screenH * 0.2;
          if (isCentered) handleNext();
        });
      }, 3000);
      return () => clearInterval(timer);
    }, [slideItems.length, handleNext]);

    useEffect(() => {
      if (currentIndex === infiniteSlides.length - 1 && slideItems.length > 1) {
        const timer = setTimeout(() => {
          setIsTransitioning(false);
          setCurrentIndex(0);
        }, 500);
        return () => clearTimeout(timer);
      }
      return undefined;
    }, [currentIndex, infiniteSlides.length, slideItems.length]);

    useEffect(() => {
      if (slideItems.length > 0) {
        setDisplayIndex(currentIndex % slideItems.length);
      }
    }, [currentIndex, slideItems.length]);

    useEffect(() => {
      if (slideItems.length === 0) {
        setIsImageUnavailable(true);
        return;
      }

      setCurrentIndex(0);
      setIsTransitioning(true);
      setIsImageUnavailable(false);

      setLoadedIndices(
        new Set(
          Array.from(
            { length: Math.max(slideItems.length + (slideItems.length > 1 ? 1 : 0), 1) },
            (_, i) => i,
          ),
        ),
      );
    }, [restaurant?.id, restaurant?.slug, restaurant?.updatedAt, slideItems]);

    // Swipe: horizontal drag > 50px goes to next / previous slide (web touchstart/move/end)
    const handlersRef = useRef({ handleNext, handlePrev });
    handlersRef.current = { handleNext, handlePrev };
    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
          onPanResponderTerminationRequest: () => false,
          onPanResponderRelease: (_, g) => {
            const diff = -g.dx;
            const minSwipeDistance = 50;
            if (Math.abs(diff) > minSwipeDistance) {
              if (diff > 0) handlersRef.current.handleNext();
              else handlersRef.current.handlePrev();
            }
          },
        }),
      [],
    );

    const handleDishClick = (dish) => {
      if (!dish) return;
      const targetId = getRestaurantRouteId(restaurant);
      if (!targetId) return;
      const fromPath = backFrom || getAppRoutePath();
      const browseFocusId =
        focusId || restaurant?.id || restaurant?.restaurantId || restaurant?.mongoId || "";

      const payload = {
        path: fromPath,
        scrollY: Math.max(getBrowseScrollY(fromPath), 0),
        focusId: browseFocusId,
        visibleCount,
      };
      // Category pages need durable in-memory click (survives 2nd back)
      if (String(fromPath || "").includes("/category/")) {
        saveCategoryBrowseClick(payload);
      } else {
        saveBrowseScroll(payload);
      }

      navigate(toFoodUserPath(`/user/restaurants/${targetId}?dish=${dish.id}`), {
        state: {
          from: fromPath || undefined,
          restaurantData: restaurant,
        },
      });
    };

    const showMultipleImages = slideItems.length > 1;
    const currentSlide = infiniteSlides[currentIndex] || null;
    const isDishVeg = currentSlide?.dish ? isVegMenuItem(currentSlide.dish) : false;
    const corner = roundedStyle || roundedClassToStyle(roundedClass);

    return (
      <View
        ref={carouselRef}
        collapsable={false}
        style={[s.root, corner, style]}
        onLayout={(e) => setSlideWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <Animated.View style={[s.track, { width: slideWidth * Math.max(infiniteSlides.length, 1), transform: [{ translateX }] }]}>
          {infiniteSlides.map((item, idx) => {
            const shouldLoad = loadedIndices.has(idx);
            return (
              <View key={`${item.id}-${idx}`} style={[s.slide, { width: slideWidth }]}>
                {shouldLoad ? (
                  <OptimizedImage
                    src={item.src}
                    alt={`${restaurant.name} - Image ${idx + 1}`}
                    style={s.fill}
                    objectFit="cover"
                    responsive={false}
                    priority={priority && idx === 0}
                    placeholder="empty"
                    onError={() => {
                      if (idx === currentIndex && slideItems.length === 1) setIsImageUnavailable(true);
                    }}
                  />
                ) : (
                  <Skeleton width="100%" height="100%" rounded={0} style={StyleSheet.absoluteFill} />
                )}
              </View>
            );
          })}
        </Animated.View>

        {/* Tap on a dish slide opens that dish (web: onClick on the carousel, stops the card link) */}
        {currentSlide?.dish ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => handleDishClick(currentSlide.dish)} />
        ) : null}

        {/* Soft top scrim so dish badge stays readable on bright images */}
        {currentSlide?.dish ? (
          <LinearGradient
            colors={[alpha(colors.black, 0.45), "transparent"]}
            style={s.scrim}
            pointerEvents="none"
          />
        ) : null}

        {currentSlide?.dish ? (
          <View style={[s.dishBadgeWrap, slideWidth > 0 && { maxWidth: slideWidth - 72 }]} pointerEvents="none">
            <View style={s.dishBadge}>
              {!vegMode &&
                (isDishVeg || currentSlide.dish.foodType === "Veg" ? (
                  <View style={[s.vegBox, { borderColor: colors.green[600] }]}>
                    <View style={[s.vegDot, { backgroundColor: colors.green[600] }]} />
                  </View>
                ) : (
                  <View style={[s.vegBox, { borderColor: colors.red[600] }]}>
                    <View style={[s.vegDot, { backgroundColor: colors.red[600] }]} />
                  </View>
                ))}
              <View style={s.dishTextRow}>
                <Text style={s.dishName} numberOfLines={1}>
                  {currentSlide.dish.name}
                </Text>
                <Text style={s.dishDot}>•</Text>
                <Text style={s.dishPrice}>₹{currentSlide.dish.price}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {isImageUnavailable && (
          <View style={s.unavailable}>
            <Text style={s.unavailableText}>Image unavailable</Text>
          </View>
        )}

        {showMultipleImages && (
          <View style={s.dots}>
            {slideItems.map((_, index) => (
              <Pressable
                key={index}
                onPress={() => setCurrentIndex(index)}
                style={s.dotBtn}
                hitSlop={4}
                accessibilityLabel={`Go to slide ${index + 1}`}
              >
                <View style={[s.dot, index === displayIndex ? s.dotActive : s.dotInactive]} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  },
);

RestaurantImageCarousel.displayName = "RestaurantImageCarousel";

export default RestaurantImageCarousel;

const useStyles = makeStyles(() => ({
  root: { position: "relative", height: 224, width: "100%", overflow: "hidden", flexShrink: 0 },
  track: { position: "absolute", top: 0, bottom: 0, left: 0, flexDirection: "row" },
  slide: { height: "100%", flexShrink: 0, position: "relative" },
  fill: { width: "100%", height: "100%" },
  scrim: { position: "absolute", left: 0, right: 0, top: 0, height: 64, zIndex: 1 },
  dishBadgeWrap: { position: "absolute", top: sp(3), left: sp(3), zIndex: 2, maxWidth: "80%", ...shadow.lg },
  dishBadge: {
    backgroundColor: alpha(colors.black, 0.92),
    paddingHorizontal: sp(3),
    paddingVertical: sp(1.5),
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: sp(2),
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  vegBox: {
    flexShrink: 0,
    width: 14,
    height: 14,
    borderWidth: 1.5,
    backgroundColor: colors.white,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
    padding: 1.5,
  },
  vegDot: { width: "100%", height: "100%", borderRadius: radius.full },
  dishTextRow: { flexDirection: "row", alignItems: "center", gap: sp(1.5), overflow: "hidden", minWidth: 0, flexShrink: 1 },
  dishName: { color: colors.white, fontWeight: "700", fontSize: 12, lineHeight: 16, letterSpacing: -0.3, flexShrink: 1 },
  dishDot: { color: alpha(colors.white, 0.7), fontWeight: "700", fontSize: 12, lineHeight: 16, flexShrink: 0 },
  dishPrice: { color: colors.white, fontWeight: "900", fontSize: 12, lineHeight: 16, flexShrink: 0 },
  unavailable: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray[100],
  },
  unavailableText: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  dots: { position: "absolute", bottom: sp(3), right: sp(3), zIndex: 2, flexDirection: "row", alignItems: "center", gap: sp(1.5) },
  dotBtn: { paddingVertical: 2, flexDirection: "row", alignItems: "center" },
  dot: { height: 6, borderRadius: radius.full, ...shadow.sm },
  dotActive: { width: 16, backgroundColor: colors.white },
  dotInactive: { width: 6, backgroundColor: alpha(colors.white, 0.5) },
}));
