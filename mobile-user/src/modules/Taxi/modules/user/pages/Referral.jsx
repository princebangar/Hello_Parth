// Web: modules/Taxi/modules/user/pages/Referral.jsx — referral code (copy / share), admin "how it works" content
// (HTML -> react-native-render-html) and referral history.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import RenderHTML from 'react-native-render-html';
import { ArrowLeft, CheckCircle2, Copy, Gift, Loader2, Share2 } from 'lucide-react-native';
import useReferralEnabled from '@/shared/hooks/useReferralEnabled';
import { useNavigate } from '@/lib/router';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, fonts } from '@/theme';
import { fontAssets, resolveFont } from '@/theme/fonts';
import { userAuthService } from '../services/authService';
import {
  getReferralSettingsContent,
  getReferralTranslationContent,
} from '../../shared/services/referralTranslationService';
import {
  applyReferralSettingPlaceholders,
  buildReferralPreviewBlocks,
  getStoredReferralLanguageCode,
  USER_REFERRAL_TRANSLATION_FIELDS,
} from '../../shared/utils/referralTranslationFields';
import { useSettings } from '../../../shared/context/SettingsContext';
import NumberSkeleton from '@/shared/components/NumberSkeleton';
import { USER_SHADOW, useUserPalette } from '../../../shared/context/UserThemeContext';
import useAppLinks from '@/shared/hooks/useAppLinks';
import ShareSheet, { shareMessage } from '@/shared/components/ShareSheet';
import { getPublicAppOrigin } from '@/shared/utils/shareLinks';

