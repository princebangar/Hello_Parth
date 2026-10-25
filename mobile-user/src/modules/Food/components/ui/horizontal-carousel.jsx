// Web: modules/Food/components/ui/horizontal-carousel.tsx. Same export and props (className -> style,
// containerClassName -> containerStyle). A horizontal scroll row (gap-5 px-1 py-4) with an optional header and
// left / right buttons that scroll it by 400px. The web's wheel / touch handlers only kept vertical page scroll
// working next to the horizontal row, which a native horizontal ScrollView does by itself.
import React, { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, shadow } from '@/theme';
import { Button } from '@food/components/ui/button';

const SCROLL_AMOUNT = 400;

export function HorizontalCarousel({ children, style, containerStyle, showControls = true, controlsPosition = 'top-right', header }) {
  const scrollRef = useRef(null);
  const offsetRef = useRef(0);
  const contentWidthRef = useRef(0);
  const viewWidthRef = useRef(0);

  const scroll = (direction) => {
    const max = Math.max(0, contentWidthRef.current - viewWidthRef.current);
    const next = Math.max(0, Math.min(max, offsetRef.current + (direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT)));
    scrollRef.current?.scrollTo({ x: next, animated: true });
  };

  const controlButton = {
    height: 40,
    width: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.gray[200],
    ...shadow.lg,
  };

  return (
    <View style={[{ position: 'relative' }, style]}>
      {header || showControls ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          {header ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>{header}</View> : null}
          {showControls ? (
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, controlsPosition === 'top-left' && { marginLeft: 'auto' }]}>
              <Button variant="ghost" size="icon" style={controlButton} onPress={() => scroll('left')}>
                <ChevronLeft size={20} color={colors.gray[900]} />
              </Button>
              <Button variant="ghost" size="icon" style={controlButton} onPress={() => scroll('right')}>
                <ChevronRight size={20} color={colors.gray[900]} />
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
      <ScrollView style={{ flexGrow: 0 }}
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        onScroll={(e) => {
          offsetRef.current = e.nativeEvent.contentOffset.x;
        }}
        onLayout={(e) => {
          viewWidthRef.current = e.nativeEvent.layout.width;
        }}
        onContentSizeChange={(w) => {
          contentWidthRef.current = w;
        }}
        contentContainerStyle={[{ flexDirection: 'row', gap: 20, paddingHorizontal: 4, paddingVertical: 16 }, containerStyle]}
      >
        {children}
      </ScrollView>
    </View>
  );
}
