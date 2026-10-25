// Web: modules/Food/components/user/CategoryBrowseKeepAlive.jsx — keeps the category browse page mounted under
// restaurant details (and the main tabs), so Back from a restaurant is instant. Scroll restore runs only when it
// becomes visible again (restaurant -> back), never on category chip switches.
import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import CategoryPage from '@food/pages/user/CategoryPage';
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons';
import { categoryBrowseNeedsRestore, runCategoryScrollLock } from '@food/utils/browseScrollMemory';

export default function CategoryBrowseKeepAlive({ categorySlug, isVisible }) {
  const [mountedSlug, setMountedSlug] = useState(categorySlug || null);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (categorySlug) setMountedSlug(categorySlug);
  }, [categorySlug]);

  useLayoutEffect(() => {
    const becameVisible = isVisible && !wasVisibleRef.current;
    wasVisibleRef.current = isVisible;

    if (!isVisible) return undefined;
    // Chip / URL slug change while already browsing — leave scroll alone.
    if (!becameVisible) return undefined;
    if (!categoryBrowseNeedsRestore()) return undefined;
    return runCategoryScrollLock({ durationMs: 100 });
  }, [isVisible, categorySlug]);

  if (!mountedSlug) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, !isVisible && { display: 'none' }]}
      pointerEvents={isVisible ? 'auto' : 'none'}
      accessibilityElementsHidden={!isVisible}
      importantForAccessibility={isVisible ? 'auto' : 'no-hide-descendants'}
    >
      <Suspense fallback={isVisible ? <AppShellSkeleton /> : null}>
        <CategoryPage embeddedCategorySlug={mountedSlug} isBrowseActive={isVisible} disableAutoScroll />
      </Suspense>
    </View>
  );
}
