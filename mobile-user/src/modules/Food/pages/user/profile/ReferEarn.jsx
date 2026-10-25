// Web: modules/Food/pages/user/profile/ReferEarn.jsx — GET referral details, copy code, share invite link.
// navigator.clipboard / navigator.share / window.open come from src/lib/webCompat (system clipboard, share sheet,
// Linking); window.location.origin is https://helloparth.in there, so the invite link is the same as on the web.
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Share2, Users, Wallet, CircleCheck, Clock3, CircleX, Copy } from "lucide-react-native";
import { useNavigate } from "@/lib/router";
import { toast } from "@/lib/toast";
import { Text } from "@/native/ui";
import { alpha, colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme";
import AnimatedPage from "@food/components/user/AnimatedPage";
import { Button } from "@food/components/ui/button";
import { Card, CardContent } from "@food/components/ui/card";
import { tokensFor } from "@food/components/ui/tokens";
import { useCompanyName } from "@food/hooks/useCompanyName";
import { useProfile } from "@food/context/ProfileContext";
import { userAPI } from "@food/api";
import useReferralEnabled from "@/shared/hooks/useReferralEnabled";
import NumberSkeleton from "@/shared/components/NumberSkeleton";
import { recallLastKnown, rememberLastKnown } from "@/shared/utils/lastKnown";

const statusMeta = {
  credited: {
    label: "Credited",
    icon: CircleCheck,
    light: { bg: colors.green[100], fg: colors.green[700] },
    dark: { bg: alpha(colors.green[900], 0.2), fg: colors.green[300] },
  },
  pending: {
    label: "Pending",
    icon: Clock3,
    light: { bg: colors.amber[100], fg: colors.amber[700] },
    dark: { bg: alpha(colors.amber[900], 0.2), fg: colors.amber[300] },
  },
  rejected: {
    label: "Rejected",
    icon: CircleX,
    light: { bg: colors.red[100], fg: colors.red[700] },
    dark: { bg: alpha(colors.red[900], 0.2), fg: colors.red[300] },
  },
};

export default function ReferEarn() {
  const { userProfile } = useProfile();
  const companyName = useCompanyName();
  const navigate = useNavigate();
  const s = useStyles();
  const t = useTheme();
  const k = tokensFor(t);
  const insets = useSafeAreaInsets();
  // What this screen showed last time comes up at once and is refreshed quietly; the first time ever the numbers show a
  // small skeleton instead of 0.
  const [remembered] = useState(() => recallLastKnown("food:referral") || null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(() => remembered?.stats || {
    referralCount: 0,
    totalReferralEarnings: 0,
    rewardAmount: 0,
    totalInvited: 0,
    creditedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
  });
  const [invitedFriends, setInvitedFriends] = useState(() => remembered?.invitedFriends || []);
  const [referralCode, setReferralCode] = useState(() => remembered?.referralCode || "");
  const [serverEnabled, setServerEnabled] = useState(() => remembered?.enabled !== false);
  const numbersPending = loading && !remembered;
  // The web's num(): a skeleton in place of the number while it is still unknown.
  const num = (value, prefix, style, fontPx) =>
    numbersPending ? (
      <NumberSkeleton fontSize={fontPx} color={StyleColor(style)} style={{ alignSelf: "flex-start", marginVertical: 4 }} />
    ) : (
      <Text style={style}>{`${prefix || ""}${value}`}</Text>
    );
  const flagEnabled = useReferralEnabled();
  const programOn = flagEnabled && serverEnabled;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await userAPI.getReferralDetails();
        const nextStats = res?.data?.data?.stats || {};
        const nextInvited = res?.data?.data?.invitedFriends || [];
        if (!cancelled) {
          setReferralCode(String(res?.data?.data?.referralCode || "").trim());
          setServerEnabled(res?.data?.data?.enabled !== false);
          setStats({
            referralCount: Number(nextStats.referralCount) || 0,
            totalReferralEarnings: Number(nextStats.totalReferralEarnings) || 0,
            rewardAmount: Number(nextStats.rewardAmount) || 0,
            totalInvited: Number(nextStats.totalInvited) || 0,
            creditedCount: Number(nextStats.creditedCount) || 0,
            pendingCount: Number(nextStats.pendingCount) || 0,
            rejectedCount: Number(nextStats.rejectedCount) || 0,
          });
          setInvitedFriends(Array.isArray(nextInvited) ? nextInvited : []);
          rememberLastKnown("food:referral", {
            stats: {
              referralCount: Number(nextStats.referralCount) || 0,
              totalReferralEarnings: Number(nextStats.totalReferralEarnings) || 0,
              rewardAmount: Number(nextStats.rewardAmount) || 0,
              totalInvited: Number(nextStats.totalInvited) || 0,
              creditedCount: Number(nextStats.creditedCount) || 0,
              pendingCount: Number(nextStats.pendingCount) || 0,
              rejectedCount: Number(nextStats.rejectedCount) || 0,
            },
            invitedFriends: Array.isArray(nextInvited) ? nextInvited : [],
            referralCode: String(res?.data?.data?.referralCode || "").trim(),
            enabled: res?.data?.data?.enabled !== false,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setStats((prev) => ({ ...prev }));
          setInvitedFriends([]);
          toast.error("Failed to load referral details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // The shareable referral code (e.g. K7M3PQ9X) - never the account's database id.
  const refId = referralCode || (userProfile?.referralCode && !/^[0-9a-f]{24}$/i.test(userProfile.referralCode) ? userProfile.referralCode : "");
  const referralLink = refId
    ? `${window.location.origin}/login?ref=${encodeURIComponent(String(refId))}`
    : "";

  const handleCopyCode = async () => {
    if (!refId) return;
    try {
      await navigator.clipboard.writeText(refId);
      toast.success("Referral code copied");
    } catch {
      toast.error("Could not copy the code");
    }
  };

  const shareText = useMemo(() => {
    const rewardText = stats.rewardAmount > 0 ? `₹${stats.rewardAmount}` : "rewards";
    return `Join ${companyName} and earn ${rewardText}.`;
  }, [companyName, stats.rewardAmount]);

  const handleShare = async () => {
    if (!referralLink) {
      toast.error("Referral link unavailable");
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${companyName} referral`,
          text: shareText,
          url: referralLink,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareText} ${referralLink}`);
        toast.success("Referral link copied");
      }

      const fallbackUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`;
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      if (error?.name !== "AbortError") {
        toast.error("Unable to share right now");
      }
    }
  };

  const statCard = (Icon, label, value, prefix) => (
    <Card style={s.statCard}>
      <CardContent style={{ padding: sp(3) }}>
        <View style={s.statHead}>
          <Icon size={14} color={t.dark ? colors.gray[400] : colors.gray[500]} />
          <Text style={s.statLabel}>{label}</Text>
        </View>
        <View style={{ marginTop: sp(1) }}>{num(value, prefix, s.statValue, 20)}</View>
      </CardContent>
    </Card>
  );

  return (
    <AnimatedPage style={s.page}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(24) }]}>
        <View style={s.header}>
          <Button variant="ghost" size="icon" onPress={() => navigate("/food/user/profile")} style={s.backButton} accessibilityLabel="Go back">
            <ArrowLeft size={20} color={t.dark ? colors.white : colors.black} />
          </Button>
          <Text style={s.title}>Refer & Earn</Text>
        </View>

        {!programOn && (
          <Card style={s.card}>
            <CardContent style={{ padding: sp(4) }}>
              <Text style={s.offTitle}>Referral program is off right now</Text>
              <Text style={s.offText}>New referral rewards are paused. Check back later.</Text>
            </CardContent>
          </Card>
        )}

        {programOn && (
          <Card style={s.card}>
            <CardContent style={{ padding: sp(4) }}>
              <Text style={s.offText0}>Invite friends and earn when they sign up.</Text>
              <View style={s.codeBox}>
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text style={s.smallLabel}>Your referral code</Text>
                  {refId ? (
                    <Text style={s.code} numberOfLines={1}>
                      {refId}
                    </Text>
                  ) : loading ? (
                    <NumberSkeleton width="6em" fontSize={18} color={t.dark ? colors.white : colors.gray[900]} style={{ alignSelf: "flex-start", marginVertical: 5 }} />
                  ) : (
                    <Text style={s.code} numberOfLines={1}>
                      Not available
                    </Text>
                  )}
                </View>
                <Button variant="outline" size="sm" onPress={handleCopyCode} disabled={!refId} style={{ flexShrink: 0 }}>
                  <Copy size={16} color={k.foreground} style={{ marginRight: 6 }} />
                  Copy
                </Button>
              </View>
              <View style={s.rewardGrid}>
                <View style={s.rewardBox}>
                  <Text style={s.smallLabel}>Reward per invite</Text>
                  {num(stats.rewardAmount, "₹", [s.rewardValue, { color: "#DC2626" }], 18)}
                </View>
                <View style={s.rewardBox}>
                  <Text style={s.smallLabel}>Referral earnings</Text>
                  {num(stats.totalReferralEarnings, "₹", [s.rewardValue, { color: t.dark ? colors.green[400] : colors.green[600] }], 18)}
                </View>
              </View>
              <Button
                onPress={handleShare}
                disabled={!referralLink}
                style={({ pressed }) => [s.shareButton, { backgroundColor: pressed ? "#d84f0a" : "#DC2626" }]}
              >
                <Share2 size={16} color={k.primaryForeground} style={{ marginRight: sp(2) }} />
                Share Invite
              </Button>
            </CardContent>
          </Card>
        )}

        <View style={s.statsRow}>
          {statCard(Users, "Invited", stats.totalInvited)}
          {statCard(CircleCheck, "Credited", stats.creditedCount)}
          {statCard(Wallet, "Total", stats.totalReferralEarnings, "₹")}
        </View>

        <Card style={[s.card, { marginBottom: 0 }]}>
          <CardContent style={{ padding: sp(4) }}>
            <Text style={s.sectionTitle}>Invited Friends Status</Text>

            {loading ? (
              <Text style={s.muted}>Loading referrals...</Text>
            ) : invitedFriends.length === 0 ? (
              <Text style={s.muted}>No invited friends yet. Share your referral to start earning.</Text>
            ) : (
              <View style={{ gap: sp(2) }}>
                {invitedFriends.map((item, index) => {
                  const meta = statusMeta[item?.status] || statusMeta.pending;
                  const StatusIcon = meta.icon;
                  const tone = t.dark ? meta.dark : meta.light;
                  const invitedDate = item?.invitedAt ? new Date(item.invitedAt) : null;
                  const dateText =
                    invitedDate && !Number.isNaN(invitedDate.getTime())
                      ? invitedDate.toLocaleDateString()
                      : "-";

                  return (
                    <View key={String(item?.id || item?.refereeId || index)} style={s.friend}>
                      <View style={s.friendRow}>
                        <View style={{ minWidth: 0, flex: 1 }}>
                          <Text style={s.friendName} numberOfLines={1}>
                            {item?.name || "Friend"}
                          </Text>
                          <Text style={s.friendPhone}>{item?.phone || "Phone hidden"}</Text>
                          <Text style={s.friendDate}>Invited on {dateText}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <View style={[s.statusPill, { backgroundColor: tone.bg }]}>
                            <StatusIcon size={12} color={tone.fg} />
                            <Text style={[s.statusText, { color: tone.fg }]}>{meta.label}</Text>
                          </View>
                          <Text style={s.earned}>
                            Earned: {"₹"}
                            {Number(item?.earnedAmount) || 0}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </CardContent>
        </Card>
      </ScrollView>
    </AnimatedPage>
  );
}

// colour of a (possibly array) text style, for the skeleton bar (the web's bg-current)
function StyleColor(style) {
  const list = Array.isArray(style) ? style : [style];
  let color;
  list.forEach((st) => {
    if (st && st.color) color = st.color;
  });
  return color;
}

const useStyles = makeStyles((t) => {
  const card = t.dark ? "#1a1a1a" : colors.white;
  const title = t.dark ? colors.white : colors.gray[900];
  const muted = t.dark ? colors.gray[400] : colors.gray[500];
  return {
    page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
    content: { paddingHorizontal: sp(4) },
    header: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(5) },
    backButton: { height: 32, width: 32, padding: 0 },
    title: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.black },
    card: { backgroundColor: card, borderRadius: 16, borderWidth: 0, marginBottom: sp(3), ...shadow.sm },
    offTitle: { ...fontSize.sm, fontWeight: "600", color: title },
    offText: { ...fontSize.sm, color: t.dark ? colors.gray[300] : colors.gray[600], marginTop: sp(1) },
    offText0: { ...fontSize.sm, color: t.dark ? colors.gray[300] : colors.gray[600] },
    codeBox: {
      marginTop: sp(3),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: sp(3),
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: t.dark ? colors.gray[700] : colors.gray[300],
      paddingHorizontal: sp(3),
      paddingVertical: sp(2.5),
    },
    smallLabel: { fontSize: 11, lineHeight: 16, color: muted },
    code: { ...fontSize.lg, fontWeight: "700", letterSpacing: 1.8, color: title },
    rewardGrid: { marginTop: sp(3), flexDirection: "row", gap: sp(2) },
    rewardBox: { flex: 1, borderRadius: 14, backgroundColor: t.dark ? alpha(colors.gray[800], 0.5) : colors.gray[50], padding: sp(3) },
    rewardValue: { ...fontSize.lg, fontWeight: "700" },
    shareButton: { width: "100%", marginTop: sp(3), height: 44, borderRadius: 14 },
    statsRow: { flexDirection: "row", gap: sp(2), marginBottom: sp(3) },
    statCard: { flex: 1, borderWidth: 0, backgroundColor: card, ...shadow.sm },
    statHead: { flexDirection: "row", alignItems: "center", gap: sp(2) },
    statLabel: { fontSize: 11, lineHeight: 16, color: muted },
    statValue: { ...fontSize.xl, fontWeight: "700", color: title },
    sectionTitle: { ...fontSize.sm, fontWeight: "600", color: title, marginBottom: sp(3) },
    muted: { ...fontSize.sm, color: muted },
    friend: { borderRadius: 14, borderWidth: 1, borderColor: t.dark ? colors.gray[800] : colors.gray[200], padding: sp(3) },
    friendRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(3) },
    friendName: { ...fontSize.sm, fontWeight: "600", color: title },
    friendPhone: { ...fontSize.xs, color: muted, marginTop: 2 },
    friendDate: { fontSize: 11, lineHeight: 16, color: muted, marginTop: sp(1) },
    statusPill: { flexDirection: "row", alignItems: "center", gap: sp(1), paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: 9999 },
    statusText: { fontSize: 11, lineHeight: 16, fontWeight: "500" },
    earned: { ...fontSize.xs, marginTop: sp(2), color: t.dark ? colors.gray[300] : colors.gray[700] },
  };
});
