import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';
import { Mic, X } from 'lucide-react-native';
import { useVoiceSearch } from '@food/hooks/useVoiceSearch';
import { Text } from '@/native/ui';
import { alpha, colors, fontSize, makeStyles, shadow, sp } from '@/theme';

function PulseRing() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 9999,
        backgroundColor: alpha(colors.red[500], 0.2),
        opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.3, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.5, 2] }) }],
      }}
    />
  );
}

function Bar({ index, active }) {
  const h = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    if (!active) {
      h.stopAnimation();
      h.setValue(8);
      return undefined;
    }
    let loop = null;
    const start = setTimeout(() => {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(h, { toValue: 24, duration: 250, useNativeDriver: false }),
          Animated.timing(h, { toValue: 8, duration: 250, useNativeDriver: false }),
        ]),
      );
      loop.start();
    }, index * 100);
    return () => {
      clearTimeout(start);
      loop?.stop();
    };
  }, [active, h, index]);
  return <Animated.View style={{ width: 6, height: h, backgroundColor: colors.red[500], borderRadius: 9999 }} />;
}

const VoiceSearchOverlay = ({
  isOpen,
  onClose,
  onSearchResult,
  voiceSearch: externalVoiceSearch = null,
  autoStart = true,
}) => {
  const s = useStyles();
  const internalVoiceSearch = useVoiceSearch((result) => {
    onSearchResult(result);
    onClose();
  });

  const voiceSearch = externalVoiceSearch || internalVoiceSearch;
  const {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    clearError,
  } = voiceSearch;

  const enter = useRef(new Animated.Value(0)).current;

  // The voice-search object (and its functions) is a new object on every render. The effect must only follow the popup
  // opening / closing: depending on that object stopped the recognizer on every re-render ("Starting..." for ever).
  const startRef = useRef(startListening);
  const stopRef = useRef(stopListening);
  startRef.current = startListening;
  stopRef.current = stopListening;
  const hasExternal = Boolean(externalVoiceSearch);

  useEffect(() => {
    if (!isOpen) {
      stopRef.current();
      return undefined;
    }

    if (autoStart && !hasExternal) {
      void startRef.current();
    }

    return () => {
      stopRef.current();
    };
  }, [isOpen, autoStart, hasExternal]);

  useEffect(() => {
    if (!isOpen) {
      enter.setValue(0);
      return;
    }
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }).start();
  }, [isOpen, enter]);

  const handleRetry = () => {
    clearError();
    void startListening();
  };

  const handleClose = () => {
    stopListening();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <Animated.View
          style={[
            s.card,
            {
              opacity: enter,
              transform: [
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
              ],
            },
          ]}
        >
          <Pressable onPress={handleClose} style={s.close} accessibilityLabel="Close voice search" hitSlop={6}>
            <X size={20} color={s.closeIcon.color} />
          </Pressable>

          <View style={s.micWrap}>
            <PulseRing />
            <View style={s.mic}>
              <Mic size={40} color={colors.white} strokeWidth={2.5} />
            </View>
          </View>

          <View style={s.textWrap}>
            <Text style={s.title}>
              {error
                ? 'Try again'
                : transcript
                  ? `"${transcript}"`
                  : isListening
                    ? 'Listening...'
                    : 'Starting...'}
            </Text>
            <Text style={s.sub}>
              {error
                ? error
                : transcript
                  ? 'Processing search...'
                  : 'Say a dish or restaurant name'}
            </Text>
          </View>

          {error ? (
            <Pressable onPress={handleRetry} style={({ pressed }) => [s.retry, pressed && { backgroundColor: colors.red[600] }]}>
              <Text style={s.retryText}>Try again</Text>
            </Pressable>
          ) : (
            <View style={s.bars}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Bar key={i} index={i} active={isListening} />
              ))}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.black, 0.8), paddingHorizontal: sp(6) },
  card: {
    width: '100%',
    maxWidth: 384,
    backgroundColor: t.dark ? '#1a1a1a' : colors.white,
    borderRadius: 40,
    padding: sp(10),
    alignItems: 'center',
    overflow: 'hidden',
    ...shadow['2xl'],
  },
  close: {
    position: 'absolute',
    top: sp(5),
    right: sp(5),
    padding: sp(2),
    borderRadius: 9999,
    backgroundColor: t.dark ? alpha(colors.red[950], 0.3) : colors.red[50],
    zIndex: 20,
  },
  closeIcon: { color: t.dark ? colors.red[400] : colors.red[500] },
  micWrap: { marginBottom: sp(8), marginTop: sp(4), width: 96, height: 96 },
  mic: {
    width: 96,
    height: 96,
    borderRadius: 9999,
    backgroundColor: colors.red[500],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
    shadowColor: colors.red[500],
    shadowOpacity: 0.4,
  },
  textWrap: { alignItems: 'center', gap: sp(2) },
  title: { ...fontSize['2xl'], fontWeight: '900', color: t.dark ? colors.white : colors.gray[900], textTransform: 'uppercase', letterSpacing: -0.6, textAlign: 'center' },
  sub: { ...fontSize.base, fontWeight: '500', color: t.dark ? colors.gray[400] : colors.gray[500], paddingHorizontal: sp(4), textAlign: 'center' },
  retry: { marginTop: sp(8), borderRadius: 9999, backgroundColor: colors.red[500], paddingHorizontal: sp(6), paddingVertical: sp(3) },
  retryText: { ...fontSize.sm, fontWeight: '600', color: colors.white },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, marginTop: sp(10) },
}));

export default VoiceSearchOverlay;