const readStoredUserInfo = () => {
  try {
    return JSON.parse(localStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

const SYSTEM_FONTS = Object.keys(fontAssets);
const htmlFont = (weight) => resolveFont(fonts.outfit, weight);

const LEGACY_BRAND_REGEX = /\bzyder\b/gi;

const replaceLegacyReferralBrand = (value, appName) => {
  const safeAppName = String(appName || '').trim() || 'App';
  return String(value || '').replace(LEGACY_BRAND_REGEX, safeAppName);
};

const Referral = () => {
  const navigate = useNavigate();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const referralEnabled = useReferralEnabled();
  const { settings } = useSettings();
  const isDark = P.dark; // the web read useUserTheme(); same setting (userTheme)
  const [activeTab, setActiveTab] = useState('refer');
  // friends who joined with my code + what I earned (server: /users/referrals)
  const [overview, setOverview] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(() => {
    const stored = readStoredUserInfo();
    return {
      referralCode: stored.referralCode || '',
      // saved by an earlier visit -> shown at once; never loaded yet -> null (skeleton, not a fake 0)
      referralCount: stored.referralCount === undefined || stored.referralCount === null ? null : Number(stored.referralCount) || 0,
    };
  });
  const [translation, setTranslation] = useState({
    language_code: 'en',
    user_referral: {
      instant_referrer_user: '',
      instant_referrer_user_and_new_user: '',
      conditional_referrer_user_ride_count: '',
      conditional_referrer_user_earnings: '',
      dual_conditional_referrer_user_and_new_user_ride_count: '',
      dual_conditional_referrer_user_and_new_user_earnings: '',
      banner_text: '',
    },
  });
  const copiedTimer = useRef(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  useEffect(() => {
    Animated.timing(toastAnim, { toValue: copied ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [copied, toastAnim]);

  useEffect(() => {
    const loadReferralPage = async () => {
      setLoading(true);

      const languageCode = getStoredReferralLanguageCode('user');
      const stored = readStoredUserInfo();
      const fallbackUserSection = {
        instant_referrer_user: '',
        instant_referrer_user_and_new_user: '',
        conditional_referrer_user_ride_count: '',
        conditional_referrer_user_earnings: '',
        dual_conditional_referrer_user_and_new_user_ride_count: '',
        dual_conditional_referrer_user_and_new_user_earnings: '',
        banner_text: '',
      };

      try {
        const [userResponse, translationResponse, settingsResponse] = await Promise.all([
          userAuthService.getCurrentUser(),
          getReferralTranslationContent(languageCode),
          getReferralSettingsContent('user'),
        ]);

        userAuthService.getReferralOverview().then((response) => setOverview(response?.data || null)).catch(() => {});
        const user = userResponse?.data?.user || {};
        const translationData = translationResponse?.data || {};
        const settingsData = settingsResponse?.data || {};
        const hydratedUserReferral = applyReferralSettingPlaceholders(
          translationData.user_referral || fallbackUserSection,
          settingsData,
        );

        setProfile({
          referralCode: user.referralCode || stored.referralCode || '',
          referralCount: Number(user.referralCount || 0),
        });
        setTranslation({
          language_code: translationData.language_code || languageCode,
          user_referral: hydratedUserReferral,
        });

        localStorage.setItem(
          'userInfo',
          JSON.stringify({
            ...stored,
            referralCode: user.referralCode || '',
            referralCount: Number(user.referralCount || 0),
          }),
        );
      } catch {
        try {
          const [translationResponse, settingsResponse] = await Promise.all([
            getReferralTranslationContent(languageCode),
            getReferralSettingsContent('user'),
          ]);
          setTranslation({
            language_code: translationResponse?.data?.language_code || languageCode,
            user_referral: applyReferralSettingPlaceholders(
              translationResponse?.data?.user_referral || fallbackUserSection,
              settingsResponse?.data || {},
            ),
          });
        } catch {
          // Keep local fallback state.
        }
      } finally {
        setLoading(false);
        setProfile((current) => (current.referralCount === null ? { ...current, referralCount: 0 } : current));
      }
    };

    loadReferralPage();
  }, []);

  const appName = settings.general?.app_name || 'App';
  const referralCode = profile.referralCode || '';
  const normalizedUserReferral = Object.fromEntries(
    Object.entries(translation.user_referral || {}).map(([key, value]) => [
      key,
      replaceLegacyReferralBrand(value, appName),
    ]),
  );
  const bannerText = normalizedUserReferral.banner_text || `${appName} Refer and Earn`;
  const infoBlocks = buildReferralPreviewBlocks(
    normalizedUserReferral,
    USER_REFERRAL_TRANSLATION_FIELDS,
  );

  const flashCopied = () => {
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
      flashCopied();
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
    // The app link when one is set (Backend/.env APP_LINK_USER); until then the website sign-up link.
    const webLink = `${getPublicAppOrigin()}/login?ref=${encodeURIComponent(referralCode)}`;
    const shareText = appLinks.user
      ? `${bannerText}\nDownload the app and use my referral code ${referralCode} when you sign up.\n${appLinks.user}`
      : `${bannerText}\nUse my referral code ${referralCode} to sign up.\n${webLink}`;

    const result = await shareMessage({ title: bannerText, text: shareText });
    if (result === 'unsupported') {
      setShareSheet({ open: true, text: shareText });
    }
  };

  const card = { backgroundColor: P.cardBg, borderColor: P.border };
  const soft30 = isDark ? alpha(colors.slate[950], 0.3) : P.cardBg;
  const htmlColor = isDark ? P.textSecondary : P.textPrimary;
  const htmlBase = { fontFamily: htmlFont(400), fontSize: 14, lineHeight: 24, color: htmlColor };

  const tab = (id, label) => {
    const on = activeTab === id;
    const style = on
      ? isDark
        ? [{ backgroundColor: P.accent, borderWidth: 1, borderColor: P.border }, USER_SHADOW]
        : [{ backgroundColor: P.cardBg, borderWidth: 1, borderColor: P.border }, USER_SHADOW]
      : null;
    const color = on ? (isDark ? P.accentInk : P.textPrimary) : isDark ? P.textSecondary : P.textMuted;
    return (
      <Pressable key={id} onPress={() => setActiveTab(id)} style={[styles.tab, style]}>
        <Text style={[styles.tabText, { color }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Screen bg={P.bg} edges={[]}>
      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, USER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={[styles.row, { gap: 12 }]}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [styles.back, USER_SHADOW, card, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={18} color={P.textPrimary} strokeWidth={2.3} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', paddingRight: 48 }}>
            <Text style={[styles.h1, { color: P.textPrimary }]}>Referrals</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 112 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {!referralEnabled ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <View style={[styles.offCard, USER_SHADOW, card]}>
              <Text style={[styles.offTitle, { color: P.textPrimary }]}>Referral program is off right now</Text>
              <Text style={[styles.offText, { color: P.textSecondary }]}>New referral rewards are paused. Check back later.</Text>
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <View style={[styles.mainCard, USER_SHADOW, card]}>
              <View style={[styles.banner, { borderBottomColor: isDark ? P.border : alpha(colors.yellow[200], 0.5), backgroundColor: isDark ? P.cardBg : 'transparent' }]}>
                {!isDark ? (
                  <LinearGradient
                    colors={[colors.amber[100], colors.yellow[100], colors.yellow[50]]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.bannerTitle, { color: P.textPrimary }]}>{bannerText}</Text>
                  <Text style={[styles.lang, { color: isDark ? P.textSecondary : P.textMuted, fontWeight: isDark ? '500' : '600' }]}>
                    Language: {translation.language_code?.toUpperCase() || 'EN'}
                  </Text>
                </View>
                {isDark ? (
                  <View style={[styles.giftBox, { backgroundColor: P.cardSoft }]}>
                    <Gift size={20} color={P.textPrimary} />
                  </View>
                ) : (
                  <LinearGradient colors={[colors.violet[500], colors.indigo[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.giftBox, USER_SHADOW]}>
                    <Gift size={20} color={P.textPrimary} />
                  </LinearGradient>
                )}
              </View>

              <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
                <View style={[styles.row, { gap: 8, alignItems: 'stretch' }]}>
                  <View style={[styles.codeBox, { borderColor: P.border, backgroundColor: isDark ? alpha(colors.slate[950], 0.5) : P.cardBg }]}>
                    <Text style={[styles.code, { color: P.textPrimary }]}>{referralCode || 'Not available'}</Text>
                    <Text style={[styles.codeLabel, { color: isDark ? P.textMuted : P.textSecondary }]}>YOUR REFERRAL CODE</Text>
                  </View>
                  <Pressable
                    onPress={handleCopy}
                    disabled={!referralCode}
                    style={({ pressed }) => [
                      styles.copyBtn,
                      { backgroundColor: P.cardBg, opacity: referralCode ? 1 : 0.5 },
                      pressed && { transform: [{ scale: 0.95 }] },
                    ]}
                  >
                    {copied ? <CheckCircle2 size={15} color={P.textPrimary} /> : <Copy size={15} color={P.textPrimary} />}
                    <Text style={[styles.copyText, { color: P.textPrimary }]}>Copy</Text>
                  </Pressable>
                </View>

                <View style={[styles.tabs, { backgroundColor: isDark ? alpha(colors.slate[950], 0.4) : P.cardSoft }]}>
                  {tab('refer', 'Refer and earn')}
                  {tab('history', 'Referral history')}
                </View>
              </View>

              <View style={styles.content}>
                {loading ? (
                  <View style={styles.loading}>
                    <Spin>
                      <Loader2 color={P.textPrimary} size={26} />
                    </Spin>
                  </View>
                ) : activeTab === 'refer' ? (
                  <View style={{ gap: 16 }}>
                    <Text style={[styles.how, { color: P.textPrimary }]}>How it works?</Text>
                    {infoBlocks.length === 0 ? (
                      <Text style={[styles.small, { color: P.textSecondary }]}>Referral content will appear here after admin updates this language.</Text>
                    ) : (
                      infoBlocks.map((block) => (
                        <RenderHTML
                          key={block.key}
                          contentWidth={Math.max(0, width - 72)}
                          source={{ html: String(block.html || '') }}
                          baseStyle={htmlBase}
                          systemFonts={SYSTEM_FONTS}
                          tagsStyles={{
                            p: { marginTop: 0, marginBottom: 8 },
                            strong: { fontFamily: htmlFont(700), color: isDark ? '#ffffff' : '#111827' },
                            b: { fontFamily: htmlFont(700), color: isDark ? '#ffffff' : '#111827' },
                            a: { color: isDark ? '#ffffff' : '#111827', textDecorationLine: 'underline' },
                            li: { marginBottom: 4 },
                          }}
                        />
                      ))
                    )}
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    <View style={[styles.row, { gap: 12, alignItems: 'stretch' }]}>
                      <View style={[styles.statBox, { borderColor: P.border, backgroundColor: soft30 }]}>
                        <Text style={[styles.statLabel, { color: isDark ? P.textSecondary : P.textMuted }]}>FRIENDS JOINED</Text>
                        <View style={styles.statValueBox}>
                          {overview || profile.referralCount !== null ? (
                            <Text style={[styles.statValue, { color: P.textPrimary }]}>{overview ? overview.referralCount : profile.referralCount}</Text>
                          ) : (
                            <NumberSkeleton fontSize={30} color={P.textPrimary} />
                          )}
                        </View>
                      </View>
                      <View style={[styles.statBox, { borderColor: P.border, backgroundColor: soft30 }]}>
                        <Text style={[styles.statLabel, { color: isDark ? P.textSecondary : P.textMuted }]}>YOU EARNED</Text>
                        <View style={styles.statValueBox}>
                          {overview ? (
                            <Text style={[styles.statValue, { color: P.textPrimary }]}>{`Rs ${Number(overview.totalEarnings || 0).toLocaleString('en-IN')}`}</Text>
                          ) : (
                            <NumberSkeleton fontSize={30} color={P.textPrimary} />
                          )}
                        </View>
                      </View>
                    </View>
                    {overview?.reward?.amount > 0 ? (
                      <Text style={[styles.reward, { color: isDark ? P.textSecondary : P.textMuted }]}>
                        Reward: Rs {overview.reward.amount} per friend
                        {overview.reward.ridesNeeded ? ` after they finish ${overview.reward.ridesNeeded} ride${overview.reward.ridesNeeded > 1 ? 's' : ''}` : ' as soon as they sign up'}
                        {overview.reward.newUserAlsoGets ? ' (your friend gets it too)' : ''}.
                      </Text>
                    ) : null}
                    {overview && (overview.friends || []).length === 0 ? (
                      <Text style={[styles.noFriends, { color: P.textSecondary }]}>No friend has joined with your code yet.</Text>
                    ) : null}
                    {(overview?.friends || []).map((friend) => (
                      <View key={friend.id} style={[styles.friend, { borderColor: P.border, backgroundColor: soft30 }]}>
                        <View style={{ minWidth: 0, flex: 1 }}>
                          <Text numberOfLines={1} style={[styles.friendName, { color: P.textPrimary }]}>{friend.name}</Text>
                          <Text style={[styles.friendSub, { color: P.textSecondary }]}>
                            {friend.phone}{friend.joinedAt ? ` - joined ${new Date(friend.joinedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          {friend.status === 'credited' ? (
                            <Text style={styles.credited}>+ Rs {friend.amount}</Text>
                          ) : (
                            <Text style={styles.pending}>Pending - {friend.ridesDone}/{friend.ridesNeeded} rides</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <Pressable
              onPress={handleShare}
              disabled={!referralCode}
              style={({ pressed }) => [
                styles.referBtn,
                USER_SHADOW,
                { backgroundColor: isDark ? P.cardBg : P.accent, opacity: referralCode ? 1 : 0.5 },
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              <Text style={[styles.referText, { color: isDark ? P.textPrimary : P.accentInk }]}>Refer now</Text>
              <Share2 size={16} color={isDark ? P.textPrimary : P.accentInk} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      {copied ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            USER_SHADOW,
            {
              bottom: 96 + insets.bottom,
              backgroundColor: P.cardBg,
              borderColor: isDark ? P.border : 'transparent',
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            },
          ]}
        >
          <Text style={[styles.toastText, { color: P.textPrimary }]}>Referral code copied</Text>
        </Animated.View>
      ) : null}
      <ShareSheet
        open={shareSheet.open}
        text={shareSheet.text}
        onClose={() => setShareSheet({ open: false, text: '' })}
        onCopied={flashCopied}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  back: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 19, lineHeight: 26, fontWeight: '700', letterSpacing: -0.47 },
  offCard: { borderRadius: 28, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 32, alignItems: 'center' },
  offTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  offText: { fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  mainCard: { borderRadius: 28, borderWidth: 1, overflow: 'hidden' },
  banner: { paddingHorizontal: 20, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, overflow: 'hidden' },
  bannerTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  lang: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  giftBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  codeBox: { flex: 1, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center' },
  code: { fontSize: 18, lineHeight: 28, fontWeight: '600', letterSpacing: 0.45 },
  codeLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5, marginTop: 4 },
  copyBtn: { borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  copyText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12, padding: 4, borderRadius: 12 },
  tab: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  tabText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingBottom: 16, minHeight: 340 },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  how: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20 },
  statBox: { flex: 1, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16, alignItems: 'center' },
  statLabel: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 0.55, textAlign: 'center' },
  statValueBox: { marginTop: 4, minHeight: 36, justifyContent: 'center' },
  statValue: { fontSize: 30, lineHeight: 36, fontWeight: '700', textAlign: 'center' },
  reward: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  noFriends: { paddingVertical: 24, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  friend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  friendName: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  friendSub: { fontSize: 12, lineHeight: 16 },
  credited: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.emerald[600] },
  pending: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.amber[600] },
  referBtn: { width: '100%', borderRadius: 16, paddingVertical: 16, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  referText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  toast: { position: 'absolute', alignSelf: 'center', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1 },
  toastText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
});

export default Referral;
