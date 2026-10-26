// Web: modules/Taxi/modules/driver/pages/settings/Referral.jsx — the driver's referral code (copy / share), the share
// link, and the admin's "How it works?" texts for the driver's language.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RenderHTML from 'react-native-render-html';
import { ArrowLeft, CheckCircle2, Copy, Gift, Loader2, Share2 } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Screen, Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, fonts, shadow } from '@/theme';
import { fontAssets, resolveFont } from '@/theme/fonts';
import { getCurrentDriver } from '../../services/registrationService';
import {
  getReferralSettingsContent,
  getReferralTranslationContent,
} from '../../../shared/services/referralTranslationService';
import {
  applyReferralSettingPlaceholders,
  buildReferralPreviewBlocks,
  DRIVER_REFERRAL_TRANSLATION_FIELDS,
  getStoredReferralLanguageCode,
} from '../../../shared/utils/referralTranslationFields';
import { useSettings } from '../../../../shared/context/SettingsContext';
import useAppLinks from '@/shared/hooks/useAppLinks';
import ShareSheet, { shareMessage } from '@/shared/components/ShareSheet';
import { getPublicAppOrigin } from '@/shared/utils/shareLinks';

const PAGE_BG = '#f5f7fb';
const BRAND_BLUE = '#1830b8';
const SYSTEM_FONTS = Object.keys(fontAssets);
const htmlFont = (weight) => resolveFont(fonts.outfit, weight);

const readStoredDriverInfo = () => {
  try {
    return JSON.parse(localStorage.getItem('driverInfo') || '{}');
  } catch {
    return {};
  }
};

const LEGACY_BRAND_REGEX = /\bzyder\b/gi;

const replaceLegacyReferralBrand = (value, appName) => {
  const safeAppName = String(appName || '').trim() || 'App';
  return String(value || '').replace(LEGACY_BRAND_REGEX, safeAppName);
};

const HTML_BASE = { fontFamily: htmlFont(400), fontSize: 14, lineHeight: 24, color: colors.gray[800] };
const HTML_TAGS = {
  p: { marginTop: 0, marginBottom: 8 },
  strong: { fontFamily: htmlFont(700), color: colors.gray[900] },
  b: { fontFamily: htmlFont(700), color: colors.gray[900] },
  ul: { marginTop: 0, marginBottom: 8, paddingLeft: 18 },
  ol: { marginTop: 0, marginBottom: 8, paddingLeft: 18 },
  li: { marginBottom: 4 },
};

// "Referral code copied" pill at the bottom (fades / slides in like the web's motion.div).
const CopiedPill = ({ visible, bottom }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    const a = Animated.timing(anim, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true });
    a.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => a.stop();
  }, [visible, anim]);

  if (!mounted) return null;
  return (
    <View pointerEvents="none" style={[styles.pillWrap, { bottom }]}>
      <Animated.View
        style={[
          styles.pill,
          { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
        ]}
      >
        <Text style={styles.pillText}>Referral code copied</Text>
      </Animated.View>
    </View>
  );
};

