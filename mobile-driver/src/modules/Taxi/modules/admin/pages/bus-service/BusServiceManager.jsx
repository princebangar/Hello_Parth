// Web: admin/pages/bus-service/BusServiceManager.jsx — the bus builder (list, details, 4-step create / edit flow with seat
// blueprint, route map and schedules). Used by the fleet owner (OwnerBusServicePage, /taxi/owner/bus-service/*) and by
// the bus-driver signup (BusSignupBuilderPage, /taxi/driver/role-signup/bus-builder/*). Same props and exports as the web.
// Native:
// - The web component has no scroller of its own (the document scrolled), so this renders plain Views and the caller
//   puts it inside its ScrollView. Things the web did with the document scroll (form to the top on New Bus / step
//   change, new stop card into view) and the caller's pull-to-refresh go through the optional BusServiceManagerHost
//   context (exported below): { scrollRef, scrollYRef, reloadKey, silentReload, onReloaded }. Without it they are
//   simply skipped.
// - <select> -> bottom sheet, <input type="time"> -> the system time dialog (value stays "HH:mm"), file inputs -> camera /
//   gallery (the image is stored as a data URL in the draft, like the web's FileReader), window.confirm / prompt ->
//   Alert / Dialog, Google Places Autocomplete -> @/lib/google suggestions (India, cities), GoogleMap -> AppMap.
// - The web's action bar was `sticky bottom-0` inside the document; here it is the last block of the form.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import {
  Armchair,
  Bus,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CopyPlus,
  ImagePlus,
  MapPin,
  Plus,
  Route,
  Save,
  Search,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { pickImage } from '@/lib/media';
import { autocomplete as placesAutocomplete, newSessionToken, placeDetails } from '@/lib/google';
import { AppImage, Dialog, Sheet, Text, TextInput } from '@/native/ui';
import { AppMap, Marker, Polyline, regionFor, toLatLng } from '@/native/ui/AppMap';
import { useLocation, useNavigate, useParams, useSearchParams } from '@/lib/router';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import { adminService } from '../../services/adminService';
import { computeDrivingRoute } from '../../../../shared/utils/googleRoutes';
import {
  BUS_BLUEPRINT_TEMPLATES,
  createBusBlueprint,
  countTotalSeats,
  createBlueprintFromTemplate,
  createBusDraft,
  deleteAdminBus as defaultDeleteBus,
  getAdminBuses as defaultGetBuses,
  upsertAdminBus as defaultUpsertBus,
} from '../../services/busService';
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader } from '../../utils/googleMaps';
import useDirty from '../../../../../../shared/hooks/useDirty';

/**
 * Optional host of the manager (the screen whose ScrollView it sits in):
 * { scrollRef, scrollYRef, reloadKey, silentReload, onReloaded }
 * - scrollRef / scrollYRef: the ScrollView ref and its current y offset (web: scrollIntoView on the document).
 * - reloadKey: bump it to load the catalog again (pull-to-refresh / tab shown again). silentReload: keep the old list
 *   on screen while it reloads. onReloaded(): called when that load has finished.
 */
export const BusServiceManagerHost = createContext(null);

const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const AMENITY_OPTIONS = [
  'Charging Port',
  'Reading Light',
  'Live Tracking',
  'Blanket',
  'Water Bottle',
  'WiFi',
  'CCTV',
  'Emergency Exit',
];

// Route distance/duration are stored as plain numbers ("193", "9.25"); show them with units so the
// overview cards stay readable instead of bare numbers running into each other.
const formatRouteDistance = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return 'N/A';
  return /^\d+(\.\d+)?$/.test(text) ? `${Number(text).toLocaleString('en-IN')} km` : text;
};

