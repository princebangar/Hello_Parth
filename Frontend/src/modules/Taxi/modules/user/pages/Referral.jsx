import React, { useEffect, useState } from 'react';
import useReferralEnabled from '@/shared/hooks/useReferralEnabled';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Copy, Gift, Loader2, Share2 } from 'lucide-react';
// ... removed BottomNavbar import ...
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
import { useUserTheme } from '../../../shared/context/UserThemeContext';
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

const LEGACY_BRAND_REGEX = /\bzyder\b/gi;

const replaceLegacyReferralBrand = (value, appName) => {
  const safeAppName = String(appName || '').trim() || 'App';
  return String(value || '').replace(LEGACY_BRAND_REGEX, safeAppName);
};

const Referral = () => {
  const navigate = useNavigate();
  const referralEnabled = useReferralEnabled();
  const { settings } = useSettings();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
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

  const handleCopy = async () => {
    if (!referralCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
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

  return (
    <div className={`min-h-screen max-w-lg mx-auto font-sans pb-28 transition-colors duration-300 ${isDark ? 'bg-slate-950 text-white' : 'bg-[#f5f7fb] text-slate-900'}`}>
      <header className={`px-5 pt-10 pb-4 sticky top-0 z-20 border-b transition-colors duration-300 ${isDark ? 'bg-slate-900/90 border-slate-800 text-white shadow-sm' : 'bg-white border-gray-100 text-slate-900 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shadow-sm transition-all active:scale-95 cursor-pointer ${isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-gray-200 bg-white text-gray-900'}`}
          >
            <ArrowLeft size={18} className={isDark ? 'text-white' : 'text-slate-900'} strokeWidth={2.3} />
          </button>
          <div className="flex-1 text-center pr-12">
            <h1 className={`text-[19px] font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Referrals</h1>
          </div>
        </div>
      </header>

      {!referralEnabled ? (
        <div className="px-5 pt-5">
          <div className={`rounded-[28px] border shadow-sm px-5 py-8 text-center ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
            <p className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Referral program is off right now</p>
            <p className="text-sm text-slate-400 mt-2">New referral rewards are paused. Check back later.</p>
          </div>
        </div>
      ) : (
      <div className="px-5 pt-5">
        <div className={`rounded-[28px] border shadow-sm overflow-hidden transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className={`px-5 py-5 flex items-center justify-between border-b ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-gradient-to-r from-amber-100 via-yellow-100 to-yellow-50 border-yellow-200/50'}`}>
            <div>
              <p className={`text-[26px] font-black leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{bannerText}</p>
              <p className={`text-[11px] mt-1.5 ${isDark ? 'text-slate-400 font-medium' : 'text-slate-500 font-bold'}`}>Language: {translation.language_code?.toUpperCase() || 'EN'}</p>
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-white/10 text-white' : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20'}`}>
              <Gift size={20} />
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className={`rounded-xl border border-dashed px-3 py-3 text-center transition-colors ${isDark ? 'border-slate-800 bg-slate-950/50' : 'border-gray-300 bg-white'}`}>
                <p className={`text-[18px] font-semibold tracking-wide ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {referralCode || 'Not available'}
                </p>
                <p className={`text-[10px] uppercase font-bold tracking-wider mt-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Your referral code</p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!referralCode}
                className={`rounded-xl px-4 text-sm font-semibold flex items-center gap-2 transition-all duration-200 active:scale-95 disabled:opacity-50 ${isDark ? 'bg-white text-slate-950 hover:bg-slate-100' : 'bg-slate-950 text-white hover:bg-slate-900'}`}
              >
                {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                Copy
              </button>
            </div>

            <div className={`grid grid-cols-2 gap-2 mt-3 p-1 rounded-xl ${isDark ? 'bg-slate-950/40' : 'bg-slate-100'}`}>
              <button
                type="button"
                onClick={() => setActiveTab('refer')}
                className={`rounded-lg py-2 text-xs font-bold transition-all ${
                  activeTab === 'refer'
                    ? isDark
                      ? 'bg-slate-900 text-white border border-slate-800/80 shadow'
                      : 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Refer and earn
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`rounded-lg py-2 text-xs font-bold transition-all ${
                  activeTab === 'history'
                    ? isDark
                      ? 'bg-slate-900 text-white border border-slate-800/80 shadow'
                      : 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Referral history
              </button>
            </div>
          </div>

          <div className="px-4 pb-4 min-h-[340px]">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className={`animate-spin ${isDark ? 'text-white' : 'text-slate-900'}`} size={26} />
              </div>
            ) : activeTab === 'refer' ? (
              <div className="space-y-4">
                <h2 className={`text-[18px] font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>How it works?</h2>
                {infoBlocks.length === 0 ? (
                  <p className="text-sm text-slate-400">Referral content will appear here after admin updates this language.</p>
                ) : (
                  infoBlocks.map((block) => (
                     <div
                       key={block.key}
                       className={`text-[14px] leading-6 prose prose-sm max-w-none transition-colors ${isDark ? 'text-slate-300 prose-invert' : 'text-slate-800'}`}
                       dangerouslySetInnerHTML={{ __html: block.html }}
                     />
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-2xl border px-4 py-4 text-center ${isDark ? 'border-slate-800 bg-slate-950/30' : 'border-gray-200 bg-gray-50'}`}>
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Friends joined</p>
                    <p className={`mt-1 text-3xl font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>{overview ? overview.referralCount : profile.referralCount === null ? <NumberSkeleton /> : profile.referralCount}</p>
                  </div>
                  <div className={`rounded-2xl border px-4 py-4 text-center ${isDark ? 'border-slate-800 bg-slate-950/30' : 'border-gray-200 bg-gray-50'}`}>
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>You earned</p>
                    <p className={`mt-1 text-3xl font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>{overview ? `Rs ${Number(overview.totalEarnings || 0).toLocaleString('en-IN')}` : <NumberSkeleton />}</p>
                  </div>
                </div>
                {overview?.reward?.amount > 0 ? (
                  <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Reward: Rs {overview.reward.amount} per friend
                    {overview.reward.ridesNeeded ? ` after they finish ${overview.reward.ridesNeeded} ride${overview.reward.ridesNeeded > 1 ? 's' : ''}` : ' as soon as they sign up'}
                    {overview.reward.newUserAlsoGets ? ' (your friend gets it too)' : ''}.
                  </p>
                ) : null}
                {overview && overview.friends.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">No friend has joined with your code yet.</p>
                ) : null}
                {(overview?.friends || []).map((friend) => (
                  <div key={friend.id} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${isDark ? 'border-slate-800 bg-slate-950/30' : 'border-gray-200 bg-white'}`}>
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{friend.name}</p>
                      <p className="text-xs text-slate-400">{friend.phone}{friend.joinedAt ? ` - joined ${new Date(friend.joinedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {friend.status === 'credited' ? (
                        <p className="text-sm font-extrabold text-emerald-600">+ Rs {friend.amount}</p>
                      ) : (
                        <p className="text-xs font-bold text-amber-600">Pending - {friend.ridesDone}/{friend.ridesNeeded} rides</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleShare}
          disabled={!referralCode}
          className={`w-full rounded-2xl py-4 text-sm font-bold mt-5 flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 shadow-lg disabled:opacity-50 ${isDark ? 'bg-white text-slate-950 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
        >
          Refer now <Share2 size={16} />
        </button>
      </div>
      )}

      <AnimatePresence>
        {copied ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 rounded-2xl px-4 py-3 text-xs font-semibold shadow-xl border ${isDark ? 'bg-slate-900 text-white border-slate-800' : 'bg-slate-900 text-white border-transparent'}`}
          >
            Referral code copied
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ShareSheet
        open={shareSheet.open}
        text={shareSheet.text}
        onClose={() => setShareSheet({ open: false, text: '' })}
        onCopied={() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      />
    </div>
  );
};

export default Referral;