const DriverReferral = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { settings } = useSettings();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const [activeTab, setActiveTab] = useState('refer');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const copiedTimer = useRef(null);
  const [driverProfile, setDriverProfile] = useState(() => {
    const stored = readStoredDriverInfo();
    return {
      referralCode: stored.referralCode || '',
    };
  });
  const [translation, setTranslation] = useState({
    language_code: 'en',
    driver_referral: {
      instant_referrer_user: '',
      instant_referrer_user_and_new_user: '',
      conditional_referrer_user_ride_count: '',
      conditional_referrer_user_earnings: '',
      dual_conditional_referrer_user_and_new_user_ride_count: '',
      dual_conditional_referrer_user_and_new_user_earnings: '',
      banner_text: '',
    },
  });

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  useEffect(() => {
    const loadDriverReferral = async () => {
      setLoading(true);
      const languageCode = getStoredReferralLanguageCode('driver');
      const stored = readStoredDriverInfo();
      const fallbackDriverSection = {
        instant_referrer_user: '',
        instant_referrer_user_and_new_user: '',
        conditional_referrer_user_ride_count: '',
        conditional_referrer_user_earnings: '',
        dual_conditional_referrer_user_and_new_user_ride_count: '',
        dual_conditional_referrer_user_and_new_user_earnings: '',
        banner_text: '',
      };

      try {
        const [driverResponse, translationResponse, settingsResponse] = await Promise.all([
          getCurrentDriver(),
          getReferralTranslationContent(languageCode),
          getReferralSettingsContent('driver'),
        ]);

        const driver = driverResponse?.data || {};
        const translationData = translationResponse?.data || {};
        const settingsData = settingsResponse?.data || {};
        const hydratedDriverReferral = applyReferralSettingPlaceholders(
          translationData.driver_referral || fallbackDriverSection,
          settingsData,
        );

        setDriverProfile({
          referralCode: driver.referralCode || stored.referralCode || '',
        });
        setTranslation({
          language_code: translationData.language_code || languageCode,
          driver_referral: hydratedDriverReferral,
        });

        localStorage.setItem(
          'driverInfo',
          JSON.stringify({
            ...stored,
            referralCode: driver.referralCode || '',
          }),
        );
      } catch {
        try {
          const [translationResponse, settingsResponse] = await Promise.all([
            getReferralTranslationContent(languageCode),
            getReferralSettingsContent('driver'),
          ]);
          setTranslation({
            language_code: translationResponse?.data?.language_code || languageCode,
            driver_referral: applyReferralSettingPlaceholders(
              translationResponse?.data?.driver_referral || fallbackDriverSection,
              settingsResponse?.data || {},
            ),
          });
        } catch {
          // Keep local fallback state.
        }
      } finally {
        setLoading(false);
      }
    };

    loadDriverReferral();
  }, []);

  const appName = settings.general?.app_name || 'App';
  const referralCode = driverProfile.referralCode || '';
  const normalizedDriverReferral = Object.fromEntries(
    Object.entries(translation.driver_referral || {}).map(([key, value]) => [
      key,
      replaceLegacyReferralBrand(value, appName),
    ]),
  );
  const bannerText = normalizedDriverReferral.banner_text || `${appName} Refer and Earn`;
  const infoBlocks = buildReferralPreviewBlocks(
    normalizedDriverReferral,
    DRIVER_REFERRAL_TRANSLATION_FIELDS,
  );
  const referralShareLink = referralCode
    ? `${getPublicAppOrigin()}/taxi/driver/reg-phone?ref=${encodeURIComponent(referralCode)}`
    : '';

  const showCopied = () => {
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1800);
  };

  const handleCopy = async () => {
    if (!referralCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(referralCode);
      showCopied();
    } catch {
      // Ignore clipboard failures silently.
    }
  };

  const appLinks = useAppLinks();
  const [shareSheet, setShareSheet] = useState({ open: false, text: '' });

  const handleShare = async () => {
    if (!referralCode) {
      return;
    }
    // The captain app link when one is set (Backend/.env APP_LINK_CAPTAIN, or VITE_DRIVER_APP_URL); else the website sign-up link.
    const appDownloadUrl = appLinks.captain || String(globalThis.__ENV__?.VITE_DRIVER_APP_URL || '').trim();
    const shareText = appDownloadUrl
      ? [
        bannerText,
        `Join as a driver: download the app and use my referral code ${referralCode} when you sign up.`,
        appDownloadUrl,
      ].join('\n')
      : [
        bannerText,
        `Join as a driver with my referral code ${referralCode}.`,
        `Sign up: ${referralShareLink}`,
      ].join('\n');

    const result = await shareMessage({ title: bannerText, text: shareText });
    if (result === 'unsupported') {
      setShareSheet({ open: true, text: shareText });
    }
  };

  const tabStyle = (id) => [styles.tab, activeTab === id ? styles.tabOn : styles.tabOff];
  const tabTextStyle = (id) => [styles.tabText, { color: activeTab === id ? colors.gray[900] : colors.gray[500] }];

  return (
    <Screen bg={PAGE_BG} edges={['top']}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigate(`${routePrefix}/profile`)} accessibilityLabel="Back" style={styles.back}>
            <ArrowLeft size={18} color={colors.gray[900]} strokeWidth={2.3} />
          </Pressable>
          <Text style={styles.headerTitle}>Referrals</Text>
        </View>

        <View style={styles.cardWrap}>
          <View style={styles.card}>
            <View style={styles.banner}>
              <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>{bannerText}</Text>
                <Text style={styles.bannerLang}>Language: {translation.language_code?.toUpperCase() || 'EN'}</Text>
              </View>
              <View style={styles.bannerIcon}>
                <Gift size={20} color={colors.white} />
              </View>
            </View>

            <View style={styles.codeArea}>
              <View style={styles.codeBox}>
                <Text style={styles.codeText}>{referralCode || 'Not available'}</Text>
                <Text style={styles.codeLabel}>Your referral code</Text>
              </View>
              <View style={styles.btnRow}>
                <Pressable
                  onPress={handleCopy}
                  disabled={!referralCode}
                  style={[styles.actionBtn, { backgroundColor: BRAND_BLUE }, !referralCode && styles.disabled]}
                >
                  {copied ? <CheckCircle2 size={15} color={colors.white} /> : <Copy size={15} color={colors.white} />}
                  <Text style={styles.actionText}>Copy</Text>
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  disabled={!referralCode}
                  style={[styles.actionBtn, { backgroundColor: '#ef4444' }, !referralCode && styles.disabled]}
                >
                  <Text style={styles.actionText}>Share</Text>
                  <Share2 size={15} color={colors.white} />
                </Pressable>
              </View>

              <View style={styles.linkBox}>
                <Text style={styles.linkLabel}>Share link</Text>
                <Text style={styles.linkText}>
                  {referralShareLink || 'Share link will appear once your referral code is ready.'}
                </Text>
              </View>

              <View style={styles.tabRow}>
                <Pressable onPress={() => setActiveTab('refer')} style={tabStyle('refer')}>
                  <Text style={tabTextStyle('refer')}>Refer and earn</Text>
                </Pressable>
                <Pressable onPress={() => setActiveTab('history')} style={tabStyle('history')}>
                  <Text style={tabTextStyle('history')}>Referral history</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.content}>
              {loading ? (
                <View style={styles.loading}>
                  <Spin>
                    <Loader2 size={26} color={BRAND_BLUE} />
                  </Spin>
                </View>
              ) : activeTab === 'refer' ? (
                <View style={styles.howList}>
                  <Text style={styles.howTitle}>How it works?</Text>
                  {infoBlocks.length === 0 ? (
                    <Text style={styles.howEmpty}>Referral content will appear here after admin updates this language.</Text>
                  ) : (
                    infoBlocks.map((block) => (
                      <RenderHTML
                        key={block.key}
                        contentWidth={Math.max(0, Math.min(width, 448) - 72)}
                        source={{ html: String(block.html || '') }}
                        baseStyle={HTML_BASE}
                        systemFonts={SYSTEM_FONTS}
                        tagsStyles={HTML_TAGS}
                      />
                    ))
                  )}
                </View>
              ) : (
                <View style={styles.historyBox}>
                  <Text style={styles.historyTitle}>Referral history</Text>
                  <Text style={styles.historyText}>Detailed driver referral history is not available on this screen yet.</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <CopiedPill visible={copied} bottom={40 + insets.bottom} />
      <ShareSheet
        open={shareSheet.open}
        text={shareSheet.text}
        onClose={() => setShareSheet({ open: false, text: '' })}
        onCopied={showCopied}
      />
    </Screen>
  );
};