const formatRouteDuration = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return 'N/A';
  if (!/^\d+(\.\d+)?$/.test(text)) return text;
  const totalMinutes = Math.round(Number(text) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

// web statusTone: bg / text / border (+ shadow-sm)
const statusTone = {
  active: { bg: colors.emerald[100], fg: colors.emerald[800], border: colors.emerald[300] },
  draft: { bg: colors.amber[100], fg: colors.amber[800], border: colors.amber[300] },
  paused: { bg: colors.rose[100], fg: colors.rose[800], border: colors.rose[300] },
};
const toneOf = (status) => statusTone[status] || statusTone.draft;

const DEFAULT_COACH_TYPES = ['AC Sleeper', 'Non AC Sleeper', 'AC Seater', 'Volvo Multi Axle', 'Semi Sleeper'];
const VARIANT_PRICING_FIELDS = [
  { key: 'seat', label: 'Standard Seat' },
  { key: 'window', label: 'Window Seat' },
  { key: 'aisle', label: 'Aisle Seat' },
  { key: 'sleeper', label: 'Sleeper Berth' },
];
const CREATE_FLOW_STEPS = [
  {
    key: 'basics',
    shortLabel: 'Step 1',
    title: 'Bus Basics',
    description: 'Driver assignment, operator profile, pricing, and status.',
  },
  {
    key: 'experience',
    shortLabel: 'Step 2',
    title: 'Media & Policies',
    description: 'Images, amenities, and rider policy details.',
  },
  {
    key: 'layout',
    shortLabel: 'Step 3',
    title: 'Seat Layout',
    description: 'Coach blueprint and seat inventory setup.',
  },
  {
    key: 'route',
    shortLabel: 'Step 4',
    title: 'Route & Schedule',
    description: 'Stops, route map, and recurring departures.',
  },
];

const blankStop = () => ({
  id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  city: '',
  pointName: '',
  stopType: 'pickup',
  arrivalTime: '',
  departureTime: '',
});

const blankSchedule = () => ({
  id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  label: '',
  departureTime: '',
  arrivalTime: '',
  activeDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  status: 'active',
});

const blankCancellationRule = () => ({
  id: `cancel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  label: '',
  hoursBeforeDeparture: 0,
  refundType: 'percentage',
  refundValue: 0,
  notes: '',
});

const CITY_AUTOCOMPLETE_FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'];
const getRouteCacheKey = (origin, destination) => {
  const serializePoint = (point) =>
    point ? `${Number(point.lat || 0).toFixed(5)},${Number(point.lng || 0).toFixed(5)}` : '';

  return `${serializePoint(origin)}|${serializePoint(destination)}`;
};
const CURRENCY_LABELS = {
  INR: 'INR - Indian Rupee',
  USD: 'USD - US Dollar',
  EUR: 'EUR - Euro',
  GBP: 'GBP - British Pound',
  AED: 'AED - UAE Dirham',
};

const getCreateFlowStepIndex = (searchParams) => {
  const rawValue = Number(searchParams.get('step') || 1);
  if (!Number.isFinite(rawValue)) {
    return 0;
  }
  return Math.min(CREATE_FLOW_STEPS.length - 1, Math.max(0, rawValue - 1));
};

const toCoords = (value) => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return null;
};

const getCityLabelFromPlace = (place) => {
  const components = Array.isArray(place?.address_components) ? place.address_components : [];
  const locality =
    components.find((component) => component.types?.includes('locality'))?.long_name ||
    components.find((component) => component.types?.includes('administrative_area_level_3'))?.long_name ||
    components.find((component) => component.types?.includes('administrative_area_level_2'))?.long_name;

  return String(locality || place?.name || place?.formatted_address || '').trim();
};

// web: geometry.location is a google.maps.LatLng (lat() / lng()); @/lib/google hands out plain numbers.
const getCoordsFromPlace = (place) => {
  const location = place?.geometry?.location;
  if (!location) return null;
  const lat = Number(typeof location.lat === 'function' ? location.lat() : location.lat);
  const lng = Number(typeof location.lng === 'function' ? location.lng() : location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const swapStopType = (stopType = 'pickup') => {
  if (stopType === 'pickup') return 'drop';
  if (stopType === 'drop') return 'pickup';
  return 'both';
};

const buildMirroredReturnRoute = (route = {}) => ({
  routeName:
    route.originCity || route.destinationCity
      ? `Return: ${route.destinationCity || 'Destination'} to ${route.originCity || 'Origin'}`
      : '',
  originCity: route.destinationCity || '',
  destinationCity: route.originCity || '',
  originCoords: toCoords(route.destinationCoords),
  destinationCoords: toCoords(route.originCoords),
  distanceKm: route.distanceKm || '',
  durationHours: route.durationHours || '',
  stops: Array.isArray(route.stops)
    ? route.stops
        .slice()
        .reverse()
        .map((stop, index) => ({
          id: stop.id || `return-stop-${index + 1}`,
          city: stop.city || '',
          pointName: stop.pointName || '',
          stopType: swapStopType(stop.stopType),
          arrivalTime: stop.departureTime || '',
          departureTime: stop.arrivalTime || '',
        }))
    : [],
});

// web: FileReader.readAsDataURL(file)
const fileToDataUrl = async (file) => {
  const base64 = await new File(file.uri).base64();
  return `data:${String(file.type || file.mimeType || 'image/jpeg')};base64,${base64}`;
};

// <input type="file" accept="image/*">: the phone offered camera or photos.
const chooseImageSource = () =>
  new Promise((resolve) => {
    Alert.alert('Upload photo', undefined, [
      { text: 'Camera', onPress: () => resolve('camera') },
      { text: 'Gallery', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });

// <input type="file" accept="image/*" multiple>: several photos from the gallery, or one from the camera.
const pickGalleryFiles = async (source) => {
  if (source === 'camera') {
    const one = await pickImage({ source: 'camera' });
    return one ? [one] : [];
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    const err = new Error('Photo permission denied');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true });
  if (res.canceled || !res.assets?.length) return [];
  return res.assets.map((a) => ({ uri: a.uri, type: a.mimeType || 'image/jpeg' }));
};

const confirmAsync = (message) =>
  new Promise((resolve) => {
    Alert.alert('', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

// Scroll the host's ScrollView so `node` is at the top (block: 'start', web scroll-mt-4) or centred.
const scrollNodeIntoView = (host, node, block = 'start', margin = 16) => {
  const sv = host?.scrollRef?.current;
  if (!sv || !node?.measureInWindow) return;
  const target = typeof sv.getNativeScrollRef === 'function' ? sv.getNativeScrollRef() : sv;
  if (!target?.measureInWindow) return;
  node.measureInWindow((_x, y, _w, h) => {
    target.measureInWindow((_sx, sy, _sw, sh) => {
      const current = Number(host.scrollYRef?.current || 0);
      const offset = block === 'center' ? (y - sy) - (sh - h) / 2 : (y - sy) - margin;
      sv.scrollTo({ y: Math.max(0, current + offset), animated: true });
    });
  });
};

// ------------------------------------------------------------------ text helpers (Tailwind sizes)
const LINE = { 8: 12, 9: 13.5, 10: 15, 11: 16.5, 12: 16, 14: 20, 16: 24, 18: 28, 20: 28, 24: 32, 30: 36 };
const tx = (size, weight, color, more) => ({ fontSize: size, lineHeight: LINE[size] || Math.round(size * 1.5), fontWeight: weight, color, ...more });
const track = (size, em) => ({ letterSpacing: size * em });

// ------------------------------------------------------------------ form controls
const Label = ({ children, style }) => <Text style={[s.label, style]}>{children}</Text>;

const Field = ({ value, onChangeText, placeholder, keyboardType, editable = true, multiline = false, minHeight, style, autoCapitalize, onFocus, onBlur }) => (
  <TextInput
    onFocus={onFocus}
    onBlur={onBlur}
    style={[s.field, multiline ? { minHeight: minHeight || 92, textAlignVertical: 'top' } : null, !editable ? s.fieldDisabled : null, style]}
    value={value == null ? '' : String(value)}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={colors.slate[400]}
    keyboardType={keyboardType}
    editable={editable}
    multiline={multiline}
    autoCapitalize={autoCapitalize}
  />
);

// <select>: a field that opens a bottom sheet with the options.
const SelectField = ({ value, options, onSelect, disabled = false, title, style }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={[s.field, s.selectRow, disabled ? s.fieldDisabled : null, style]}
      >
        <Text style={s.fieldText} numberOfLines={1}>{selected ? selected.label : ''}</Text>
        <ChevronDown size={16} color={colors.slate[500]} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <View style={s.sheetBody}>
          {title ? <Text style={s.sheetTitle}>{title}</Text> : null}
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setOpen(false);
                  onSelect(option.value);
                }}
                style={({ pressed }) => [s.sheetOption, active ? s.sheetOptionActive : null, pressed ? s.sheetOptionPressed : null]}
              >
                <Text style={[s.sheetOptionText, active ? s.sheetOptionTextActive : null]}>{option.label}</Text>
                {active ? <Check size={16} color={colors.blue[600]} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
};

// <input type="time">: "HH:mm" (24h) like the browser value; shown as the browser showed it (hh:mm am/pm).
const parseTime = (value) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
};
const toTimeValue = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const displayTime = (value) => {
  const d = parseTime(value);
  if (!d) return '';
  const h = d.getHours();
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

const TimeField = ({ value, onChangeValue }) => {
  const [iosOpen, setIosOpen] = useState(false);
  const current = parseTime(value) || new Date();
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'time',
        is24Hour: false,
        onValueChange: (_event, date) => {
          if (date) onChangeValue(toTimeValue(date));
        },
      });
      return;
    }
    setIosOpen(true);
  };
  const shown = displayTime(value);
  return (
    <>
      <Pressable onPress={open} style={[s.field, s.selectRow]}>
        <Text style={[s.fieldText, shown ? null : { color: colors.slate[400] }]}>{shown || '--:-- --'}</Text>
        <Clock3 size={16} color={colors.slate[900]} />
      </Pressable>
      {Platform.OS !== 'android' ? (
        <Sheet open={iosOpen} onClose={() => setIosOpen(false)}>
          <View style={s.sheetBody}>
            <DateTimePicker
              value={current}
              mode="time"
              display="spinner"
              onValueChange={(_event, date) => {
                if (date) onChangeValue(toTimeValue(date));
              }}
            />
            <Pressable onPress={() => setIosOpen(false)} style={s.sheetDone}>
              <Text style={s.sheetDoneText}>Done</Text>
            </Pressable>
          </View>
        </Sheet>
      ) : null}
    </>
  );
};

// Google Places Autocomplete (India, cities) on a text field.
const CityAutocompleteInput = ({ value, onChangeText, onPickPlace, placeholder }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [focused, setFocused] = useState(false);
  const typedRef = useRef(false);
  const sessionRef = useRef(newSessionToken());
  const blurTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(blurTimerRef.current), []);

  useEffect(() => {
    if (!focused || !typedRef.current) return undefined;
    const text = String(value || '').trim();
    if (!text) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await placesAutocomplete(text, { country: 'in', types: ['(cities)'], sessionToken: sessionRef.current });
        if (!cancelled) setSuggestions(results.slice(0, 5));
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [focused, value]);

  const pick = async (item) => {
    setSuggestions([]);
    typedRef.current = false;
    try {
      const place = await placeDetails(item.place_id, { sessionToken: sessionRef.current, fields: CITY_AUTOCOMPLETE_FIELDS });
      sessionRef.current = newSessionToken();
      onPickPlace(place);
    } catch {
      onPickPlace(null);
    }
  };

  return (
    <View>
      <Field
        value={value}
        onChangeText={(text) => {
          typedRef.current = true;
          onChangeText(text);
        }}
        onFocus={() => {
          clearTimeout(blurTimerRef.current);
          setFocused(true);
        }}
        onBlur={() => {
          // a tap on a suggestion lands before the list closes
          blurTimerRef.current = setTimeout(() => setFocused(false), 200);
        }}
        placeholder={placeholder}
      />
      {focused && suggestions.length > 0 ? (
        <View style={s.pacBox}>
          {suggestions.map((item) => (
            <Pressable
              key={item.place_id}
              onPress={() => pick(item)}
              style={({ pressed }) => [s.pacItem, pressed ? s.pacItemPressed : null]}
            >
              <MapPin size={14} color={colors.slate[400]} />
              <Text style={s.pacText} numberOfLines={1}>
                <Text style={s.pacMain}>{item.structured_formatting?.main_text || item.description}</Text>
                {item.structured_formatting?.secondary_text ? ` ${item.structured_formatting.secondary_text}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};

// ------------------------------------------------------------------ seat blueprint
const SeatCell = ({ cell, onToggle }) => {
  if (!cell || cell.kind !== 'seat') {
    return <View style={s.seatEmpty} />;
  }

  const isBlocked = cell.status === 'blocked';
  const isSleeper = cell.variant === 'sleeper';
  const shape = { minHeight: isSleeper ? 58 : 44, borderRadius: isSleeper ? 18 : 14 };
  const fg = isBlocked ? colors.rose[500] : isSleeper ? colors.sky[700] : colors.slate[700];
  return (
    <Pressable
      onPress={onToggle}
      accessibilityLabel={isBlocked ? 'Seat blocked for sale' : 'Seat available for sale'}
      style={[
        s.seat,
        shape,
        isBlocked
          ? { borderColor: colors.rose[200], backgroundColor: colors.rose[50] }
          : isSleeper
            ? { borderColor: colors.sky[200] }
            : { borderColor: colors.slate[200], backgroundColor: colors.white },
      ]}
    >
      {!isBlocked && isSleeper ? (
        <LinearGradient
          colors={[colors.sky[50], colors.cyan[50]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {isSleeper ? (
        <>
          <View style={s.sleeperPillow} />
          <View style={s.sleeperBar} />
          <Text style={[s.seatLabel, { color: fg, paddingLeft: 16 }]}>{cell.label}</Text>
        </>
      ) : (
        <>
          <View style={s.seatTopBar} />
          <View style={s.seatDot} />
          <Text style={[s.seatLabel, { color: fg }]}>{cell.label}</Text>
        </>
      )}
    </Pressable>
  );
};

const SeatDeckPreview = ({ title, deckRows, onToggleSeat }) => {
  if (!deckRows?.length) return null;

  const maxColumns = Math.max(...deckRows.map((row) => row.length), 1);

  return (
    <LinearGradient colors={[colors.slate[50], colors.white]} style={s.deckOuter}>
      <View style={s.deckHead}>
        <View style={s.flex1}>
          <Text style={tx(14, '900', colors.slate[900])}>{title}</Text>
          <Text style={tx(10, '500', colors.slate[500])}>Tap any seat or berth to block or reopen it.</Text>
        </View>
        <View style={s.deckBadge}>
          <Text style={tx(10, '700', colors.slate[500])}>Redbus style</Text>
        </View>
      </View>

      <View style={s.deckInner}>
        <View style={s.deckHead}>
          <View style={s.entryBox}>
            <Text style={tx(10, '900', colors.slate[500])}>Entry</Text>
          </View>
          <View style={s.frontBox}>
            <Text style={[tx(10, '900', colors.slate[400]), s.frontText]}>Front</Text>
          </View>
        </View>

        <View style={s.deckRows}>
          {deckRows.map((row, rowIndex) => {
            const columns = Math.max(maxColumns, row.length);
            const fillers = Math.max(0, columns - row.length);
            return (
              <View key={`${title}-${rowIndex}`} style={s.deckRow}>
                {row.map((cell, cellIndex) => (
                  <View key={`${title}-${rowIndex}-${cellIndex}-${cell?.id || 'aisle'}`} style={s.deckCol}>
                    <SeatCell cell={cell} onToggle={() => cell?.kind === 'seat' && onToggleSeat(cell.id)} />
                  </View>
                ))}
                {Array.from({ length: fillers }, (_, index) => (
                  <View key={`${title}-${rowIndex}-fill-${index}`} style={s.deckCol} />
                ))}
              </View>
            );
          })}
        </View>
      </View>
    </LinearGradient>
  );
};

const BlueprintDeckConfigurator = ({ title, config, onChangeField }) => (
  <View style={s.deckConfig}>
    <View style={[s.deckHead, { marginBottom: 16 }]}>
      <View style={s.flex1}>
        <Text style={tx(12, '700', colors.slate[900])}>{title}</Text>
        <Text style={tx(10, '500', colors.slate[500])}>Tune rows, berth type, and seats on each side.</Text>
      </View>
      <Pressable
        onPress={() => onChangeField('enabled', !config.enabled)}
        style={[
          s.enabledPill,
          config.enabled
            ? { borderColor: colors.amber[300], backgroundColor: colors.amber[100], ...shadow.sm }
            : { borderColor: colors.slate[200], backgroundColor: colors.white },
        ]}
      >
        <Text style={tx(10, '700', config.enabled ? colors.amber[800] : colors.slate[400])}>
          {config.enabled ? 'Enabled' : 'Disabled'}
        </Text>
      </Pressable>
    </View>

    <View style={s.gap3}>
      <View>
        <Label>Seat Type</Label>
        <SelectField
          value={config.seatType}
          title="Seat Type"
          options={[{ value: 'seat', label: 'Seater' }, { value: 'sleeper', label: 'Sleeper' }]}
          onSelect={(next) => onChangeField('seatType', next)}
          disabled={!config.enabled}
        />
      </View>
      <View>
        <Label>Rows</Label>
        <Field value={config.rows} keyboardType="number-pad" onChangeText={(text) => onChangeField('rows', text)} editable={Boolean(config.enabled)} />
      </View>
      <View>
        <Label>Left Side Seats</Label>
        <Field value={config.leftSeats} keyboardType="number-pad" onChangeText={(text) => onChangeField('leftSeats', text)} editable={Boolean(config.enabled)} />
      </View>
      <View>
        <Label>Right Side Seats</Label>
        <Field value={config.rightSeats} keyboardType="number-pad" onChangeText={(text) => onChangeField('rightSeats', text)} editable={Boolean(config.enabled)} />
      </View>
    </View>
  </View>
);

// ------------------------------------------------------------------ small pieces
const StatusPill = ({ status, size = 10, padH = 12, padV = 4 }) => {
  const tone = toneOf(status);
  return (
    <View style={[s.pill, { backgroundColor: tone.bg, borderColor: tone.border, paddingHorizontal: padH, paddingVertical: padV }, shadow.sm]}>
      <Text style={[tx(size, '900', tone.fg), track(size, 0.05), s.upper]}>{status || 'draft'}</Text>
    </View>
  );
};

// two-column grid of equal cells (web grid-cols-2); a lone last cell keeps half the width
const Grid2 = ({ children, gap = 12, style }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={[{ gap }, style]}>
      {rows.map((row, index) => (
        <View key={`g2-${index}`} style={{ flexDirection: 'row', gap }}>
          <View style={s.flex1}>{row[0]}</View>
          <View style={s.flex1}>{row[1] || null}</View>
        </View>
      ))}
    </View>
  );
};

const Btn = ({ onPress, disabled, style, pressedStyle, children }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [s.btn, style, pressed && !disabled ? (pressedStyle || s.btnPressed) : null, disabled ? s.btnDisabled : null]}
  >
    {children}
  </Pressable>
);

const BusServiceManager = ({
  mode: modeProp = null,
  api = {},
  basePath = '/admin/bus-service',
  badgeLabel = 'Bus Service Control',
  title = 'Manage Bus Fleet & Schedules',
  description = 'Define coaches, preview seat blueprints, manage inventory, and publish recurring departures with multi-stop routes.',
  emptyLabel = 'No buses found.',
  defaultStatus = 'draft',
}) => {
  const buildFreshDraft = () => ({
    ...createBusDraft(),
    status: ['draft', 'active', 'paused'].includes(defaultStatus) ? defaultStatus : 'draft',
  });

  const host = useContext(BusServiceManagerHost);
  const hostReloadKey = host?.reloadKey || 0;
  const hostRef = useRef(host);
  hostRef.current = host;
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeBusId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const getBuses = api.getBuses || defaultGetBuses;
  const upsertBus = api.upsertBus || defaultUpsertBus;
  const deleteBus = api.deleteBus || defaultDeleteBus;
  const getPendingBusDrivers = api.getPendingBusDrivers || adminService.getPendingBusDrivers;
  const approvePendingBusDriver = api.approvePendingBusDriver || adminService.approvePendingBusDriver;
  const rejectPendingBusDriver = api.rejectPendingBusDriver || adminService.rejectPendingBusDriver;
  const getDrivers = api.getDrivers;
  const resolvedPathMode = useMemo(() => {
    const pathname = String(location.pathname || '');

    if (pathname === `${basePath}/create`) {
      return 'create';
    }

    if (pathname.startsWith(`${basePath}/edit/`)) {
      return 'edit';
    }

    if (routeBusId && pathname.startsWith(`${basePath}/`)) {
      return 'details';
    }

    return '';
  }, [basePath, location.pathname, routeBusId]);
  const currentMode = modeProp || resolvedPathMode || searchParams.get('mode') || 'list';
  const currentBusId = routeBusId || searchParams.get('bus') || '';
  const [catalog, setCatalog] = useState([]);
  const [pendingBusDrivers, setPendingBusDrivers] = useState([]);
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [detailBusId, setDetailBusId] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [draft, setDraft] = useState(() => buildFreshDraft());
  const { isDirty, resetBaseline } = useDirty(draft);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [ownerDrivers, setOwnerDrivers] = useState([]);
  const [driverSearch, setDriverSearch] = useState('');
  const [routePath, setRoutePath] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const routeMapRef = useRef(null);
  // The create / edit form block: the screen scrolls to its top on "New Bus" and on every step change.
  const formAnchorRef = useRef(null);
  const stopRefs = useRef({});
  const routePreviewCacheRef = useRef(new Map());
  const cityGeocodeCacheRef = useRef(new Map());
  const { isLoaded: isGoogleMapsLoaded, google: googleMaps } = useAppGoogleMapsLoader();
  const canUsePlacesAutocomplete =
    isGoogleMapsLoaded &&
    HAS_VALID_GOOGLE_MAPS_KEY &&
    Boolean(googleMaps?.maps?.places);
  const coachTypeOptions = useMemo(() => {
    const discovered = Array.from(
      new Set(
        [draft.coachType, ...catalog.map((item) => item.coachType)].filter(Boolean),
      ),
    );

    return Array.from(new Set([...DEFAULT_COACH_TYPES, ...discovered]));
  }, [catalog, draft.coachType]);

  // web: loaded on mount / mode change. Native: also when the host asks (pull-to-refresh, tab shown again).
  const lastReloadKeyRef = useRef(hostReloadKey);
  useEffect(() => {
    let active = true;
    const isHostReload = lastReloadKeyRef.current !== hostReloadKey;
    lastReloadKeyRef.current = hostReloadKey;
    const silent = isHostReload && Boolean(hostRef.current?.silentReload);

    const loadCatalog = async () => {
      if (!silent) setIsLoadingCatalog(true);
      try {
        const buses = await getBuses();
        const pendingResponse = await getPendingBusDrivers?.();
        if (!active) return;

        setCatalog(buses);
        setPendingBusDrivers(Array.isArray(pendingResponse?.data?.data?.results || pendingResponse?.data?.results)
          ? (pendingResponse?.data?.data?.results || pendingResponse?.data?.results)
          : []);
        if (currentMode === 'create') {
          return;
        }
        if (buses[0]) {
          setSelectedBusId((current) => current || buses[0].id);
          setDraft((current) =>
            current.id === buses[0].id ? current : JSON.parse(JSON.stringify(buses[0])),
          );
        } else {
          const nextDraft = buildFreshDraft();
          setSelectedBusId(nextDraft.id);
          setDraft(nextDraft);
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Failed to load bus services');
      } finally {
        if (active) {
          setIsLoadingCatalog(false);
        }
        if (isHostReload) hostRef.current?.onReloaded?.();
      }
    };

    loadCatalog();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, hostReloadKey]);

  const refreshPendingBusDrivers = async () => {
    if (typeof getPendingBusDrivers !== 'function') {
      return;
    }
    try {
      const response = await getPendingBusDrivers();
      setPendingBusDrivers(response?.data?.data?.results || response?.data?.results || []);
    } catch (error) {
      toast.error(error?.message || 'Failed to load pending bus driver requests');
    }
  };

  const handleApprovePendingBusDriver = async (driverId) => {
    if (typeof approvePendingBusDriver !== 'function') return;
    try {
      await approvePendingBusDriver(driverId);
      await refreshPendingBusDrivers();
      toast.success('Bus driver request approved');
    } catch (error) {
      toast.error(error?.message || 'Failed to approve bus driver request');
    }
  };

  // web: window.prompt('Reason for rejection', '') -> a dialog with the same question
  const handleRejectPendingBusDriver = (driverId) => {
    if (typeof rejectPendingBusDriver !== 'function') return;
    setRejectReason('');
    setRejectTarget(driverId);
  };

  const submitRejectPendingBusDriver = async () => {
    const driverId = rejectTarget;
    const rejectionReason = rejectReason;
    setRejectTarget(null);
    try {
      await rejectPendingBusDriver(driverId, rejectionReason);
      await refreshPendingBusDrivers();
      toast.success('Bus driver request updated');
    } catch (error) {
      toast.error(error?.message || 'Failed to reject bus driver request');
    }
  };

  useEffect(() => {
    if (typeof getDrivers !== 'function') {
      setOwnerDrivers([]);
      return undefined;
    }

    let active = true;
    const loadDrivers = async () => {
      try {
        const result = await getDrivers();
        if (!active) return;
        setOwnerDrivers(Array.isArray(result) ? result : []);
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Failed to load owner drivers');
      }
    };

    loadDrivers();
    return () => {
      active = false;
    };
  }, [getDrivers, hostReloadKey]);

  useEffect(() => {
    if (currentMode === 'create') return;
    const selectedBus = catalog.find((item) => item.id === selectedBusId);
    if (selectedBus) {
      const loadedDraft = JSON.parse(JSON.stringify(selectedBus));
      setDraft(loadedDraft);
      resetBaseline(loadedDraft);
    }
  }, [catalog, currentMode, selectedBusId, resetBaseline]);

  const totalSeats = useMemo(() => countTotalSeats(draft.blueprint), [draft.blueprint]);
  const totalStops = draft.route?.stops?.length || 0;
  const totalSchedules = draft.schedules?.length || 0;
  const isCreateFlowMode = currentMode === 'edit' || currentMode === 'create';
  const currentFormStepIndex = useMemo(
    () => (isCreateFlowMode ? getCreateFlowStepIndex(searchParams) : 0),
    [isCreateFlowMode, searchParams],
  );
  const currentFormStep = CREATE_FLOW_STEPS[currentFormStepIndex] || CREATE_FLOW_STEPS[0];
  const isLastFormStep = currentFormStepIndex === CREATE_FLOW_STEPS.length - 1;
  const basicStepComplete = Boolean(
    String(draft.operatorName || '').trim() && String(draft.busName || '').trim(),
  );
  const experienceStepComplete = Boolean(
    String(draft.boardingPolicy || '').trim()
      && String(draft.cancellationPolicy || '').trim()
      && String(draft.luggagePolicy || '').trim(),
  );
  const layoutStepComplete = totalSeats > 0;
  const routeStepComplete = Boolean(
    String(draft.route?.originCity || '').trim()
      && String(draft.route?.destinationCity || '').trim()
      && totalSchedules > 0,
  );
  const stepCompletionState = [basicStepComplete, experienceStepComplete, layoutStepComplete, routeStepComplete];
  const canAdvanceFromCurrentStep =
    currentFormStepIndex === 0 ? basicStepComplete :
    currentFormStepIndex === 1 ? experienceStepComplete :
    currentFormStepIndex === 2 ? layoutStepComplete : true;
  const detailBus = useMemo(
    () => catalog.find((item) => item.id === currentBusId || item.id === detailBusId) || null,
    [catalog, currentBusId, detailBusId],
  );
  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return catalog;

    return catalog.filter((bus) =>
      [
        bus.busName,
        bus.operatorName,
        bus.serviceNumber,
        bus.registrationNumber,
        bus.driverName,
        bus.driverPhone,
        bus.route?.routeName,
        bus.route?.originCity,
        bus.route?.destinationCity,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [catalog, catalogSearch]);
  const selectedOwnerDriver = useMemo(
    () => ownerDrivers.find((driver) => String(driver.id) === String(draft.ownerDriverId || '')) || null,
    [draft.ownerDriverId, ownerDrivers],
  );
  const routePreviewPoints = useMemo(() => {
    const points = [
      toCoords(draft.route?.originCoords),
      toCoords(draft.route?.destinationCoords),
    ].filter(Boolean);

    return points;
  }, [draft.route?.destinationCoords, draft.route?.originCoords]);
  const routeMapCenter = useMemo(() => {
    if (routePreviewPoints.length === 0) {
      return { lat: 22.7196, lng: 75.8577 };
    }

    if (routePreviewPoints.length === 1) {
      return routePreviewPoints[0];
    }

    const totals = routePreviewPoints.reduce(
      (acc, point) => ({
        lat: acc.lat + point.lat,
        lng: acc.lng + point.lng,
      }),
      { lat: 0, lng: 0 },
    );

    return {
      lat: totals.lat / routePreviewPoints.length,
      lng: totals.lng / routePreviewPoints.length,
    };
  }, [routePreviewPoints]);
  const routePolylinePath = useMemo(() => {
    if (routePath.length >= 2) {
      return routePath;
    }

    return routePreviewPoints;
  }, [routePath, routePreviewPoints]);
  const filteredOwnerDrivers = useMemo(() => {
    const query = String(driverSearch || '').trim().toLowerCase();
    if (!query) return ownerDrivers.slice(0, 8);
    return ownerDrivers
      .filter((driver) =>
        [driver.name, driver.phone, driver.city, driver.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      )
      .slice(0, 8);
  }, [driverSearch, ownerDrivers]);

  useEffect(() => {
    if (currentMode !== 'edit' || !currentBusId) return;
    const selectedBus = catalog.find((item) => item.id === currentBusId);
    if (selectedBus) {
      const loadedDraft = JSON.parse(JSON.stringify(selectedBus));
      setSelectedBusId(selectedBus.id);
      setDraft(loadedDraft);
      resetBaseline(loadedDraft);
    }
  }, [catalog, currentBusId, currentMode, resetBaseline]);

  useEffect(() => {
    if (!isGoogleMapsLoaded || routePreviewPoints.length < 2) {
      setRoutePath([]);
      return undefined;
    }

    const routeCacheKey = getRouteCacheKey(routePreviewPoints[0], routePreviewPoints[1]);
    const cachedRoute = routePreviewCacheRef.current.get(routeCacheKey);
    if (cachedRoute) {
      setRoutePath(cachedRoute);
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      const result = await computeDrivingRoute({
        origin: routePreviewPoints[0],
        destination: routePreviewPoints[1],
        region: 'IN',
      });

      if (cancelled) {
        return;
      }

      if (result.status === 'OK' && result.path.length) {
        routePreviewCacheRef.current.set(routeCacheKey, result.path);
        setRoutePath(result.path);
        return;
      }

      routePreviewCacheRef.current.set(routeCacheKey, routePreviewPoints);
      setRoutePath(routePreviewPoints);
    })();

    return () => {
      cancelled = true;
    };
  }, [isGoogleMapsLoaded, routePreviewPoints]);

  // web: panTo + setZoom(8) for one point, fitBounds(bounds, 60) for the route
  useEffect(() => {
    const map = routeMapRef.current;
    if (!map || !mapReady || routePreviewPoints.length === 0) {
      return;
    }

    if (routePolylinePath.length === 1) {
      map.animateToRegion(regionFor(routePolylinePath[0], 8), 300);
      return;
    }

    map.fitToCoordinates(routePolylinePath.map(toLatLng), {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
  }, [routePolylinePath, routePreviewPoints.length, mapReady]);

  // New Bus / Edit / Next / Previous: bring the form (its step header) to the top of the screen, never leave the
  // person looking at the page header or at the previous step's scroll position.
  useEffect(() => {
    if (!isCreateFlowMode) return undefined;
    const timer = setTimeout(() => {
      scrollNodeIntoView(hostRef.current, formAnchorRef.current, 'start', 16);
    }, 60);
    return () => clearTimeout(timer);
  }, [isCreateFlowMode, currentFormStepIndex, currentMode]);

  const openListView = () => {
    setDetailBusId(null);
    navigate(basePath);
  };

  const openFormStep = (stepIndex) => {
    const nextStepIndex = Math.min(CREATE_FLOW_STEPS.length - 1, Math.max(0, Number(stepIndex) || 0));
    const nextParams = new URLSearchParams(searchParams);
    if (nextStepIndex <= 0) {
      nextParams.delete('step');
    } else {
      nextParams.set('step', String(nextStepIndex + 1));
    }
    setSearchParams(nextParams, { replace: true });
  };

  const goToPreviousFormStep = () => {
    if (currentFormStepIndex <= 0) {
      return;
    }
    openFormStep(currentFormStepIndex - 1);
  };

  const goToNextFormStep = () => {
    if (currentFormStepIndex >= CREATE_FLOW_STEPS.length - 1) {
      return;
    }
    openFormStep(currentFormStepIndex + 1);
  };

  const openEditView = (busId) => {
    setDetailBusId(null);
    setSelectedBusId(busId);
    navigate(`${basePath}/edit/${busId}`);
  };

  const openDetailView = (busId) => {
    navigate(`${basePath}/${busId}`);
  };

  // "0" + typing 10 used to read "010": leading zeros go away as you type (0.5 stays 0.5).
  const cleanNumberInput = (value) => String(value ?? '').replace(/^0+(?=\d)/, '');

  const updateDraft = (field, value) => {
    setDraft((current) => {
      if (field === 'seatPrice') {
        return {
          ...current,
          seatPrice: value,
          variantPricing: {
            seat: value,
            window: value,
            aisle: value,
            sleeper: value,
          },
        };
      }

      return { ...current, [field]: value };
    });
  };

  const updateRouteField = (field, value) => {
    setDraft((current) => ({
      ...current,
      route: {
        ...current.route,
        [field]: value,
        ...(field === 'originCity' ? { originCoords: null } : {}),
        ...(field === 'destinationCity' ? { destinationCoords: null } : {}),
      },
      returnRoute: current.returnRouteEnabled
        ? buildMirroredReturnRoute({
            ...current.route,
            [field]: value,
            ...(field === 'originCity' ? { originCoords: null } : {}),
            ...(field === 'destinationCity' ? { destinationCoords: null } : {}),
          })
        : current.returnRoute,
    }));
  };

  const applyRoutePlace = (field, place) => {
    const cityLabel = getCityLabelFromPlace(place);
    const coords = getCoordsFromPlace(place);

    if (!cityLabel || !coords) {
      toast.error('Pick a valid Indian city from the suggestions.');
      return;
    }

    setDraft((current) => {
      const nextRoute = {
        ...current.route,
        [field]: cityLabel,
        ...(field === 'originCity' ? { originCoords: coords } : { destinationCoords: coords }),
      };

      return {
        ...current,
        route: nextRoute,
        returnRoute: current.returnRouteEnabled ? buildMirroredReturnRoute(nextRoute) : current.returnRoute,
      };
    });
  };

  const geocodeCity = async (cityName) => {
    const trimmedCityName = String(cityName || '').trim();
    const Geocoder = googleMaps?.maps?.Geocoder;
    if (!trimmedCityName || !Geocoder) {
      return null;
    }

    const cacheKey = trimmedCityName.toLowerCase();
    const cachedCity = cityGeocodeCacheRef.current.get(cacheKey);
    if (cachedCity) {
      return cachedCity;
    }

    const geocoder = new Geocoder();

    return new Promise((resolve) => {
      geocoder.geocode(
        {
          address: trimmedCityName,
          componentRestrictions: { country: 'IN' },
          region: 'in',
        },
        (results, status) => {
          if (status !== 'OK' || !Array.isArray(results) || !results[0]) {
            resolve(null);
            return;
          }

          const bestMatch = results.find((item) =>
            Array.isArray(item?.types) &&
            item.types.some((type) =>
              ['locality', 'administrative_area_level_3', 'administrative_area_level_2'].includes(type),
            ),
          ) || results[0];

          const resolvedCity = {
            city: getCityLabelFromPlace(bestMatch),
            coords: getCoordsFromPlace(bestMatch),
          };
          cityGeocodeCacheRef.current.set(cacheKey, resolvedCity);
          resolve(resolvedCity);
        },
      );
    });
  };

  const ensureRouteCoordinates = async () => {
    const fieldsToResolve = [
      {
        field: 'originCity',
        coordsField: 'originCoords',
        label: 'origin',
      },
      {
        field: 'destinationCity',
        coordsField: 'destinationCoords',
        label: 'destination',
      },
    ];

    let nextDraft = draft;

    for (const item of fieldsToResolve) {
      const cityValue = String(nextDraft.route?.[item.field] || '').trim();
      const coordsValue = toCoords(nextDraft.route?.[item.coordsField]);

      if (!cityValue) {
        continue;
      }

      if (coordsValue) {
        continue;
      }

      if (!canUsePlacesAutocomplete) {
        toast.error(`Google city suggestions are not ready. Select a valid Indian ${item.label} city.`);
        return null;
      }

      const resolved = await geocodeCity(cityValue);
      if (!resolved?.coords) {
        toast.error(`Select a valid Indian ${item.label} city from suggestions.`);
        return null;
      }

      const routeWithCoords = {
        ...nextDraft.route,
        [item.field]: resolved.city || cityValue,
        [item.coordsField]: resolved.coords,
      };

      nextDraft = {
        ...nextDraft,
        route: routeWithCoords,
        returnRoute: nextDraft.returnRouteEnabled
          ? buildMirroredReturnRoute(routeWithCoords)
          : nextDraft.returnRoute,
      };
    }

    if (nextDraft !== draft) {
      setDraft(nextDraft);
    }

    return nextDraft;
  };

  const toggleReturnRoute = () => {
    setDraft((current) => {
      const nextEnabled = !current.returnRouteEnabled;
      return {
        ...current,
        returnRouteEnabled: nextEnabled,
        returnRoute: nextEnabled ? buildMirroredReturnRoute(current.route) : current.returnRoute,
      };
    });
  };

  const toggleAmenity = (amenity) => {
    setDraft((current) => {
      const nextAmenities = current.amenities.includes(amenity)
        ? current.amenities.filter((item) => item !== amenity)
        : [...current.amenities, amenity];

      return { ...current, amenities: nextAmenities };
    });
  };

  const handleImageChange = async (field) => {
    const source = await chooseImageSource();
    if (!source) return;
    let file = null;
    try {
      file = await pickImage({ source });
    } catch (error) {
      if (error?.code === 'PERMISSION_DENIED') toast.error(error.message);
      return;
    }
    if (!file) return;

    try {
      const result = await fileToDataUrl(file);
      updateDraft(field, result);
      if (field === 'coverImage' || field === 'image') {
        updateDraft('image', result);
        updateDraft('coverImage', result);
      }
    } catch {
      toast.error('Failed to read selected image');
    }
  };

  const handleGalleryImagesChange = async () => {
    const source = await chooseImageSource();
    if (!source) return;
    let files = [];
    try {
      files = await pickGalleryFiles(source);
    } catch (error) {
      if (error?.code === 'PERMISSION_DENIED') toast.error(error.message);
      return;
    }
    if (!files.length) return;

    try {
      const results = await Promise.all(files.map((file) => fileToDataUrl(file)));
      setDraft((current) => ({
        ...current,
        galleryImages: [
          ...(Array.isArray(current.galleryImages) ? current.galleryImages : []),
          ...results.filter(Boolean),
        ],
      }));
    } catch {
      toast.error('Failed to read one or more gallery images');
    }
  };

  const removeGalleryImage = (indexToRemove) => {
    setDraft((current) => ({
      ...current,
      galleryImages: (Array.isArray(current.galleryImages) ? current.galleryImages : []).filter(
        (_, index) => index !== indexToRemove,
      ),
    }));
  };

  const switchBlueprintTemplate = (templateKey) => {
    setDraft((current) => ({
      ...current,
      blueprint: createBlueprintFromTemplate(templateKey),
    }));
  };

  const updateBlueprintLayoutConfig = (deckKey, field, value) => {
    setDraft((current) => {
      const currentLayoutConfig = current.blueprint?.layoutConfig || {};
      const currentDeckConfig = currentLayoutConfig?.[deckKey] || {};
      const nextDeckConfig = {
        ...currentDeckConfig,
        [field]:
          field === 'enabled'
            ? Boolean(value)
            : field === 'seatType'
              ? value
              : Math.max(0, Number(value || 0)),
      };

      if (field === 'enabled' && !value) {
        nextDeckConfig.rows = 0;
        nextDeckConfig.leftSeats = 0;
        nextDeckConfig.rightSeats = 0;
      }

      if (field === 'enabled' && value && Number(currentDeckConfig.rows || 0) <= 0) {
        nextDeckConfig.rows = deckKey === 'upper' ? 4 : 8;
        nextDeckConfig.leftSeats = Number(currentDeckConfig.leftSeats || 0) || 2;
        nextDeckConfig.rightSeats = Number(currentDeckConfig.rightSeats || 0) || 1;
      }

      const nextLayoutConfig = {
        ...currentLayoutConfig,
        [deckKey]: nextDeckConfig,
      };

      return {
        ...current,
        blueprint: createBusBlueprint(current.blueprint?.templateKey || 'seater_2_2', nextLayoutConfig),
      };
    });
  };

  const toggleSeatStatus = (seatId) => {
    const nextBlueprint = JSON.parse(JSON.stringify(draft.blueprint));

    ['lowerDeck', 'upperDeck'].forEach((deckKey) => {
      nextBlueprint[deckKey] = nextBlueprint[deckKey].map((row) =>
        row.map((cell) => {
          if (cell?.kind === 'seat' && cell.id === seatId) {
            return {
              ...cell,
              status: cell.status === 'blocked' ? 'available' : 'blocked',
            };
          }
          return cell;
        }),
      );
    });

    setDraft((current) => ({ ...current, blueprint: nextBlueprint }));
  };

  const updateStop = (stopId, field, value) => {
    setDraft((current) => ({
      ...current,
      route: {
        ...current.route,
        stops: current.route.stops.map((stop) => (stop.id === stopId ? { ...stop, [field]: value } : stop)),
      },
      returnRoute: current.returnRouteEnabled
        ? buildMirroredReturnRoute({
            ...current.route,
            stops: current.route.stops.map((stop) => (stop.id === stopId ? { ...stop, [field]: value } : stop)),
          })
        : current.returnRoute,
    }));
  };

  const addStop = () => {
    const newStopId = blankStop().id;
    // the new card is drawn on the next render: scroll to it then, so the person sees what was added
    setTimeout(() => {
      scrollNodeIntoView(hostRef.current, stopRefs.current[newStopId], 'center');
    }, 120);
    setDraft((current) => {
      const nextStop = { ...blankStop(), id: newStopId };
      const nextStops = [...current.route.stops, nextStop];
      return {
        ...current,
        route: {
          ...current.route,
          stops: nextStops,
        },
        returnRoute: current.returnRouteEnabled
          ? buildMirroredReturnRoute({
              ...current.route,
              stops: nextStops,
            })
          : current.returnRoute,
      };
    });
  };

  const removeStop = (stopId) => {
    setDraft((current) => ({
      ...current,
      route: {
        ...current.route,
        stops: current.route.stops.filter((stop) => stop.id !== stopId),
      },
      returnRoute: current.returnRouteEnabled
        ? buildMirroredReturnRoute({
            ...current.route,
            stops: current.route.stops.filter((stop) => stop.id !== stopId),
          })
        : current.returnRoute,
    }));
  };

  const updateSchedule = (scheduleId, field, value) => {
    setDraft((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) =>
        schedule.id === scheduleId ? { ...schedule, [field]: value } : schedule,
      ),
    }));
  };

  const toggleScheduleDay = (scheduleId, day) => {
    setDraft((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule;
        const activeDays = schedule.activeDays.includes(day)
          ? schedule.activeDays.filter((item) => item !== day)
          : [...schedule.activeDays, day];
        return { ...schedule, activeDays };
      }),
    }));
  };

  const addSchedule = () => {
    setDraft((current) => ({
      ...current,
      schedules: [...current.schedules, blankSchedule()],
    }));
  };

  const removeSchedule = (scheduleId) => {
    setDraft((current) => ({
      ...current,
      schedules: current.schedules.filter((schedule) => schedule.id !== scheduleId),
    }));
  };

  const updateCancellationRule = (ruleId, field, value) => {
    setDraft((current) => ({
      ...current,
      cancellationRules: (current.cancellationRules || []).map((rule) =>
        rule.id === ruleId ? { ...rule, [field]: value } : rule,
      ),
    }));
  };

  const addCancellationRule = () => {
    setDraft((current) => ({
      ...current,
      cancellationRules: [...(current.cancellationRules || []), blankCancellationRule()],
    }));
  };

  const removeCancellationRule = (ruleId) => {
    setDraft((current) => ({
      ...current,
      cancellationRules: (current.cancellationRules || []).filter((rule) => rule.id !== ruleId),
    }));
  };

  const handleCreateNew = () => {
    const nextDraft = buildFreshDraft();
    setDraft(nextDraft);
    setSelectedBusId(nextDraft.id);
    setDetailBusId(null);
    navigate(`${basePath}/create`);
  };

  const handleDuplicate = () => {
    if (!catalog.some((item) => item.id === draft.id)) {
      toast.error('You can only duplicate a saved bus.');
      return;
    }

    const copy = {
      ...JSON.parse(JSON.stringify(draft)),
      id: `bus-copy-${Date.now()}`,
      busName: `${draft.busName || 'New Bus'} Copy`,
      serviceNumber: '',
      registrationNumber: '',
      driverName: '',
      driverPhone: '',
      busDriverId: '',
      status: ['draft', 'active', 'paused'].includes(defaultStatus) ? defaultStatus : 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDraft(copy);
    setSelectedBusId(copy.id);
    setDetailBusId(null);
    navigate(`${basePath}/create`);
    toast.success('Bus duplicated as a new draft');
  };

  const handleSave = async () => {
    if (!draft.operatorName.trim() || !draft.busName.trim() || !draft.route.originCity.trim() || !draft.route.destinationCity.trim()) {
      toast.error('Add operator, bus name, origin and destination first.');
      return;
    }

    setIsSaving(true);
    try {
      const draftWithCoords = await ensureRouteCoordinates();
      if (!draftWithCoords) {
        return;
      }

      const nextBus = await upsertBus({
        ...draftWithCoords,
        status: draftWithCoords.status || 'draft',
        capacity: totalSeats,
      });

      setCatalog((current) => {
        const existingIndex = current.findIndex((item) => item.id === nextBus.id);

        if (existingIndex >= 0) {
          const nextCatalog = [...current];
          nextCatalog[existingIndex] = nextBus;
          return nextCatalog;
        }

        return [nextBus, ...current];
      });
      setSelectedBusId(nextBus.id);
      setDraft(nextBus);
      resetBaseline(nextBus);
      if (isLastFormStep) {
        // The last step is "finish": go back to the bus page (list) instead of staying inside the form.
        navigate(basePath);
        toast.success('Bus service saved');
      } else {
        navigate({
          pathname: `${basePath}/edit/${nextBus.id}`,
          search: currentFormStepIndex > 0 ? `?step=${currentFormStepIndex + 1}` : '',
        });
        toast.success('Draft saved');
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to save bus service');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!catalog.some((item) => item.id === draft.id)) {
      const nextDraft = buildFreshDraft();
      setSelectedBusId(nextDraft.id);
      setDraft(nextDraft);
      navigate(basePath);
      toast.success('Unsaved draft cleared');
      return;
    }

    if (!(await confirmAsync('Are you sure you want to delete this bus?'))) {
      return;
    }

    setIsSaving(true);
    try {
      await deleteBus(draft.id);
      const nextCatalog = catalog.filter((bus) => bus.id !== draft.id);
      setCatalog(nextCatalog);
      const fallback = nextCatalog[0] || buildFreshDraft();
      setSelectedBusId(fallback.id);
      setDraft(fallback);
      setDetailBusId(null);
      navigate(basePath);
      toast.success('Bus service removed');
    } catch (error) {
      toast.error(error?.message || 'Failed to remove bus service');
    } finally {
      setIsSaving(false);
    }
  };

  const ownerFlow = typeof api.getDrivers === 'function';

  // ------------------------------------------------------------------ header
  const renderHeader = () => (
    <View style={s.hero}>
      <View>
        <View style={s.heroBadge}>
          <Bus size={14} color={colors.amber[900]} />
          <Text style={[tx(10, '700', colors.amber[900]), track(10, 0.05), s.upper]}>{badgeLabel}</Text>
        </View>
        <Text style={[tx(24, '700', colors.slate[900]), track(24, -0.025)]}>{title}</Text>
        <Text style={[tx(14, '500', colors.slate[600], { lineHeight: 22.75 }), { marginTop: 16 }]}>{description}</Text>
      </View>

      <View style={s.heroButtons}>
        <Btn onPress={handleCreateNew} style={[s.amberBtn, shadow.sm]} pressedStyle={s.amberBtnPressed}>
          <Plus size={16} color={colors.slate[900]} />
          <Text style={tx(14, '900', colors.slate[900])}>New Bus</Text>
        </Btn>
        <Btn onPress={handleDuplicate} style={s.whiteAmberBtn} pressedStyle={s.amberBtnPressed}>
          <CopyPlus size={16} color={colors.slate[900]} />
          <Text style={tx(14, '900', colors.slate[900])}>Duplicate</Text>
        </Btn>
      </View>

      <View style={s.heroStats}>
        {[
          { label: 'Total Capacity', value: totalSeats, Icon: Armchair },
          { label: 'Stops Configured', value: totalStops, Icon: Route },
          { label: 'Schedules', value: totalSchedules, Icon: CalendarDays },
        ].map(({ label, value, Icon }) => (
          <View key={label} style={s.heroStat}>
            <Text style={[tx(10, '700', colors.slate[500]), track(10, 0.05), s.upper]}>{label}</Text>
            <View style={s.heroStatRow}>
              <Text style={tx(30, '700', colors.slate[900])}>{String(value)}</Text>
              <Icon size={24} color={colors.amber[500]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  // ------------------------------------------------------------------ list
  const renderList = () => (
    <View style={s.card32}>
      <View>
        <Text style={[tx(20, '900', colors.slate[900]), track(20, -0.025)]}>Bus Services</Text>
        <Text style={[tx(14, '500', colors.slate[500]), { marginTop: 4 }]}>Manage coaches, routes, assigned drivers, pricing and schedules.</Text>
      </View>

      <View style={[s.gap3, { marginTop: 20 }]}>
        <View style={s.showRow}>
          <Text style={tx(14, '600', colors.slate[400])}>show</Text>
          <View style={s.showBox}>
            <Text style={tx(14, '900', colors.slate[900])}>{String(filteredCatalog.length)}</Text>
          </View>
          <Text style={tx(14, '600', colors.slate[400])}>entries</Text>
        </View>

        <View style={s.searchWrap}>
          <View style={s.searchIcon} pointerEvents="none">
            <Search size={18} color={colors.slate[400]} />
          </View>
          <Field
            style={{ paddingLeft: 44 }}
            placeholder="Search buses"
            value={catalogSearch}
            onChangeText={setCatalogSearch}
          />
        </View>

        <Btn onPress={handleCreateNew} style={[s.amberBtn, s.btnCenter, { paddingHorizontal: 20 }, shadow.sm]} pressedStyle={s.amberBtnPressed}>
          <Plus size={16} color={colors.slate[900]} />
          <Text style={tx(14, '900', colors.slate[900])}>Add Bus Service</Text>
        </Btn>
      </View>

      {pendingBusDrivers.length > 0 ? (
        <View style={s.pendingBox}>
          <Text style={[tx(10, '900', colors.amber[600]), track(10, 0.18), s.upper]}>Pending Bus Driver Requests</Text>
          <Text style={[tx(18, '900', colors.slate[900]), { marginTop: 4 }]}>{`${pendingBusDrivers.length} waiting for approval`}</Text>
          <View style={[s.gap3, { marginTop: 16 }]}>
            {pendingBusDrivers.map((item) => (
              <View key={item.id || item._id} style={s.pendingCard}>
                <Text style={tx(14, '900', colors.slate[900])}>{item.name || 'Bus Driver'}</Text>
                <Text style={[tx(12, '700', colors.slate[500]), { marginTop: 4 }]}>{`${item.phone || 'No phone'}${item.email ? ` - ${item.email}` : ''}`}</Text>
                <Text style={[tx(12, '400', colors.slate[500]), { marginTop: 8 }]}>
                  {`${item.operatorName || 'Operator'} - ${item.busName || 'Bus'}${item.serviceNumber ? ` - ${item.serviceNumber}` : ''}`}
                </Text>
                <Text style={[tx(12, '400', colors.slate[500]), { marginTop: 4 }]}>{`${item.originCity || 'Origin'} to ${item.destinationCity || 'Destination'}`}</Text>
                <View style={[s.row, { gap: 8, marginTop: 12 }]}>
                  <Btn onPress={() => handleApprovePendingBusDriver(item.id || item._id)} style={s.approveBtn}>
                    <Text style={tx(12, '900', colors.white)}>Approve</Text>
                  </Btn>
                  <Btn onPress={() => handleRejectPendingBusDriver(item.id || item._id)} style={s.rejectBtn}>
                    <Text style={tx(12, '900', colors.rose[600])}>Reject</Text>
                  </Btn>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[s.gap2, { marginTop: 20 }]}>
        {isLoadingCatalog ? (
          <View style={s.listEmpty}>
            <Text style={[tx(14, '700', colors.slate[400]), s.center]}>Loading bus services...</Text>
          </View>
        ) : filteredCatalog.length === 0 ? (
          <View style={s.listEmpty}>
            <Text style={[tx(14, '700', colors.slate[400]), s.center]}>{emptyLabel}</Text>
          </View>
        ) : (
          filteredCatalog.map((bus) => (
            <View key={`mobile-catalog-${bus.id}`} style={s.busCard}>
              <View style={s.rowBetweenStart}>
                <View style={s.flexShrink}>
                  <Text style={tx(16, '900', colors.slate[900])} numberOfLines={1}>{bus.busName || 'Untitled Bus'}</Text>
                  <Text style={[tx(14, '600', colors.slate[500]), { marginTop: 4 }]} numberOfLines={1}>{bus.operatorName || 'Operator not set'}</Text>
                </View>
                <StatusPill status={bus.status} />
              </View>
              <Grid2 style={{ marginTop: 16 }}>
                {[
                  ['Route', `${bus.route?.originCity || 'Origin'} to ${bus.route?.destinationCity || 'Destination'}`],
                  ['Fare', `Rs ${bus.seatPrice || 0}`],
                  ['Commission / Tax', `${bus.adminCommissionPercentage || 0}% / ${bus.serviceTaxPercentage || 0}%`],
                  ['Driver', bus.driverName || 'Not assigned'],
                  ['Seats', String(countTotalSeats(bus.blueprint))],
                ].map(([label, value]) => (
                  <View key={label} style={s.miniCell}>
                    <Text style={[tx(9, '900', colors.slate[400]), track(9, 0.05), s.upper]}>{label}</Text>
                    <Text style={[tx(12, '700', colors.slate[900]), { marginTop: 4 }]}>{value}</Text>
                  </View>
                ))}
              </Grid2>
              <View style={[s.row, { gap: 8, marginTop: 16 }]}>
                <Btn onPress={() => openEditView(bus.id)} style={[s.blueBtn, s.flex1, s.btnCenter]} pressedStyle={s.blueBtnPressed}>
                  <Text style={tx(14, '900', colors.white)}>Edit</Text>
                </Btn>
                <Btn onPress={() => openDetailView(bus.id)} style={[s.outlineBtn, s.flex1, s.btnCenter]} pressedStyle={s.outlinePressed}>
                  <Text style={tx(14, '900', colors.slate[700])}>View</Text>
                </Btn>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );

  // ------------------------------------------------------------------ details
  const sectionKicker = (text, color = colors.slate[400]) => (
    <Text style={[tx(10, '900', color), track(10, 0.24), s.upper]}>{text}</Text>
  );

  const renderDetails = () => (
    <View style={[s.card32, s.gap5]}>
      <View style={s.gap4}>
        <View>
          <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.28), s.upper]}>Bus Details</Text>
          <Text style={[tx(30, '900', colors.slate[900]), track(30, -0.025), { marginTop: 8 }]}>{detailBus.busName || 'Untitled Bus'}</Text>
          <Text style={[tx(14, '600', colors.slate[500]), { marginTop: 8 }]}>
            {`${detailBus.operatorName || 'Operator'} | ${detailBus.serviceNumber || 'No service number'} | ${detailBus.registrationNumber || 'No registration'}`}
          </Text>
        </View>

        <View style={s.wrapRow}>
          <Btn onPress={openListView} style={[s.outlineBtn, { paddingHorizontal: 20 }]} pressedStyle={s.outlinePressed}>
            <Text style={tx(14, '900', colors.slate[700])}>Back To List</Text>
          </Btn>
          <Btn onPress={() => openEditView(detailBus.id)} style={[s.blueBtn, { paddingHorizontal: 20 }, shadow.lg]} pressedStyle={s.blueBtnPressed}>
            <Text style={tx(14, '900', colors.white)}>Edit Bus</Text>
          </Btn>
        </View>
      </View>

      <View style={s.card28Soft}>
        {sectionKicker('Route Overview')}
        <Text style={[tx(20, '900', colors.slate[900]), { marginTop: 12 }]}>
          {`${detailBus.route?.originCity || 'Origin'} to ${detailBus.route?.destinationCity || 'Destination'}`}
        </Text>
        <Text style={[tx(14, '600', colors.slate[500]), { marginTop: 4 }]}>{detailBus.route?.routeName || 'Route name not configured'}</Text>
        <View style={[s.gap3, { marginTop: 16 }]}>
          {[
            ['Distance', formatRouteDistance(detailBus.route?.distanceKm)],
            ['Duration', formatRouteDuration(detailBus.route?.durationHours)],
            ['Stops', String(detailBus.route?.stops?.length || 0)],
          ].map(([label, value]) => (
            <View key={label} style={s.whiteCell}>
              <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.05), s.upper]}>{label}</Text>
              <Text style={[tx(14, '900', colors.slate[900]), { marginTop: 4 }]}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={[s.gap3, { marginTop: 20 }]}>
          {(detailBus.route?.stops || []).map((stop, index) => (
            <View key={stop.id || `${detailBus.id}-stop-${index}`} style={s.whiteCell}>
              <View style={s.rowBetweenStart}>
                <View style={s.flexShrink}>
                  <Text style={tx(14, '900', colors.slate[900])}>{stop.city || 'City not set'}</Text>
                  <Text style={[tx(12, '600', colors.slate[500]), { marginTop: 4 }]}>{stop.pointName || 'Point not set'}</Text>
                </View>
                <View style={s.alignEnd}>
                  <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.05), s.upper]}>{stop.stopType || 'stop'}</Text>
                  <Text style={[tx(12, '600', colors.slate[500]), { marginTop: 4 }]}>{`${stop.arrivalTime || '--:--'} | ${stop.departureTime || '--:--'}`}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card28}>
        {sectionKicker('Policies')}
        <View style={[s.gap4, { marginTop: 16 }]}>
          {[
            ['Boarding', detailBus.boardingPolicy],
            ['Cancellation', detailBus.cancellationPolicy],
            ['Luggage', detailBus.luggagePolicy],
          ].map(([label, value]) => (
            <View key={label}>
              <Text style={[tx(12, '900', colors.slate[500]), track(12, 0.05), s.upper]}>{label}</Text>
              <Text style={[tx(14, '600', colors.slate[700]), { marginTop: 4 }]}>{value || 'Not set'}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card28}>
        {sectionKicker('Amenities')}
        <View style={[s.wrapRow, { gap: 8, marginTop: 16 }]}>
          {(detailBus.amenities || []).length > 0 ? (
            detailBus.amenities.map((amenity) => (
              <View key={amenity} style={s.amenityTag}>
                <Text style={tx(11, '900', colors.slate[700])}>{amenity}</Text>
              </View>
            ))
          ) : (
            <Text style={tx(14, '600', colors.slate[500])}>No amenities configured.</Text>
          )}
        </View>
      </View>

      <View style={s.darkCard}>
        {sectionKicker('Coach Summary')}
        <View style={[s.gap3, { marginTop: 16 }]}>
          {[
            ['Coach Type', detailBus.coachType || 'N/A'],
            ['Category', detailBus.busCategory || 'N/A'],
            ['Seat Capacity', String(countTotalSeats(detailBus.blueprint))],
            ['Fare', `Rs ${detailBus.seatPrice || 0} ${detailBus.fareCurrency || 'INR'}`],
            ['Commission', `${detailBus.adminCommissionPercentage || 0}%`],
            ['Service Tax', `${detailBus.serviceTaxPercentage || 0}%`],
          ].map(([label, value]) => (
            <View key={label} style={s.darkCell}>
              <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.05), s.upper]}>{label}</Text>
              <Text style={[tx(14, '900', colors.white), { marginTop: 4 }]}>{value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card28}>
        {sectionKicker('Driver Assignment')}
        <View style={[s.gap3, { marginTop: 16 }]}>
          {[
            ['Driver Name', detailBus.driverName || 'Not assigned'],
            ['Driver Phone', detailBus.driverPhone || 'Not assigned'],
          ].map(([label, value]) => (
            <View key={label} style={s.slateCell}>
              <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.05), s.upper]}>{label}</Text>
              <Text style={[tx(14, '900', colors.slate[900]), { marginTop: 4 }]}>{value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card28}>
        {sectionKicker('Schedules')}
        <View style={[s.gap3, { marginTop: 16 }]}>
          {(detailBus.schedules || []).map((schedule, index) => (
            <View key={schedule.id || `${detailBus.id}-schedule-${index}`} style={s.slateCell}>
              <View style={s.rowBetweenStart}>
                <View style={s.flexShrink}>
                  <Text style={tx(14, '900', colors.slate[900])}>{schedule.label || `Schedule ${index + 1}`}</Text>
                  <Text style={[tx(12, '600', colors.slate[500]), { marginTop: 4 }]}>{`${schedule.departureTime || '--:--'} to ${schedule.arrivalTime || '--:--'}`}</Text>
                </View>
                <StatusPill status={schedule.status} size={9} padH={8} padV={4} />
              </View>
              <Text style={[tx(11, '600', colors.slate[500]), { marginTop: 12 }]}>{(schedule.activeDays || []).join(', ') || 'No active days'}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card28}>
        {sectionKicker('Cancellation Slabs')}
        <View style={[s.gap3, { marginTop: 16 }]}>
          {(detailBus.cancellationRules || []).length > 0 ? (
            detailBus.cancellationRules.map((rule, index) => (
              <View key={rule.id || `${detailBus.id}-cancel-${index}`} style={s.slateCell}>
                <View style={s.rowBetweenStart}>
                  <View style={s.flexShrink}>
                    <Text style={tx(14, '900', colors.slate[900])}>{rule.label || `Slab ${index + 1}`}</Text>
                    <Text style={[tx(12, '600', colors.slate[500]), { marginTop: 4 }]}>{`${rule.hoursBeforeDeparture ?? 0} hours before departure`}</Text>
                  </View>
                  <Text style={[tx(12, '900', colors.slate[500]), track(12, 0.05), s.upper]}>
                    {rule.refundType === 'percentage'
                      ? `${rule.refundValue ?? 0}% refund`
                      : rule.refundType === 'fixed'
                        ? `Rs ${rule.refundValue ?? 0} refund`
                        : 'No refund'}
                  </Text>
                </View>
                <Text style={[tx(11, '600', colors.slate[500]), { marginTop: 12 }]}>{rule.notes || 'No extra notes.'}</Text>
              </View>
            ))
          ) : (
            <Text style={tx(14, '600', colors.slate[500])}>No hourly cancellation slabs configured.</Text>
          )}
        </View>
      </View>
    </View>
  );

  // ------------------------------------------------------------------ create / edit form
  const renderStepsCard = () => (
    <View style={s.card24}>
      <View style={s.rowBetweenStart}>
        <View style={s.flexShrink}>
          <Text style={tx(14, '700', colors.slate[900])}>Creation Flow</Text>
          <Text style={[tx(12, '500', colors.slate[500]), { marginTop: 4 }]}>Move one block at a time, like the signup journey.</Text>
        </View>
        <View style={s.stepBadge}>
          <Text style={[tx(10, '900', colors.slate[500]), track(10, 0.18), s.upper]}>{currentFormStep.shortLabel}</Text>
        </View>
      </View>

      <View style={[s.gap3, { marginTop: 20 }]}>
        {CREATE_FLOW_STEPS.map((step, index) => {
          const isActive = index === currentFormStepIndex;
          const isComplete = stepCompletionState[index] && index < currentFormStepIndex;
          return (
            <Pressable
              key={step.key}
              onPress={() => openFormStep(index)}
              style={[s.stepCard, isActive ? s.stepCardActive : null]}
            >
              <View style={s.rowBetweenStart}>
                <View style={s.flexShrink}>
                  <Text style={[tx(10, '900', isActive ? colors.amber[600] : colors.slate[400]), track(10, 0.18), s.upper]}>{step.shortLabel}</Text>
                  <Text style={[tx(14, '900', colors.slate[900]), { marginTop: 4 }]}>{step.title}</Text>
                  <Text style={[tx(12, '600', isActive ? alpha(colors.amber[900], 0.7) : colors.slate[500]), { marginTop: 4 }]}>{step.description}</Text>
                </View>
                <View
                  style={[
                    s.stepNum,
                    isActive
                      ? { borderColor: colors.amber[300], backgroundColor: colors.amber[200] }
                      : isComplete
                        ? { borderColor: colors.emerald[200], backgroundColor: colors.emerald[50] }
                        : { borderColor: colors.slate[200], backgroundColor: colors.white },
                  ]}
                >
                  {isComplete ? (
                    <CheckCircle2 size={16} color={colors.emerald[600]} />
                  ) : (
                    <Text style={tx(11, '900', isActive ? colors.amber[800] : colors.slate[400])}>{String(index + 1)}</Text>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const toggleChip = (active, label, onPress, padH = 16) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[
        s.chip,
        { paddingHorizontal: padH },
        active
          ? { borderColor: colors.amber[300], backgroundColor: colors.amber[100], ...shadow.sm }
          : { borderColor: colors.slate[100], backgroundColor: colors.white },
      ]}
    >
      <Text style={[tx(10, '700', active ? colors.amber[800] : colors.slate[400]), track(10, 0.05), s.upper]}>{label}</Text>
    </Pressable>
  );

  const renderBasicsFields = () => (
    <>
      <View>
        <Label>{ownerFlow ? 'Assign Fleet Driver' : 'Bus Driver Name'}</Label>
        {ownerFlow ? (
          <View style={s.gap3}>
            <Field
              value={driverSearch}
              onChangeText={setDriverSearch}
              placeholder="Search owner drivers by name or phone"
            />
            <ScrollView style={s.driverList} contentContainerStyle={s.driverListContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredOwnerDrivers.length === 0 ? (
                <Text style={[tx(12, '600', colors.slate[500]), { paddingHorizontal: 12, paddingVertical: 16 }]}>No matching fleet drivers found.</Text>
              ) : (
                filteredOwnerDrivers.map((driver) => {
                  const isActive = String(draft.ownerDriverId || '') === String(driver.id);
                  return (
                    <Pressable
                      key={driver.id}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          ownerDriverId: driver.id,
                          driverName: driver.name || '',
                          driverPhone: driver.phone || '',
                        }))
                      }
                      style={[s.driverCard, isActive ? s.driverCardActive : null]}
                    >
                      <Text style={tx(14, '900', isActive ? colors.white : colors.slate[900])}>{driver.name || 'Driver'}</Text>
                      <Text style={[tx(12, '600', isActive ? colors.white : colors.slate[500]), { marginTop: 4 }]}>
                        {`${driver.phone || 'No phone'}${driver.city ? ` | ${driver.city}` : ''}`}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            {selectedOwnerDriver ? (
              <Pressable
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    ownerDriverId: '',
                    driverName: '',
                    driverPhone: '',
                  }))
                }
                style={s.selfStart}
              >
                <Text style={tx(12, '700', colors.rose[600])}>Clear assigned driver</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Field value={draft.driverName || ''} onChangeText={(text) => updateDraft('driverName', text)} placeholder="Enter Driver Name" />
        )}
      </View>
      <View>
        <Label>{ownerFlow ? 'Assigned Driver Phone' : 'Bus Driver Phone'}</Label>
        {/* Owner flow: the phone comes from the fleet driver picked above and cannot be typed. */}
        {ownerFlow && draft.driverPhone ? (
          <Pressable onPress={() => openPhone(draft.driverPhone)} style={s.phoneLink}>
            <Text style={tx(14, '700', colors.blue[700])}>{draft.driverPhone}</Text>
          </Pressable>
        ) : (
          <Field
            style={ownerFlow ? s.readonlyField : null}
            value={draft.driverPhone || ''}
            onChangeText={(text) => updateDraft('driverPhone', text.replace(/\D/g, '').slice(0, 10))}
            placeholder={ownerFlow ? 'Fills in when you pick a driver above' : 'Enter Phone Number'}
            editable={!ownerFlow}
            keyboardType="phone-pad"
          />
        )}
        {ownerFlow && !draft.driverPhone ? (
          <Text style={[tx(11, '600', colors.amber[600]), { marginTop: 6 }]}>
            Tap a driver card under &quot;Assign Fleet Driver&quot; to fill this.
          </Text>
        ) : null}
      </View>
      <View>
        <Label>Operator Name</Label>
        <Field value={draft.operatorName} onChangeText={(text) => updateDraft('operatorName', text)} placeholder="Enter Operator Name" />
      </View>
      <View>
        <Label>Bus Name</Label>
        <Field value={draft.busName} onChangeText={(text) => updateDraft('busName', text)} placeholder="Enter Bus Name" />
      </View>
      <View>
        <Label>Service Number</Label>
        <Field value={draft.serviceNumber} onChangeText={(text) => updateDraft('serviceNumber', text)} placeholder="Enter Service Number" />
      </View>
      <View>
        <Label>Registration Number</Label>
        <Field value={draft.registrationNumber} onChangeText={(text) => updateDraft('registrationNumber', text.toUpperCase())} placeholder="Enter Registration Number" autoCapitalize="characters" />
      </View>
      <View>
        <Label>Coach Type</Label>
        <View style={s.gap3}>
          <SelectField
            title="Coach Type"
            value={coachTypeOptions.includes(draft.coachType) ? draft.coachType : '__custom__'}
            options={[...coachTypeOptions.map((option) => ({ value: option, label: option })), { value: '__custom__', label: 'Custom Coach Type' }]}
            onSelect={(next) => updateDraft('coachType', next === '__custom__' ? '' : next)}
          />
          {!coachTypeOptions.includes(draft.coachType) || !draft.coachType ? (
            <Field
              value={draft.coachType}
              onChangeText={(text) => updateDraft('coachType', text)}
              placeholder="Enter custom coach type"
            />
          ) : null}
        </View>
      </View>
      <View>
        <Label>Category</Label>
        <SelectField
          title="Category"
          value={draft.busCategory}
          options={['Sleeper', 'Seater', 'Semi Sleeper', 'Electric Coach'].map((option) => ({ value: option, label: option }))}
          onSelect={(next) => updateDraft('busCategory', next)}
        />
      </View>
      <View>
        <Label>Seat Price</Label>
        <Field value={draft.seatPrice} onChangeText={(text) => updateDraft('seatPrice', text)} placeholder="1199" keyboardType="decimal-pad" />
      </View>
      <View>
        <Label>Bus Commission %</Label>
        <Field
          keyboardType="decimal-pad"
          value={draft.adminCommissionPercentage}
          onChangeText={(text) => updateDraft('adminCommissionPercentage', cleanNumberInput(text))}
          placeholder="10"
        />
      </View>
      <View>
        <Label>Service Tax %</Label>
        <Field
          keyboardType="decimal-pad"
          value={draft.serviceTaxPercentage}
          onChangeText={(text) => updateDraft('serviceTaxPercentage', cleanNumberInput(text))}
          placeholder="5"
        />
      </View>
      <View>
        <Label>Currency</Label>
        <SelectField
          title="Currency"
          value={draft.fareCurrency || 'INR'}
          options={[...new Set(['INR', 'USD', 'EUR', 'GBP', 'AED', draft.fareCurrency].filter(Boolean))].map((code) => ({ value: code, label: CURRENCY_LABELS[code] || code }))}
          onSelect={(next) => updateDraft('fareCurrency', next)}
        />
      </View>
    </>
  );

  const renderExperienceFields = () => (
    <>
      <View>
        <Label>Different Seat Pricing</Label>
        <View style={s.gap4}>
          {VARIANT_PRICING_FIELDS.map((field) => (
            <View key={field.key}>
              <Text style={[tx(12, '700', colors.slate[500]), { marginBottom: 8 }]}>{field.label}</Text>
              <Field
                keyboardType="decimal-pad"
                value={draft.variantPricing?.[field.key] ?? ''}
                onChangeText={(text) =>
                  setDraft((current) => ({
                    ...current,
                    variantPricing: {
                      ...(current.variantPricing || {}),
                      [field.key]: text,
                    },
                  }))
                }
                placeholder="0"
              />
            </View>
          ))}
        </View>
      </View>
      <View>
        <Label>Bus Main Image</Label>
        <View style={s.coverOuter}>
          <View style={s.coverInner}>
            {draft.coverImage ? (
              <>
                <AppImage src={draft.coverImage} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Pressable
                  onPress={() => {
                    updateDraft('image', '');
                    updateDraft('coverImage', '');
                  }}
                  style={({ pressed }) => [s.coverDelete, pressed ? { backgroundColor: colors.rose[500] } : null]}
                >
                  {({ pressed }) => <Trash2 size={16} color={pressed ? colors.white : colors.rose[500]} />}
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => handleImageChange('coverImage')} style={s.coverPick}>
                <View style={s.uploadIcon}>
                  <Upload size={20} color={colors.orange[500]} />
                </View>
                <Text style={[tx(14, '700', colors.slate[700]), s.center]}>Upload main bus image</Text>
                <Text style={[tx(12, '500', colors.slate[400]), s.center]}>This becomes the primary preview for the bus card and details page.</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
      <View>
        <View style={[s.rowBetween, { marginBottom: 12, gap: 12 }]}>
          <View style={s.flexShrink}>
            <Label>Bus Gallery Images</Label>
            <Text style={tx(12, '500', colors.slate[500])}>Add extra interior or exterior images for the bus details page.</Text>
          </View>
          <Btn onPress={handleGalleryImagesChange} style={[s.amberBtn, shadow.sm]} pressedStyle={s.amberBtnPressed}>
            <ImagePlus size={14} color={colors.slate[900]} />
            <Text style={tx(12, '700', colors.slate[900])}>Add Gallery Images</Text>
          </Btn>
        </View>

        {(draft.galleryImages || []).length ? (
          <View style={s.gap3}>
            {draft.galleryImages.map((image, index) => (
              <View key={`bus-gallery-${index}`} style={s.galleryCard}>
                <View style={s.galleryImgWrap}>
                  <AppImage src={image} style={s.galleryImg} contentFit="cover" />
                  <Pressable onPress={() => removeGalleryImage(index)} style={s.galleryDelete}>
                    <Trash2 size={14} color={colors.rose[500]} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={s.galleryEmpty}>
            <Text style={tx(14, '600', colors.slate[500])}>No gallery images added yet.</Text>
          </View>
        )}
      </View>
      <View>
        <Label>Amenities</Label>
        <View style={[s.wrapRow, { gap: 8 }]}>
          {AMENITY_OPTIONS.map((amenity) => toggleChip(draft.amenities.includes(amenity), amenity, () => toggleAmenity(amenity)))}
        </View>
      </View>
      <View>
        <Label>Boarding Policy</Label>
        <Field multiline value={draft.boardingPolicy} onChangeText={(text) => updateDraft('boardingPolicy', text)} />
      </View>
      <View>
        <Label>Cancellation Policy</Label>
        <Field multiline value={draft.cancellationPolicy} onChangeText={(text) => updateDraft('cancellationPolicy', text)} />
      </View>
      <View>
        <Label>Luggage Policy</Label>
        <Field multiline value={draft.luggagePolicy} onChangeText={(text) => updateDraft('luggagePolicy', text)} />
      </View>
      <View>
        <View style={[s.rowBetween, { marginBottom: 12, gap: 12 }]}>
          <View style={s.flexShrink}>
            <Label>Hourly Cancellation Slabs</Label>
            <Text style={tx(12, '500', colors.slate[500])}>Set refund slabs by hours before departure, with custom percentage or fixed value.</Text>
          </View>
          <Btn onPress={addCancellationRule} style={[s.amberBtn, shadow.sm]} pressedStyle={s.amberBtnPressed}>
            <Plus size={14} color={colors.slate[900]} />
            <Text style={tx(12, '700', colors.slate[900])}>Add Slab</Text>
          </Btn>
        </View>

        <View style={s.gap3}>
          {(draft.cancellationRules || []).map((rule, index) => (
            <View key={rule.id} style={s.subCard24}>
              <View style={[s.rowBetween, { marginBottom: 16 }]}>
                <View style={s.flexShrink}>
                  <Text style={tx(14, '900', colors.slate[900])}>{`Cancellation Slab ${index + 1}`}</Text>
                  <Text style={[tx(11, '600', colors.slate[400]), track(11, 0.025), s.upper]}>Refund rule before departure</Text>
                </View>
                {(draft.cancellationRules || []).length > 1 ? (
                  <Pressable onPress={() => removeCancellationRule(rule.id)} style={({ pressed }) => [s.iconDanger, pressed ? s.iconDangerPressed : null]}>
                    <Trash2 size={16} color={colors.rose[500]} />
                  </Pressable>
                ) : null}
              </View>

              <View style={s.gap4}>
                <Field
                  value={rule.label || ''}
                  onChangeText={(text) => updateCancellationRule(rule.id, 'label', text)}
                  placeholder="48h+ before departure"
                />
                <Field
                  keyboardType="number-pad"
                  value={rule.hoursBeforeDeparture ?? 0}
                  onChangeText={(text) => updateCancellationRule(rule.id, 'hoursBeforeDeparture', text)}
                  placeholder="Hours before departure"
                />
                <SelectField
                  title="Refund Type"
                  value={rule.refundType || 'percentage'}
                  options={[
                    { value: 'percentage', label: 'Refund %' },
                    { value: 'fixed', label: 'Fixed Refund' },
                    { value: 'none', label: 'No Refund' },
                  ]}
                  onSelect={(next) => updateCancellationRule(rule.id, 'refundType', next)}
                />
                <Field
                  keyboardType="decimal-pad"
                  value={rule.refundValue ?? 0}
                  onChangeText={(text) => updateCancellationRule(rule.id, 'refundValue', text)}
                  placeholder={rule.refundType === 'fixed' ? 'Refund amount' : 'Refund percentage'}
                  editable={rule.refundType !== 'none'}
                />
              </View>

              <Field
                multiline
                minHeight={84}
                style={{ marginTop: 16 }}
                value={rule.notes || ''}
                onChangeText={(text) => updateCancellationRule(rule.id, 'notes', text)}
                placeholder="Example: 25% cancellation charge applies in this window."
              />
            </View>
          ))}
        </View>
      </View>
    </>
  );

  const renderSpecSection = () => (
    <View style={s.card24p6}>
      <View style={[s.gap4, { marginBottom: 24 }]}>
        <View>
          <Text style={[tx(20, '700', colors.slate[900]), track(20, -0.025)]}>
            {currentFormStepIndex === 0 ? 'Bus Specification' : 'Bus Experience Setup'}
          </Text>
          <Text style={[tx(12, '500', colors.slate[500]), { marginTop: 4 }]}>
            {currentFormStepIndex === 0
              ? 'Define the essential operator, driver, and pricing details first.'
              : 'Add imagery, amenities, and passenger-facing policies without crowding the rest of the form.'}
          </Text>
        </View>

        {currentFormStepIndex === 0 ? (
          <View style={[s.wrapRow, { gap: 8 }]}>
            {['draft', 'active', 'paused'].map((status) => {
              const active = draft.status === status;
              const tone = toneOf(status);
              return (
                <Pressable
                  key={status}
                  onPress={() => updateDraft('status', status)}
                  style={[
                    s.chip,
                    active
                      ? { borderColor: tone.border, backgroundColor: tone.bg, ...shadow.sm }
                      : { borderColor: colors.slate[100], backgroundColor: colors.white },
                  ]}
                >
                  <Text style={[tx(9, '700', active ? tone.fg : colors.slate[400]), track(9, 0.05), s.upper]}>{status}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={s.countBox}>
            <Text style={tx(14, '700', colors.slate[900])}>{`${(draft.galleryImages || []).length} gallery images`}</Text>
          </View>
        )}
      </View>

      <View style={s.gap5}>
        {currentFormStepIndex === 0 ? renderBasicsFields() : null}
        {currentFormStepIndex === 1 ? renderExperienceFields() : null}
      </View>
    </View>
  );

  const renderLayoutSection = () => (
    <View style={s.card24p6}>
      <View style={[s.gap4, { marginBottom: 32 }]}>
        <View>
          <Text style={[tx(20, '700', colors.slate[900]), track(20, -0.025)]}>Seat Blueprint</Text>
          <Text style={[tx(12, '500', colors.slate[500]), { marginTop: 4 }]}>Build a RedBus-style coach map, customize seat counts, and block inventory visually.</Text>
        </View>
        <View style={[s.countBox, s.selfStart]}>
          <Text style={tx(14, '700', colors.slate[900])}>{`${totalSeats} Seats`}</Text>
        </View>
      </View>

      <View style={[s.wrapRow, { gap: 12, marginBottom: 20 }]}>
        {BUS_BLUEPRINT_TEMPLATES.map((template) => {
          const active = draft.blueprint.templateKey === template.key;
          return (
            <Pressable
              key={template.key}
              onPress={() => switchBlueprintTemplate(template.key)}
              style={[
                s.templateCard,
                active
                  ? { borderColor: colors.amber[200], backgroundColor: colors.amber[50], ...shadow.md, shadowColor: colors.amber[100] }
                  : { borderColor: colors.slate[100], backgroundColor: colors.white },
              ]}
            >
              <Text style={tx(14, '700', active ? colors.slate[900] : colors.slate[500])}>{template.label}</Text>
              <Text style={[tx(9, '700', active ? colors.amber[600] : colors.slate[400]), track(9, 0.05), s.upper]}>{template.category}</Text>
              <Text style={[tx(10, '500', active ? alpha(colors.amber[900], 0.7) : colors.slate[400]), { marginTop: 4 }]}>{template.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[s.gap4, { marginBottom: 24 }]}>
        <BlueprintDeckConfigurator
          title="Lower Deck Setup"
          config={draft.blueprint?.layoutConfig?.lower || { enabled: true, rows: 0, leftSeats: 0, rightSeats: 0, seatType: 'seat' }}
          onChangeField={(field, value) => updateBlueprintLayoutConfig('lower', field, value)}
        />
        <BlueprintDeckConfigurator
          title="Upper Deck Setup"
          config={draft.blueprint?.layoutConfig?.upper || { enabled: false, rows: 0, leftSeats: 0, rightSeats: 0, seatType: 'seat' }}
          onChangeField={(field, value) => updateBlueprintLayoutConfig('upper', field, value)}
        />
      </View>

      <View style={s.gap5}>
        <SeatDeckPreview title="Lower Deck" deckRows={draft.blueprint.lowerDeck} onToggleSeat={toggleSeatStatus} />
        <SeatDeckPreview title="Upper Deck" deckRows={draft.blueprint.upperDeck} onToggleSeat={toggleSeatStatus} />
      </View>

      <View style={[s.wrapRow, { gap: 16, marginTop: 20 }]}>
        <View style={s.legendItem}>
          <View style={[s.legendBox, { borderColor: colors.slate[200], backgroundColor: colors.white }]} />
          <Text style={tx(12, '600', colors.slate[500])}>Available seat</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendBox, { borderColor: colors.rose[200], backgroundColor: colors.rose[50] }]} />
          <Text style={tx(12, '600', colors.slate[500])}>Blocked seat</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendBox, { width: 32, borderColor: colors.sky[200], backgroundColor: colors.sky[50] }]} />
          <Text style={tx(12, '600', colors.slate[500])}>Sleeper berth</Text>
        </View>
      </View>
    </View>
  );

  const coordsHint = (coords) =>
    coords
      ? `Coords: ${Number(coords.lat).toFixed(5)}, ${Number(coords.lng).toFixed(5)}`
      : 'Indian city suggestions only. Select one to store live-tracking coordinates.';

  const renderCityInput = (field, searchPlaceholder, plainPlaceholder) =>
    canUsePlacesAutocomplete ? (
      <CityAutocompleteInput
        value={draft.route[field]}
        onChangeText={(text) => updateRouteField(field, text)}
        onPickPlace={(place) => applyRoutePlace(field, place)}
        placeholder={searchPlaceholder}
      />
    ) : (
      <Field value={draft.route[field]} onChangeText={(text) => updateRouteField(field, text)} placeholder={plainPlaceholder} />
    );

  const renderRouteSection = () => (
    <View style={s.card24p6}>
      <View style={{ marginBottom: 32 }}>
        <Text style={[tx(20, '700', colors.slate[900]), track(20, -0.025)]}>Route Assignment</Text>
        <Text style={[tx(12, '500', colors.slate[500]), { marginTop: 4 }]}>Manage stops, distance and route timings.</Text>
      </View>

      <View style={[s.card28Soft, { marginBottom: 24 }]}>
        <View style={s.gap4}>
          <View>
            <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.2), s.upper]}>Return Route</Text>
            <Text style={[tx(16, '900', colors.slate[900]), { marginTop: 4 }]}>Auto-create mirrored return path</Text>
            <Text style={[tx(12, '500', colors.slate[500]), { marginTop: 4 }]}>
              When enabled, the return path flips origin and destination, reverses stops, and swaps pickup/drop roles automatically.
            </Text>
          </View>

          <Pressable
            onPress={toggleReturnRoute}
            style={[s.returnToggle, draft.returnRouteEnabled ? [s.returnToggleOn, shadow.lg] : s.returnToggleOff]}
          >
            <View style={[s.returnDot, { backgroundColor: draft.returnRouteEnabled ? colors.emerald[400] : colors.slate[300] }]} />
            <Text style={[tx(12, '900', draft.returnRouteEnabled ? colors.white : colors.slate[600]), track(12, 0.18), s.upper]}>
              {draft.returnRouteEnabled ? 'Return On' : 'Return Off'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={s.gap5}>
        <View>
          <Label>Route Name</Label>
          <Field value={draft.route.routeName} onChangeText={(text) => updateRouteField('routeName', text)} placeholder="Indore to Bhopal Night Corridor" />
        </View>
        <View>
          <Label>Distance / Duration</Label>
          <View style={[s.row, { gap: 12 }]}>
            <View style={s.flex1}>
              <Field value={draft.route.distanceKm} onChangeText={(text) => updateRouteField('distanceKm', text)} placeholder="Auto from map" />
            </View>
            <View style={s.flex1}>
              <Field value={draft.route.durationHours} onChangeText={(text) => updateRouteField('durationHours', text)} placeholder="Auto from schedule" />
            </View>
          </View>
          <Text style={[tx(11, '600', colors.slate[400]), { marginTop: 4 }]}>
            On save, distance is taken from Google Maps (road) between origin and destination, and duration from the first active schedule. Stop times must fall inside that schedule.
          </Text>
        </View>
        <View>
          <Label>Origin City</Label>
          {renderCityInput('originCity', 'Search origin city in India', 'Indore')}
          <Text style={[tx(11, '600', colors.slate[500]), { marginTop: 8 }]}>{coordsHint(draft.route.originCoords)}</Text>
        </View>
        <View>
          <Label>Destination City</Label>
          {renderCityInput('destinationCity', 'Search destination city in India', 'Bhopal')}
          <Text style={[tx(11, '600', colors.slate[500]), { marginTop: 8 }]}>{coordsHint(draft.route.destinationCoords)}</Text>
        </View>

        <View style={s.mapCard}>
          <View style={[s.rowBetween, { marginBottom: 12, paddingHorizontal: 8, paddingTop: 8, gap: 8 }]}>
            <View style={s.flexShrink}>
              <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.18), s.upper]}>Route Preview</Text>
              <Text style={[tx(14, '900', colors.slate[900]), { marginTop: 4 }]}>
                {`${draft.route.originCity || 'Origin'} to ${draft.route.destinationCity || 'Destination'}`}
              </Text>
            </View>
            <View style={s.deckBadge}>
              <Text style={[tx(10, '700', colors.slate[500]), track(10, 0.05), s.upper]}>Polyline</Text>
            </View>
          </View>

          <View style={s.mapFrame}>
            {canUsePlacesAutocomplete ? (
              <AppMap
                ref={routeMapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={regionFor(routeMapCenter, routePreviewPoints.length > 1 ? 6 : 5)}
                onMapReady={() => setMapReady(true)}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                {toCoords(draft.route.originCoords) ? (
                  <Marker coordinate={toLatLng(draft.route.originCoords)}>
                    <View style={s.markerPin}>
                      <Text style={tx(12, '700', colors.white)}>A</Text>
                    </View>
                  </Marker>
                ) : null}
                {toCoords(draft.route.destinationCoords) ? (
                  <Marker coordinate={toLatLng(draft.route.destinationCoords)}>
                    <View style={s.markerPin}>
                      <Text style={tx(12, '700', colors.white)}>B</Text>
                    </View>
                  </Marker>
                ) : null}
                {routePolylinePath.length >= 2 ? (
                  <Polyline
                    coordinates={routePolylinePath.map(toLatLng)}
                    strokeColor={alpha('#0f172a', 0.9)}
                    strokeWidth={4}
                    geodesic
                  />
                ) : null}
              </AppMap>
            ) : (
              <View style={s.mapEmpty}>
                <Text style={[tx(14, '600', colors.slate[500]), s.center]}>
                  Add valid Indian origin and destination cities to preview the route on map.
                </Text>
              </View>
            )}
          </View>

          <View style={[s.row, { gap: 12, marginTop: 12 }]}>
            <View style={[s.borderCell, s.flex1]}>
              <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.05), s.upper]}>Start</Text>
              <Text style={[tx(14, '700', colors.slate[900]), { marginTop: 4 }]}>{draft.route.originCity || 'Not set'}</Text>
            </View>
            <View style={[s.borderCell, s.flex1]}>
              <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.05), s.upper]}>End</Text>
              <Text style={[tx(14, '700', colors.slate[900]), { marginTop: 4 }]}>{draft.route.destinationCity || 'Not set'}</Text>
            </View>
          </View>
        </View>
      </View>

      {draft.returnRouteEnabled ? (
        <View style={s.returnCard}>
          <View style={s.gap3}>
            <View>
              <Text style={[tx(10, '900', colors.emerald[600]), track(10, 0.2), s.upper]}>Generated Return Route</Text>
              <Text style={[tx(16, '900', colors.slate[900]), { marginTop: 4 }]}>
                {`${draft.returnRoute.originCity || 'Destination'} to ${draft.returnRoute.destinationCity || 'Origin'}`}
              </Text>
              <Text style={[tx(12, '500', colors.slate[600]), { marginTop: 4 }]}>
                {draft.returnRoute.routeName || 'Return route name will be generated automatically.'}
              </Text>
            </View>
            <View style={[s.returnCell, s.selfStart, { paddingVertical: 12 }]}>
              <Text style={tx(14, '700', colors.slate[900])}>{`${draft.returnRoute.stops.length} return stops`}</Text>
            </View>
          </View>

          <View style={[s.gap4, { marginTop: 16 }]}>
            <View style={[s.returnCell, { padding: 16 }]}>
              <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.05), s.upper]}>Return From</Text>
              <Text style={[tx(14, '900', colors.slate[900]), { marginTop: 8 }]}>{draft.returnRoute.originCity || 'Not generated yet'}</Text>
            </View>
            <View style={[s.returnCell, { padding: 16 }]}>
              <Text style={[tx(10, '900', colors.slate[400]), track(10, 0.05), s.upper]}>Return To</Text>
              <Text style={[tx(14, '900', colors.slate[900]), { marginTop: 8 }]}>{draft.returnRoute.destinationCity || 'Not generated yet'}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={[s.gap4, { marginTop: 24 }]}>
        {draft.route.stops.map((stop, index) => (
          <View
            key={stop.id}
            ref={(node) => {
              if (node) stopRefs.current[stop.id] = node;
              else delete stopRefs.current[stop.id];
            }}
            collapsable={false}
            style={s.subCard26}
          >
            <View style={[s.rowBetween, { marginBottom: 16 }]}>
              <View style={[s.row, { gap: 12 }]}>
                <View style={s.iconTile}>
                  <MapPin size={16} color={colors.indigo[600]} />
                </View>
                <View>
                  <Text style={tx(14, '900', colors.slate[900])}>{`Stop ${index + 1}`}</Text>
                  <Text style={[tx(11, '600', colors.slate[400]), track(11, 0.025), s.upper]}>Pickup / drop configuration</Text>
                </View>
              </View>
              {draft.route.stops.length > 2 ? (
                <Pressable onPress={() => removeStop(stop.id)} style={({ pressed }) => [s.iconDanger, pressed ? s.iconDangerPressed : null]}>
                  <Trash2 size={16} color={colors.rose[500]} />
                </Pressable>
              ) : null}
            </View>

            <View style={s.gap4}>
              <Field value={stop.city} onChangeText={(text) => updateStop(stop.id, 'city', text)} placeholder="City" />
              <Field value={stop.pointName} onChangeText={(text) => updateStop(stop.id, 'pointName', text)} placeholder="Pickup / Drop Point" />
              <SelectField
                title="Stop Type"
                value={stop.stopType}
                options={[
                  { value: 'pickup', label: 'Pickup Only' },
                  { value: 'drop', label: 'Drop Only' },
                  { value: 'both', label: 'Pickup + Drop' },
                ]}
                onSelect={(next) => updateStop(stop.id, 'stopType', next)}
              />
              <TimeField value={stop.arrivalTime} onChangeValue={(next) => updateStop(stop.id, 'arrivalTime', next)} />
              <TimeField value={stop.departureTime} onChangeValue={(next) => updateStop(stop.id, 'departureTime', next)} />
            </View>
          </View>
        ))}
        <Pressable onPress={addStop} style={({ pressed }) => [s.addStopBtn, pressed ? { transform: [{ scale: 0.99 }] } : null]}>
          <Plus size={16} color={colors.slate[800]} />
          <Text style={tx(14, '700', colors.slate[800])}>Add Stop</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderSchedulesSection = () => (
    <View style={s.card24p6}>
      <View style={[s.gap4, { marginBottom: 32 }]}>
        <View>
          <Text style={[tx(20, '700', colors.slate[900]), track(20, -0.025)]}>Departure Schedules</Text>
          <Text style={[tx(12, '500', colors.slate[500]), { marginTop: 4 }]}>Manage recurring service slots and availability.</Text>
        </View>
        <Btn onPress={addSchedule} style={[s.amberBtn, s.selfStart, shadow.sm]} pressedStyle={s.amberBtnPressed}>
          <Plus size={16} color={colors.slate[900]} />
          <Text style={tx(14, '700', colors.slate[900])}>Add Schedule</Text>
        </Btn>
      </View>

      <View style={s.gap4}>
        {draft.schedules.map((schedule, index) => (
          <View key={schedule.id} style={s.subCard26}>
            <View style={[s.rowBetween, { marginBottom: 16 }]}>
              <View style={[s.row, { gap: 12 }]}>
                <View style={s.iconTile}>
                  <Clock3 size={16} color={colors.indigo[600]} />
                </View>
                <View>
                  <Text style={tx(14, '900', colors.slate[900])}>{`Schedule ${index + 1}`}</Text>
                  <Text style={[tx(11, '600', colors.slate[400]), track(11, 0.025), s.upper]}>Recurring service slot</Text>
                </View>
              </View>
              {draft.schedules.length > 1 ? (
                <Pressable onPress={() => removeSchedule(schedule.id)} style={({ pressed }) => [s.iconDanger, pressed ? s.iconDangerPressed : null]}>
                  <XCircle size={16} color={colors.rose[500]} />
                </Pressable>
              ) : null}
            </View>

            <View style={s.gap4}>
              <Field value={schedule.label} onChangeText={(text) => updateSchedule(schedule.id, 'label', text)} placeholder="Daily Evening Service" />
              <TimeField value={schedule.departureTime} onChangeValue={(next) => updateSchedule(schedule.id, 'departureTime', next)} />
              <TimeField value={schedule.arrivalTime} onChangeValue={(next) => updateSchedule(schedule.id, 'arrivalTime', next)} />
              <SelectField
                title="Schedule Status"
                value={schedule.status}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                  { value: 'draft', label: 'Draft' },
                ]}
                onSelect={(next) => updateSchedule(schedule.id, 'status', next)}
              />
            </View>

            <View style={[s.wrapRow, { gap: 8, marginTop: 16 }]}>
              {DAY_OPTIONS.map((day) => toggleChip(schedule.activeDays.includes(day), day, () => toggleScheduleDay(schedule.id, day), 12))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderActionBar = () => (
    <View style={s.actionBar}>
      <View style={s.gap4}>
        {[
          ['Current Step', currentFormStep.title],
          ['Route Snapshot', `${draft.route.originCity || 'Origin'} to ${draft.route.destinationCity || 'Destination'}`],
          ['Inventory', `${totalSeats} seats | ${draft.schedules.length} schedules`],
        ].map(([label, value]) => (
          <View key={label} style={s.snapCell}>
            <Text style={[tx(9, '700', colors.slate[400]), track(9, 0.05), s.upper]}>{label}</Text>
            <Text style={[tx(14, '700', colors.slate[900]), { marginTop: 4 }]}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={[s.wrapRow, { gap: 12, marginTop: 16 }]}>
        <Btn
          onPress={goToPreviousFormStep}
          disabled={currentFormStepIndex === 0 || isSaving}
          style={[s.outlineBtn, { paddingHorizontal: 20 }]}
          pressedStyle={s.outlinePressed}
        >
          <Text style={tx(14, '700', colors.slate[700])}>Previous</Text>
        </Btn>
        {!isLastFormStep ? (
          <Btn
            onPress={goToNextFormStep}
            disabled={!canAdvanceFromCurrentStep || isSaving}
            style={[s.amberStrongBtn, shadow.sm]}
            pressedStyle={s.amberStrongPressed}
          >
            <Text style={tx(14, '700', colors.slate[900])}>Next Step</Text>
          </Btn>
        ) : null}
        <Btn
          onPress={handleDelete}
          disabled={isSaving}
          style={s.deleteBtn}
          pressedStyle={s.deleteBtnPressed}
        >
          <Trash2 size={16} color={colors.rose[500]} />
          <Text style={tx(14, '700', colors.rose[500])}>Delete</Text>
        </Btn>
        <Btn
          onPress={handleSave}
          disabled={isSaving || (currentMode === 'edit' && !isDirty)}
          style={[s.amberStrongBtn, shadow.sm]}
          pressedStyle={s.amberStrongPressed}
        >
          <Save size={16} color={colors.slate[900]} />
          <Text style={tx(14, '700', colors.slate[900])}>{isSaving ? 'Saving...' : isLastFormStep ? 'Save Bus Service' : 'Save Draft'}</Text>
        </Btn>
      </View>
    </View>
  );

  const renderForm = () => (
    <View ref={formAnchorRef} collapsable={false} style={s.gap4}>
      {renderStepsCard()}

      <View style={s.gap6}>
        {currentFormStepIndex <= 1 ? renderSpecSection() : null}
        {currentFormStepIndex === 2 ? renderLayoutSection() : null}
        {currentFormStepIndex === 3 ? (
          <>
            {renderRouteSection()}
            {renderSchedulesSection()}
          </>
        ) : null}
        {renderActionBar()}
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      {renderHeader()}
      {currentMode === 'list' ? renderList() : null}
      {currentMode === 'details' && detailBus ? renderDetails() : null}
      {currentMode === 'edit' || currentMode === 'create' ? renderForm() : null}

      <Dialog open={rejectTarget !== null} onClose={() => setRejectTarget(null)}>
        <View style={s.promptBody}>
          <Text style={tx(16, '700', colors.slate[900])}>Reason for rejection</Text>
          <Field value={rejectReason} onChangeText={setRejectReason} style={{ marginTop: 12 }} />
          <View style={[s.row, { gap: 8, marginTop: 16, justifyContent: 'flex-end' }]}>
            <Btn onPress={() => setRejectTarget(null)} style={s.outlineBtn} pressedStyle={s.outlinePressed}>
              <Text style={tx(14, '700', colors.slate[700])}>Cancel</Text>
            </Btn>
            <Btn onPress={submitRejectPendingBusDriver} style={s.blueBtn} pressedStyle={s.blueBtnPressed}>
              <Text style={tx(14, '700', colors.white)}>OK</Text>
            </Btn>
          </View>
        </View>
      </Dialog>
    </View>
  );
};

// web <a href="tel:...">
function openPhone(phone) {
  Linking.openURL(`tel:${phone}`).catch(() => {});
}

const s = StyleSheet.create({
  root: { gap: 16 },
  flex1: { flex: 1 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBetweenStart: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  alignEnd: { alignItems: 'flex-end' },
  selfStart: { alignSelf: 'flex-start' },
  center: { textAlign: 'center' },
  upper: { textTransform: 'uppercase' },
  gap2: { gap: 8 },
  gap3: { gap: 12 },
  gap4: { gap: 16 },
  gap5: { gap: 20 },
  gap6: { gap: 24 },

  label: { marginBottom: 4, fontSize: 10, lineHeight: 15, fontWeight: '700', color: colors.slate[500] },
  field: {
    width: '100%',
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: colors.slate[800],
    ...shadow.sm,
  },
  fieldDisabled: { opacity: 0.5 },
  fieldText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[800] },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readonlyField: { borderStyle: 'dashed', borderColor: colors.slate[300], backgroundColor: colors.slate[50], color: colors.slate[700], elevation: 0, shadowOpacity: 0 },
  phoneLink: { width: '100%', borderRadius: 16, borderWidth: 1, borderColor: colors.slate[300], backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },

  sheetBody: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  sheetTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900], marginBottom: 8, paddingHorizontal: 4 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 },
  sheetOptionActive: { backgroundColor: colors.blue[50] },
  sheetOptionPressed: { backgroundColor: colors.slate[100] },
  sheetOptionText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[800] },
  sheetOptionTextActive: { fontWeight: '800', color: colors.blue[700] },
  sheetDone: { marginTop: 8, alignSelf: 'stretch', alignItems: 'center', borderRadius: 16, backgroundColor: driverTheme.button, paddingVertical: 12 },
  sheetDoneText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.white },

  pacBox: { marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, overflow: 'hidden', ...shadow.md },
  pacItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.slate[100] },
  pacItemPressed: { backgroundColor: colors.slate[50] },
  pacText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.slate[500] },
  pacMain: { fontSize: 13, fontWeight: '700', color: colors.slate[900] },

  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  btnCenter: { justifyContent: 'center' },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.5 },
  amberBtn: { backgroundColor: colors.amber[50], borderWidth: 1, borderColor: colors.amber[200] },
  amberBtnPressed: { backgroundColor: alpha(colors.amber[100], 0.5) },
  whiteAmberBtn: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.amber[200] },
  amberStrongBtn: { backgroundColor: colors.amber[100], borderWidth: 1, borderColor: colors.amber[300], paddingHorizontal: 24 },
  amberStrongPressed: { backgroundColor: colors.amber[200], transform: [{ scale: 0.95 }] },
  blueBtn: { backgroundColor: driverTheme.button },
  blueBtnPressed: { opacity: 0.9 },
  outlineBtn: { borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white },
  outlinePressed: { backgroundColor: colors.slate[50] },
  deleteBtn: { backgroundColor: colors.slate[50], borderWidth: 1, borderColor: colors.slate[100], paddingHorizontal: 20 },
  deleteBtnPressed: { backgroundColor: colors.rose[50], transform: [{ scale: 0.95 }] },
  approveBtn: { backgroundColor: colors.emerald[600], borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  rejectBtn: { borderWidth: 1, borderColor: colors.rose[200], borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },

  hero: {
    borderRadius: 24,
    backgroundColor: colors.amber[50],
    borderWidth: 1,
    borderColor: colors.amber[100],
    padding: 16,
    gap: 16,
    ...shadow.xl,
    shadowColor: colors.amber[200],
  },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, borderRadius: 9999, backgroundColor: alpha(colors.amber[200], 0.5), paddingHorizontal: 16, paddingVertical: 8 },
  heroButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  heroStats: { marginTop: 8, gap: 12 },
  heroStat: { borderRadius: 16, backgroundColor: alpha(colors.white, 0.6), padding: 16, borderWidth: 1, borderColor: alpha(colors.amber[200], 0.5) },
  heroStatRow: { marginTop: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },

  card32: { borderRadius: 32, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 16, ...shadow.sm },
  card28: { borderRadius: 28, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: 20 },
  card28Soft: { borderRadius: 28, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: alpha(colors.slate[50], 0.7), padding: 20 },
  card24: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 20, ...shadow.sm },
  card24p6: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 24, ...shadow.sm },
  darkCard: { borderRadius: 28, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[900], padding: 20 },
  darkCell: { borderRadius: 16, backgroundColor: alpha(colors.white, 0.1), paddingHorizontal: 16, paddingVertical: 12 },
  whiteCell: { borderRadius: 16, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12 },
  slateCell: { borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  borderCell: { borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12 },
  amenityTag: { borderRadius: 9999, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], paddingHorizontal: 12, paddingVertical: 8 },

  showRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  showBox: { borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12 },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  pendingBox: { marginTop: 24, borderRadius: 28, borderWidth: 1, borderColor: colors.amber[200], backgroundColor: alpha(colors.amber[50], 0.4), padding: 20 },
  pendingCard: { borderRadius: 22, borderWidth: 1, borderColor: colors.white, backgroundColor: colors.white, padding: 16, ...shadow.sm },
  listEmpty: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, paddingHorizontal: 20, paddingVertical: 32 },
  busCard: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 16, ...shadow.sm },
  pill: { flexShrink: 0, borderRadius: 9999, borderWidth: 1 },
  miniCell: { borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 12, paddingVertical: 10 },

  stepBadge: { borderRadius: 9999, backgroundColor: colors.slate[100], paddingHorizontal: 12, paddingVertical: 4 },
  stepCard: { width: '100%', borderRadius: 22, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], padding: 16 },
  stepCardActive: { borderColor: colors.amber[200], backgroundColor: colors.amber[50], ...shadow.md, shadowColor: colors.amber[200] },
  stepNum: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  countBox: { alignSelf: 'flex-start', borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },

  driverList: { flexGrow: 0, maxHeight: 208, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50] },
  driverListContent: { padding: 8, gap: 8 },
  driverCard: { width: '100%', borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 12 },
  driverCardActive: { borderColor: colors.slate[900], backgroundColor: driverTheme.button },

  coverOuter: { borderRadius: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.slate[300], padding: 16 },
  coverInner: { minHeight: 240, borderRadius: 24, backgroundColor: colors.slate[50], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverPick: { alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  coverDelete: { position: 'absolute', right: 12, top: 12, borderRadius: 14, backgroundColor: colors.white, padding: 8, ...shadow.sm },
  uploadIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  galleryCard: { borderRadius: 22, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], padding: 8 },
  galleryImgWrap: { borderRadius: 18, overflow: 'hidden' },
  galleryImg: { width: '100%', height: 128 },
  galleryDelete: { position: 'absolute', right: 8, top: 8, borderRadius: 10, backgroundColor: alpha(colors.white, 0.95), padding: 6, ...shadow.sm },
  galleryEmpty: { borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.slate[200], backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 24 },
  subCard24: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: alpha(colors.slate[50], 0.7), padding: 16 },
  subCard26: { borderRadius: 26, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: alpha(colors.slate[50], 0.6), padding: 16 },
  iconDanger: { borderRadius: 16, borderWidth: 1, borderColor: colors.rose[200], backgroundColor: colors.white, padding: 8 },
  iconDangerPressed: { backgroundColor: colors.rose[50] },
  iconTile: { width: 40, height: 40, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.sm },

  templateCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  deckConfig: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: alpha(colors.slate[50], 0.8), padding: 16 },
  enabledPill: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 2 },
  deckOuter: { borderRadius: 32, borderWidth: 1, borderColor: colors.slate[200], padding: 16 },
  deckHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 16 },
  deckBadge: { borderRadius: 9999, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 4 },
  deckInner: { borderRadius: 26, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: 16 },
  entryBox: { borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], paddingHorizontal: 12, paddingVertical: 8 },
  frontBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 4,
    borderTopColor: colors.slate[200],
    borderLeftColor: colors.slate[200],
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  frontText: { transform: [{ rotate: '-45deg' }] },
  deckRows: { gap: 12 },
  deckRow: { flexDirection: 'row', gap: 8 },
  deckCol: { flex: 1, minWidth: 0 },
  seatEmpty: { height: 44, borderRadius: 16 },
  seat: { position: 'relative', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1 },
  seatLabel: { fontSize: 10, lineHeight: 15, fontWeight: '900', letterSpacing: 0.5 },
  sleeperPillow: { position: 'absolute', top: 4, bottom: 4, left: 6, width: 8, borderRadius: 9999, backgroundColor: colors.sky[200] },
  sleeperBar: { position: 'absolute', right: 6, top: 6, height: 8, width: 32, borderRadius: 9999, backgroundColor: alpha(colors.white, 0.6) },
  seatTopBar: { position: 'absolute', left: 8, right: 8, top: 6, height: 6, borderRadius: 9999, backgroundColor: colors.slate[200] },
  seatDot: { position: 'absolute', bottom: 4, right: 6, width: 10, height: 10, borderRadius: 9999, backgroundColor: colors.slate[100] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendBox: { width: 16, height: 16, borderRadius: 14, borderWidth: 1 },

  returnToggle: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 12 },
  returnToggleOn: { backgroundColor: driverTheme.button },
  returnToggleOff: { borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white },
  returnDot: { width: 10, height: 10, borderRadius: 5 },
  mapCard: { borderRadius: 28, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: alpha(colors.slate[50], 0.8), padding: 12 },
  mapFrame: { height: 320, width: '100%', overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white },
  mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  markerPin: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: '#EA4335', borderWidth: 2, borderColor: '#B31412', alignItems: 'center', justifyContent: 'center' },
  returnCard: { marginTop: 24, borderRadius: 28, borderWidth: 1, borderColor: colors.emerald[100], backgroundColor: alpha(colors.emerald[50], 0.7), padding: 20 },
  returnCell: { borderRadius: 16, borderWidth: 1, borderColor: colors.emerald[100], backgroundColor: alpha(colors.white, 0.9), paddingHorizontal: 16 },
  addStopBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.slate[300], backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 16 },

  actionBar: { marginTop: 0, borderRadius: 24, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: alpha(colors.white, 0.95), padding: 20, ...shadow.lg },
  snapCell: { borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.slate[100] },
  promptBody: { padding: 20 },
});

export default BusServiceManager;
