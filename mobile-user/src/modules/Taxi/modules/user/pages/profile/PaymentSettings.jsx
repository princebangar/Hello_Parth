// Web: modules/Taxi/modules/user/pages/profile/PaymentSettings.jsx — "Payments": Cash (default) plus methods added in
// this screen's own state (the web keeps them in component state only; nothing is sent to the backend).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowLeft, CreditCard, Plus, Banknote, Smartphone, X } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { colors } from '@/theme';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const PAYMENT_OPTIONS = [
  { id: 'upi', label: 'UPI', icon: Smartphone, color: 'purple' },
  { id: 'card', label: 'Credit / Debit Card', icon: CreditCard, color: 'blue' },
];

const PLACEHOLDER = colors.gray[300];

const PaymentSettings = () => {
  const navigate = useNavigate();
  const P = useUserPalette();
  const [showModal, setShowModal] = React.useState(false);
  const [selected, setSelected] = React.useState(null);
  const [upiId, setUpiId] = React.useState('');
  const [cardNumber, setCardNumber] = React.useState('');
  const [cardName, setCardName] = React.useState('');
  const [cardExpiry, setCardExpiry] = React.useState('');
  const [added, setAdded] = React.useState([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [focused, setFocused] = useState('');
  const [modalMounted, setModalMounted] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0.8)).current;
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // AnimatePresence: the sheet slides up from the bottom and back down
  useEffect(() => {
    if (showModal) setModalMounted(true);
    Animated.timing(sheetAnim, { toValue: showModal ? 1 : 0, duration: 300, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !showModal) setModalMounted(false);
    });
  }, [showModal, sheetAnim]);

  useEffect(() => {
    if (!isSuccess) return;
    successAnim.setValue(0.8);
    Animated.spring(successAnim, { toValue: 1, useNativeDriver: true }).start();
  }, [isSuccess, successAnim]);

  const canSubmit = selected === 'upi' ? upiId.trim() : cardNumber && cardName && cardExpiry;

  const handleAdd = () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    timers.current.push(setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      const label = selected === 'upi' ? upiId : `•••• ${cardNumber.slice(-4)}`;
      timers.current.push(setTimeout(() => {
        setAdded(prev => [...prev, { id: Date.now(), type: selected, label }]);
        setIsSuccess(false);
        setShowModal(false);
        setSelected(null);
        setUpiId('');
        setCardNumber('');
        setCardName('');
        setCardExpiry('');
      }, 1800));
    }, 1500));
  };

  const handleClose = () => {
    setShowModal(false);
    setSelected(null);
    setUpiId('');
    setCardNumber('');
    setCardName('');
    setCardExpiry('');
    setIsSuccess(false);
  };

  const input = (key) => [
    styles.input,
    { backgroundColor: P.cardBg, borderColor: focused === key ? P.accent : P.border, color: P.textPrimary },
  ];
  const focusProps = (key) => ({ onFocus: () => setFocused(key), onBlur: () => setFocused((f) => (f === key ? '' : f)) });
  const addDisabled = isSubmitting || !canSubmit;

  return (
    <Screen bg={P.bg} edges={['bottom']}>
      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, { backgroundColor: P.cardBg, borderBottomColor: colors.gray[50] }]}>
        <Pressable onPress={() => navigate('/taxi/user/profile')} style={({ pressed }) => [styles.back, pressed && { transform: [{ scale: 0.95 }] }]}>
          <ArrowLeft size={24} color={P.textPrimary} />
        </Pressable>
        <Text style={[styles.h1, { color: P.textPrimary }]}>Payments</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: colors.gray[50] }]}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: colors.green[50] }]}>
              <Banknote size={24} color={colors.green[600]} />
            </View>
            <View>
              <Text style={[styles.name, { color: P.textPrimary }]}>Cash</Text>
              <Text style={[styles.meta, { color: P.textSecondary }]}>Default</Text>
            </View>
          </View>
          <View style={styles.cashDot}>
            <Plus size={16} color={P.textPrimary} style={{ transform: [{ rotate: '45deg' }] }} />
          </View>
        </View>

        {added.map(item => (
          <View key={item.id} style={[styles.card, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: colors.gray[50] }]}>
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: item.type === 'upi' ? colors.purple[50] : P.cardSoft }]}>
                {item.type === 'upi' ? <Smartphone size={20} color={colors.purple[600]} /> : <CreditCard size={20} color={colors.blue[600]} />}
              </View>
              <View>
                <Text style={[styles.name, { color: P.textPrimary }]}>{item.label}</Text>
                <Text style={[styles.meta, { color: P.textSecondary }]}>{item.type === 'upi' ? 'UPI' : 'Card'}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setAdded(prev => prev.filter(a => a.id !== item.id))}
              style={({ pressed }) => [styles.remove, { backgroundColor: P.cardSoft }, pressed && { transform: [{ scale: 0.9 }] }]}
            >
              <X size={14} strokeWidth={3} color={colors.red[400]} />
            </Pressable>
          </View>
        ))}

        <Pressable
          onPress={() => setShowModal(true)}
          style={({ pressed }) => [styles.addNew, { borderColor: P.border }, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <Plus size={18} color={P.textSecondary} />
          <Text style={[styles.addNewText, { color: P.textSecondary }]}>Add New Payment Method</Text>
        </Pressable>
      </ScrollView>

      {/* ADD PAYMENT MODAL (its bg-black/60 backdrop is the card colour inside the Taxi theme) */}
      {modalMounted ? (
        <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={handleClose}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: P.cardBg, opacity: sheetAnim }]} />
          <View style={styles.modalWrap} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.sheet,
                USER_SHADOW,
                { backgroundColor: P.cardBg, transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [800, 0] }) }] },
              ]}
            >
              <Pressable onPress={handleClose} style={({ pressed }) => [styles.close, { backgroundColor: P.cardBg }, pressed && { transform: [{ scale: 0.9 }] }]}>
                <X size={18} color={P.textSecondary} />
              </Pressable>

              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={[styles.sheetTitle, { color: P.textPrimary }]}>ADD PAYMENT METHOD</Text>
                <Text style={[styles.sheetSub, { color: P.textSecondary }]}>CHOOSE A METHOD TO ADD</Text>
              </View>

              {isSuccess ? (
                <Animated.View style={[styles.success, { transform: [{ scale: successAnim }] }]}>
                  <View style={styles.successIcon}>
                    <Plus size={40} strokeWidth={3} color={colors.green[500]} />
                  </View>
                  <Text style={[styles.successText, { color: P.textPrimary }]}>Payment Method Added!</Text>
                </Animated.View>
              ) : (
                <>
                  {/* Method selector */}
                  <View style={[styles.row, { gap: 12, alignItems: 'stretch' }]}>
                    {PAYMENT_OPTIONS.map(({ id, label, icon: Icon, color }) => {
                      const on = selected === id;
                      const border = on ? (color === 'purple' ? colors.purple[400] : colors.blue[400]) : P.border;
                      const bg = on ? (color === 'purple' ? colors.purple[50] : P.cardSoft) : P.cardBg;
                      return (
                        <Pressable
                          key={id}
                          onPress={() => setSelected(id)}
                          style={({ pressed }) => [styles.option, { borderColor: border, backgroundColor: bg }, pressed && { transform: [{ scale: 0.95 }] }]}
                        >
                          <View style={[styles.iconBox, { backgroundColor: color === 'purple' ? colors.purple[100] : P.cardSoft }]}>
                            <Icon size={22} strokeWidth={2} color={color === 'purple' ? colors.purple[600] : colors.blue[600]} />
                          </View>
                          <Text style={[styles.optionText, { color: P.textSecondary }]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* UPI form */}
                  {selected === 'upi' && (
                    <TextInput
                      value={upiId}
                      onChangeText={setUpiId}
                      autoCapitalize="none"
                      placeholder="Enter UPI ID (e.g. name@upi)"
                      placeholderTextColor={PLACEHOLDER}
                      {...focusProps('upi')}
                      style={input('upi')}
                    />
                  )}

                  {/* Card form */}
                  {selected === 'card' && (
                    <View style={{ gap: 12 }}>
                      <TextInput
                        value={cardNumber}
                        onChangeText={(text) => setCardNumber(text.replace(/\D/g, '').slice(0, 16))}
                        keyboardType="number-pad"
                        placeholder="Card number"
                        placeholderTextColor={PLACEHOLDER}
                        {...focusProps('number')}
                        style={input('number')}
                      />
                      <TextInput
                        value={cardName}
                        onChangeText={setCardName}
                        placeholder="Name on card"
                        placeholderTextColor={PLACEHOLDER}
                        {...focusProps('name')}
                        style={input('name')}
                      />
                      <TextInput
                        value={cardExpiry}
                        onChangeText={setCardExpiry}
                        placeholder="MM / YY"
                        placeholderTextColor={PLACEHOLDER}
                        {...focusProps('expiry')}
                        style={input('expiry')}
                      />
                    </View>
                  )}

                  {selected && (
                    <Pressable
                      onPress={handleAdd}
                      disabled={addDisabled}
                      style={({ pressed }) => [
                        styles.addBtn,
                        addDisabled ? { backgroundColor: P.cardSoft } : [{ backgroundColor: colors.gray[900] }, USER_SHADOW],
                        pressed && { transform: [{ scale: 0.95 }] },
                      ]}
                    >
                      {isSubmitting ? (
                        <Text style={[styles.addBtnText, { color: colors.gray[300] }]}>ADDING...</Text>
                      ) : (
                        <>
                          <Plus size={18} strokeWidth={3} color={addDisabled ? colors.gray[300] : P.textPrimary} />
                          <Text style={[styles.addBtnText, { color: addDisabled ? colors.gray[300] : P.textPrimary }]}>ADD METHOD</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </>
              )}
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 24, borderBottomWidth: 1, zIndex: 20 },
  back: { padding: 8 },
  h1: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  body: { padding: 20, gap: 16 },
  card: { padding: 24, borderRadius: 32, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  meta: { fontSize: 12, lineHeight: 16 },
  cashDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green[500], alignItems: 'center', justifyContent: 'center' },
  remove: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addNew: { width: '100%', paddingVertical: 20, borderWidth: 2, borderStyle: 'dashed', borderRadius: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addNewText: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  modalWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 448, borderRadius: 32, padding: 32, paddingBottom: 40, gap: 24 },
  close: { position: 'absolute', top: 24, right: 24, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  sheetTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  sheetSub: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 1.1 },
  success: { alignItems: 'center', paddingVertical: 32, gap: 16 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.green[50], alignItems: 'center', justifyContent: 'center' },
  successText: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  option: { flex: 1, padding: 20, borderRadius: 24, borderWidth: 2, alignItems: 'center', gap: 12 },
  optionText: { fontSize: 12, lineHeight: 15, fontWeight: '700', textAlign: 'center' },
  input: { width: '100%', height: 56, borderWidth: 2, borderRadius: 18, paddingHorizontal: 20, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  addBtn: { width: '100%', height: 56, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4 },
});

export default PaymentSettings;