export default DriverReferral;

const styles = StyleSheet.create({
  header: {
    zIndex: 30,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: PAGE_BG,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  headerTitle: { fontSize: 19, lineHeight: 26, fontWeight: '600', color: colors.gray[900] },
  cardWrap: { paddingHorizontal: 20 },
  card: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...shadow.sm,
  },
  banner: { backgroundColor: BRAND_BLUE, paddingHorizontal: 20, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerText: { flexShrink: 1, paddingRight: 8 },
  bannerTitle: { fontSize: 26, lineHeight: 32, fontWeight: '600', color: colors.white },
  bannerLang: { fontSize: 11, lineHeight: 16, color: colors.indigo[100], marginTop: 4 },
  bannerIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: alpha(colors.white, 0.15), alignItems: 'center', justifyContent: 'center' },
  codeArea: { paddingHorizontal: 16, paddingVertical: 16 },
  codeBox: { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gray[300], paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center' },
  codeText: { fontSize: 18, lineHeight: 28, fontWeight: '600', letterSpacing: 0.45, color: colors.gray[900], textAlign: 'center' },
  codeLabel: { fontSize: 10, lineHeight: 14, color: colors.gray[400], marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: { flex: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { opacity: 0.5 },
  actionText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.white },
  linkBox: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.gray[50], paddingHorizontal: 12, paddingVertical: 12 },
  linkLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.6, color: colors.gray[400] },
  linkText: { marginTop: 4, fontSize: 12, lineHeight: 16, color: colors.gray[700] },
  tabRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tab: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 1 },
  tabOn: { backgroundColor: colors.white, borderColor: colors.gray[200] },
  tabOff: { backgroundColor: colors.gray[100], borderColor: colors.gray[100] },
  tabText: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  content: { paddingHorizontal: 16, paddingBottom: 16, minHeight: 340 },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  howList: { gap: 16 },
  howTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: colors.gray[900] },
  howEmpty: { fontSize: 14, lineHeight: 20, color: colors.gray[400] },
  historyBox: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gray[200], backgroundColor: colors.gray[50], paddingHorizontal: 20, paddingVertical: 32, alignItems: 'center' },
  historyTitle: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900] },
  historyText: { fontSize: 12, lineHeight: 16, color: colors.gray[400], marginTop: 8, textAlign: 'center' },
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: { borderRadius: 16, backgroundColor: colors.gray[900], paddingHorizontal: 16, paddingVertical: 12, ...shadow.xl },
  pillText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.white },
});
