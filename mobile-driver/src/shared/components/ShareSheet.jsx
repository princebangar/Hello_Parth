import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Copy, MessageCircle, MessageSquareText, X } from 'lucide-react-native';
import { Sheet, Text } from '@/native/ui';
import { colors, makeStyles } from '@/theme';

/**
 * Share a message with the phone's share sheet (navigator.share -> React Native Share in the app), otherwise this
 * small sheet: WhatsApp / SMS / Copy.
 *
 *   const result = await shareMessage({ title, text });  // 'shared' | 'cancelled' | 'unsupported'
 *   if (result === 'unsupported') setSheetOpen(true);
 */
export const shareMessage = async ({ title = '', text = '', url = '' }) => {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }

  try {
    await navigator.share({ title, text, ...(url ? { url } : {}) });
    return 'shared';
  } catch (error) {
    return error?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
};

export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const ShareSheet = ({ open, text, onClose, onCopied }) => {
  const s = useStyles();
  const encoded = encodeURIComponent(text || '');

  const openLink = (url) => {
    onClose?.();
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Sheet open={Boolean(open)} onClose={onClose} backdropOpacity={0.45} style={s.sheet}>
      <View accessibilityLabel="Share" style={s.inner}>
        <View style={s.header}>
          <Text style={s.title}>Share via</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close" style={s.close}>
            <X size={16} color={colors.slate[600]} />
          </Pressable>
        </View>
        <View style={s.grid}>
          <Pressable onPress={() => openLink(`https://wa.me/?text=${encoded}`)} style={s.tile}>
            <MessageCircle size={22} color={colors.emerald[600]} />
            <Text style={s.tileText}>WhatsApp</Text>
          </Pressable>
          <Pressable onPress={() => openLink(`sms:?&body=${encoded}`)} style={s.tile}>
            <MessageSquareText size={22} color={colors.blue[600]} />
            <Text style={s.tileText}>SMS</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              const ok = await copyToClipboard(text || '');
              if (ok) onCopied?.();
              onClose?.();
            }}
            style={s.tile}
          >
            <Copy size={22} color={colors.slate[600]} />
            <Text style={s.tileText}>Copy</Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
};

// The web sheet is always light (plain white / slate classes, no dark: variants).
const useStyles = makeStyles(() => ({
  sheet: { backgroundColor: colors.white, maxWidth: 512, alignSelf: 'center', width: '100%' },
  inner: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  header: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.slate[900] },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    paddingVertical: 16,
  },
  tileText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[800] },
}));

export default ShareSheet;
