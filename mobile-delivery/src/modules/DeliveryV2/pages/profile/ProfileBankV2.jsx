import React, { useState, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft, Edit2, Loader2, Save } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { KeyboardAwareScrollView, Screen, Text, TextInput } from '@/native/ui';
import { colors, fonts, shadow } from '@/theme';
import { deliveryAPI } from '@food/api';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';
const RX = { elevation: 3, shadowColor: '#112743', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } };

function Spinner({ color, size }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

const FIELDS = {
  "Account Holder": "accountHolderName",
  "Account Number": "accountNumber",
  "IFSC Code": "ifscCode",
  "Bank Name": "bankName",
  "PAN Number": "panNumber"
};

/**
 * ProfileBankV2 - Restored Old UI for Bank Details.
 */
export const ProfileBankV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
    panNumber: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [focused, setFocused] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await deliveryAPI.getProfile();
        if (response?.data?.success) {
          const profile = response.data.data.profile;
          setForm({
            accountHolderName: profile?.documents?.bankDetails?.accountHolderName || "",
            accountNumber: profile?.documents?.bankDetails?.accountNumber || "",
            ifscCode: profile?.documents?.bankDetails?.ifscCode || "",
            bankName: profile?.documents?.bankDetails?.bankName || "",
            panNumber: profile?.documents?.pan?.number || ""
          });
        }
      } catch {
        toast.error("Failed to load details");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    if (!form.accountNumber || !form.ifscCode) return toast.error("Missing mandatory fields");
    setIsSaving(true);
    try {
      const payload = {
        documents: {
          bankDetails: {
            accountHolderName: form.accountHolderName,
            accountNumber: form.accountNumber,
            ifscCode: form.ifscCode,
            bankName: form.bankName
          },
          pan: { number: form.panNumber }
        }
      };
      const response = await deliveryAPI.updateProfileDetails(payload);
      if (response?.data?.success) {
        toast.success("Bank details updated");
        setIsEditing(false);
      }
    } catch {
      toast.error("Update failed");
    } finally {
      setIsSaving(false);
    }
    return undefined;
  };

  if (loading) {
    return (
      <Screen bg={colors.gray[50]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={32} color={PRIMARY} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen bg={colors.gray[50]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8}>
          <ArrowLeft size={24} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.title}>Bank Details</Text>
        {!isEditing ? (
          <Pressable onPress={() => setIsEditing(true)} style={styles.editBtn}>
            <Edit2 size={16} color={PRIMARY} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.content} extraOffset={isEditing ? 40 : 24}>
        <View style={{ gap: 16 }}>
          {Object.entries(FIELDS).map(([label, key]) => (
            <View key={key} style={styles.card}>
              <Text style={styles.label}>{label.toUpperCase()}</Text>
              {isEditing ? (
                <TextInput
                  value={form[key]}
                  onChangeText={(text) => setForm({ ...form, [key]: text })}
                  onFocus={() => setFocused(key)}
                  onBlur={() => setFocused((cur) => (cur === key ? null : cur))}
                  keyboardType={key === 'accountNumber' ? 'number-pad' : 'default'}
                  autoCapitalize={key === 'ifscCode' || key === 'panNumber' ? 'characters' : 'words'}
                  autoCorrect={false}
                  style={[styles.input, focused === key && { borderColor: '#8AA4C5' }]}
                />
              ) : (
                <Text style={styles.value}>{form[key] || "Not provided"}</Text>
              )}
            </View>
          ))}
        </View>

        {isEditing ? (
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={({ pressed }) => [styles.save, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            {isSaving ? <Spinner size={20} color={colors.white} /> : <Save size={20} color={colors.white} />}
            <Text style={styles.saveText}>SAVE CHANGES</Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
};


const styles = StyleSheet.create({
  header: { backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', gap: 16, zIndex: 50, ...shadow.sm },
  title: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: '900', color: '#0F1724', letterSpacing: 0.2 },
  editBtn: { marginLeft: 'auto', padding: 8, backgroundColor: '#E7EFFA', borderRadius: 14 },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 40, gap: 24 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#D1DCEB', ...RX },
  label: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', color: colors.gray[400], letterSpacing: 1, marginBottom: 8 },
  input: { width: '100%', backgroundColor: colors.white, borderWidth: 1, borderColor: '#E8DEE7', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#0F1724' },
  value: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[950] },
  save: { width: '100%', backgroundColor: colors.black, paddingVertical: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow.xl },
  saveText: { color: colors.white, fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: '900', letterSpacing: 1.4 },
});
