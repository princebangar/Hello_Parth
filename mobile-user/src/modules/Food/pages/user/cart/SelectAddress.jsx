import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, ChevronDown, MapPin, Search } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Screen, Text } from '@/native/ui';
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from '@/theme';
import AnimatedPage from '@food/components/user/AnimatedPage';
import ScrollReveal from '@food/components/user/ScrollReveal';
import { Card, CardContent, CardHeader, CardTitle } from '@food/components/ui/card';
import { Button } from '@food/components/ui/button';
import { Input } from '@food/components/ui/input';
import { Label } from '@food/components/ui/label';
import { Badge } from '@food/components/ui/badge';
import { useProfile } from '@food/context/ProfileContext';

const ORANGE = '#DC2626';

const getAddressId = (address) => address?.id || address?._id || '';

const formatAddressLine = (address) => {
  if (!address) return '';
  return [address.additionalDetails, address.street, address.city, address.state, address.zipCode].filter(Boolean).join(', ');
};

const toBackendLabel = (label) => {
  const v = String(label || '').toLowerCase();
  if (v === 'work') return 'Office';
  if (v === 'home') return 'Home';
  return 'Other';
};

export default function SelectAddress() {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const s = useStyles();
  const { addresses = [], addAddress, setDefaultAddress, getDefaultAddress, isAuthenticated } = useProfile();

  const from = location?.state?.from || '/user/cart';
  const defaultAddress = getDefaultAddress?.() || null;

  const [label, setLabel] = useState(() => {
    const current = defaultAddress?.label || 'Home';
    return String(current).toLowerCase().includes('office') ? 'Work' : current;
  });
  const [query, setQuery] = useState('');
  const [selectedSuggestionId, setSelectedSuggestionId] = useState(() => getAddressId(defaultAddress));
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState(() => ({
    additionalDetails: defaultAddress?.additionalDetails || '',
    street: defaultAddress?.street || '',
    city: defaultAddress?.city || '',
    state: defaultAddress?.state || '',
    zipCode: defaultAddress?.zipCode || '',
    phone: defaultAddress?.phone || '',
  }));

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Array.isArray(addresses) ? addresses : [];
    if (!q) return list.slice(0, 6);
    return list
      .map((a) => ({ a, text: `${a.label || ''} ${formatAddressLine(a)}`.trim().toLowerCase() }))
      .filter((x) => x.text.includes(q))
      .slice(0, 8)
      .map((x) => x.a);
  }, [addresses, query]);

  const showDropdown = (query.trim().length > 0 || suggestions.length > 0) && (addresses?.length || 0) > 0;

  const onPickSuggestion = (addr) => {
    setSelectedSuggestionId(getAddressId(addr));
    setQuery(formatAddressLine(addr));
    setForm({
      additionalDetails: addr?.additionalDetails || '',
      street: addr?.street || '',
      city: addr?.city || '',
      state: addr?.state || '',
      zipCode: addr?.zipCode || '',
      phone: addr?.phone || '',
    });
    const normalizedLabel = String(addr?.label || '');
    if (normalizedLabel.toLowerCase() === 'office') setLabel('Work');
    else if (normalizedLabel) setLabel(normalizedLabel);
  };

  const onChangeForm = (name) => (value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSave = async () => {
    const street = String(form.street || '').trim();
    const city = String(form.city || '').trim();
    const state = String(form.state || '').trim();
    if (!isAuthenticated) {
      toast.info('Please login to save an address');
      navigate('/login');
      return;
    }

    // the web form's `required` fields (street, city, state)
    if (!street || !city || !state) {
      toast.error('Please fill Street, City and State');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        label: toBackendLabel(label),
        additionalDetails: String(form.additionalDetails || '').trim(),
        street,
        city,
        state,
        zipCode: String(form.zipCode || '').trim(),
        phone: String(form.phone || '').trim(),
      };
      const created = await addAddress(payload);
      const newId = getAddressId(created);
      if (newId) {
        await setDefaultAddress(newId);
      }
      sessionStorage.setItem('manual_location_update', 'true');
      toast.success('Address saved');
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to save address');
    } finally {
      setIsSaving(false);
    }
  };

  const field = (name, labelText, placeholder, extra = {}) => (
    <View>
      <Label>{labelText}</Label>
      <Input placeholder={placeholder} value={form[name]} onChangeText={onChangeForm(name)} {...extra} />
    </View>
  );

  return (
    <Screen bg={t.dark ? '#0a0a0a' : colors.white} keyboard>
      <AnimatedPage style={s.fill}>
        <LinearGradient
          pointerEvents="none"
          colors={t.dark ? ['#0a0a0a', '#1a1a1a', '#0a0a0a'] : [alpha(colors.orange[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)]}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <ScrollReveal>
            <View style={s.header}>
              <Pressable onPress={() => navigate(from)} style={({ pressed }) => [s.back, pressed && s.backPressed]} hitSlop={4}>
                <ArrowLeft size={20} color={t.dark ? colors.white : colors.gray[900]} />
              </Pressable>
              <View style={s.minW0}>
                <Text style={s.title} numberOfLines={1}>
                  Select address
                </Text>
                <Text style={s.subtitle}>Pick from saved addresses or add manually.</Text>
              </View>
            </View>
          </ScrollReveal>

          <View style={s.form}>
            <ScrollReveal delay={0.05}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <View style={s.titleRow}>
                      <MapPin size={20} color={ORANGE} />
                      <Text style={s.cardTitle}>Save as</Text>
                    </View>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <View style={s.grid3}>
                    {['Home', 'Work', 'Other'].map((x) => {
                      const active = label === x;
                      return (
                        <View key={x} style={s.flex1}>
                          <Button
                            variant={active ? 'default' : 'outline'}
                            onPress={() => setLabel(x)}
                            style={active ? { backgroundColor: ORANGE } : undefined}
                            textStyle={active ? { color: colors.white } : undefined}
                          >
                            {x}
                          </Button>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={s.hint}>Work is stored as Office in backend.</Text>
                </CardContent>
              </Card>
            </ScrollReveal>

            <ScrollReveal delay={0.1}>
              <Card style={{ zIndex: 20 }}>
                <CardHeader>
                  <CardTitle>
                    <View style={s.titleRow}>
                      <Search size={20} color={ORANGE} />
                      <Text style={s.cardTitle}>Autocomplete</Text>
                    </View>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <View style={s.relative}>
                    <Input
                      value={query}
                      onChangeText={(v) => {
                        setQuery(v);
                        setSelectedSuggestionId('');
                      }}
                      placeholder="Start typing to search saved addresses…"
                      style={{ paddingRight: 40 }}
                    />
                    <View pointerEvents="none" style={s.chevron}>
                      <ChevronDown size={16} color={colors.gray[400]} />
                    </View>
                  </View>

                  {showDropdown && (
                    <View style={s.dropdown}>
                      {suggestions.length === 0 ? (
                        <Text style={s.noMatch}>No matches found.</Text>
                      ) : (
                        <ScrollView style={s.dropdownList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                          {suggestions.map((addr, idx) => {
                            const id = getAddressId(addr);
                            const selected = id && selectedSuggestionId === id;
                            const isLast = idx === suggestions.length - 1;
                            return (
                              <Pressable
                                key={id || formatAddressLine(addr)}
                                onPress={() => onPickSuggestion(addr)}
                                style={({ pressed }) => [s.suggestion, !isLast && s.suggestionBorder, pressed && s.suggestionPressed]}
                              >
                                <View style={s.suggestionRow}>
                                  <View style={s.minW0Flex}>
                                    <View style={s.labelRow}>
                                      <Text style={s.suggestionLabel}>
                                        {String(addr?.label || 'Saved').toLowerCase() === 'office' ? 'Work' : addr?.label || 'Saved'}
                                      </Text>
                                      {addr?.isDefault && (
                                        <Badge
                                          style={{ backgroundColor: t.dark ? alpha('#DC2626', 0.15) : colors.orange[100] }}
                                          textStyle={{ color: t.dark ? colors.orange[200] : colors.orange[800] }}
                                        >
                                          Default
                                        </Badge>
                                      )}
                                    </View>
                                    <Text style={s.suggestionLine} numberOfLines={1}>
                                      {formatAddressLine(addr)}
                                    </Text>
                                  </View>
                                  {selected && (
                                    <View style={{ paddingTop: 4 }}>
                                      <Check size={20} color={ORANGE} />
                                    </View>
                                  )}
                                </View>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  )}
                  <Text style={s.hint}>Selecting a suggestion will prefill the manual fields (you can still edit).</Text>
                </CardContent>
              </Card>
            </ScrollReveal>

            <ScrollReveal delay={0.15}>
              <Card>
                <CardHeader>
                  <CardTitle>Manual address fields</CardTitle>
                </CardHeader>
                <CardContent style={s.space4}>
                  {field('additionalDetails', 'Address details*', 'E.g. Floor, House no.')}
                  {field('street', 'Street / Area *', 'Street / Area')}
                  <View style={s.grid1}>
                    {field('city', 'City *', 'City')}
                    {field('state', 'State *', 'State')}
                  </View>
                  <View style={s.grid1}>
                    {field('zipCode', 'Pincode (optional)', 'Pincode')}
                    {field('phone', 'Phone (optional)', 'Phone', { keyboardType: 'phone-pad' })}
                  </View>
                </CardContent>
              </Card>
            </ScrollReveal>

            <View style={{ paddingTop: sp(2) }}>
              <Button
                onPress={onSave}
                style={s.saveBtn}
                textStyle={s.saveText}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save address'}
              </Button>
            </View>
          </View>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { flex: 1 },
  flex1: { flex: 1 },
  content: { padding: sp(4), gap: sp(6), paddingBottom: sp(10) },
  header: { flexDirection: 'row', alignItems: 'center', gap: sp(4) },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  backPressed: { backgroundColor: t.dark ? alpha('#f6e2b5', 0.5) : '#f6e2b5' },
  minW0: { minWidth: 0, flexShrink: 1 },
  minW0Flex: { minWidth: 0, flex: 1 },
  title: { ...fontSize.lg, fontWeight: '700', color: t.dark ? colors.white : colors.gray[900] },
  subtitle: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600] },
  form: { gap: sp(6) },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  cardTitle: { fontWeight: '600', ...fontSize.base, lineHeight: 18, color: t.text },
  grid3: { flexDirection: 'row', gap: sp(2) },
  hint: { marginTop: sp(2), ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[500] },
  relative: { position: 'relative' },
  chevron: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  dropdown: {
    marginTop: sp(2),
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    backgroundColor: t.dark ? '#1a1a1a' : colors.white,
    overflow: 'hidden',
    ...shadow.xl,
  },
  dropdownList: { maxHeight: 288 },
  noMatch: { padding: sp(4), ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600] },
  suggestion: { width: '100%', paddingHorizontal: sp(4), paddingVertical: sp(3) },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100] },
  suggestionPressed: { backgroundColor: t.dark ? alpha('#ffffff', 0.05) : alpha(colors.orange[50], 0.6) },
  suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3) },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  suggestionLabel: { fontWeight: '600', ...fontSize.base, color: t.dark ? colors.white : colors.gray[900] },
  suggestionLine: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600] },
  space4: { gap: sp(4) },
  grid1: { gap: sp(3) },
  saveBtn: { width: '100%', height: 48, backgroundColor: ORANGE },
  saveText: { ...fontSize.base, fontWeight: '600', color: colors.white },
}));
