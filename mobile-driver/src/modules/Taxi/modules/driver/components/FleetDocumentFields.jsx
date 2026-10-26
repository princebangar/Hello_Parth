// Web: driver/components/FleetDocumentFields.jsx — the documents an owner collects for a fleet vehicle / fleet driver
// (AddVehicle, AddDriver, OwnerVehicleFleet). Which documents (and whether a number / expiry date is asked) comes from
// Admin > Fleet Needed Documents - nothing is fixed here.
// Native: a picked file is { uri, name, type } (src/lib/media). The web's <input type="file" accept="image/*"> showed
// the phone's chooser (camera / photos); here a small chooser asks Camera or Gallery. <input type="date"> is the
// system date dialog (NativeDateInput below, value stays YYYY-MM-DD) — also used by the other document screens.
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { File } from 'expo-file-system';
import { CalendarDays, FileText, Upload, X } from 'lucide-react-native';
import { AppImage, Sheet, Text, TextInput } from '@/native/ui';
import { pickImage } from '@/lib/media';
import { toast } from '@/lib/toast';
import { alpha, colors } from '@/theme';
import { getDocumentPreviewUrl, isPastExpiryDate, todayDateInputValue } from '../utils/documentTemplates';
import { uploadService } from '../../../shared/services/uploadService';

// web: FileReader.readAsDataURL(file)
const readFileAsDataUrl = async (file) => {
  try {
    const base64 = await new File(file.uri).base64();
    return `data:${String(file.type || 'image/jpeg')};base64,${base64}`;
  } catch {
    throw new Error('Could not read the selected file');
  }
};

const sideLabel = (field = {}) => (field.side === 'front' ? 'Front' : field.side === 'back' ? 'Back' : 'Photo');

// ------------------------------------------------------------------ <input type="date"> (shared by the document screens)
const parseDateValue = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const toDateValue = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
// What the browser's date box showed (en-IN: dd/mm/yyyy).
const displayDateValue = (value) => {
  const d = parseDateValue(value);
  return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
};

/**
 * A tappable box that opens the system date picker. `value` / onChangeValue(value) use the YYYY-MM-DD string of
 * <input type="date">; `min` is the input's min (YYYY-MM-DD). Style it like the web input with `style` / `textStyle`.
 */
export function NativeDateInput({ value, onChangeValue, min, max, style, textStyle, placeholderColor = colors.slate[400], iconColor = colors.slate[900], disabled = false }) {
  const [iosOpen, setIosOpen] = useState(false);
  const minimumDate = parseDateValue(min) || undefined;
  const maximumDate = parseDateValue(max) || undefined;
  const current = parseDateValue(value) || (minimumDate && minimumDate > new Date() ? minimumDate : new Date());

  const open = () => {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate,
        maximumDate,
        onValueChange: (_event, date) => {
          if (date) onChangeValue?.(toDateValue(date));
        },
      });
      return;
    }
    setIosOpen(true);
  };

  const shown = displayDateValue(value);
  return (
    <>
      <Pressable onPress={open} disabled={disabled} accessibilityRole="button" style={[styles.dateBox, style]}>
        <Text style={[textStyle, styles.dateText, shown ? null : { color: placeholderColor }]} numberOfLines={1}>
          {shown || 'dd/mm/yyyy'}
        </Text>
        <CalendarDays size={16} color={iconColor} strokeWidth={2} />
      </Pressable>
      {Platform.OS !== 'android' ? (
        <Sheet open={iosOpen} onClose={() => setIosOpen(false)} style={styles.iosSheet}>
          <DateTimePicker
            value={current}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onValueChange={(_event, date) => {
              if (date) onChangeValue?.(toDateValue(date));
              setIosOpen(false);
            }}
            onDismiss={() => setIosOpen(false)}
          />
        </Sheet>
      ) : null}
    </>
  );
}

// <input type="file" accept="image/*">: the phone offered camera or photos.
const chooseImage = () =>
  new Promise((resolve) => {
    const pick = async (source) => {
      try {
        resolve(await pickImage({ source }));
      } catch (error) {
        if (error?.code === 'PERMISSION_DENIED') toast.error(error.message);
        resolve(null);
      }
    };
    Alert.alert('Upload photo', undefined, [
      { text: 'Camera', onPress: () => pick('camera') },
      { text: 'Gallery', onPress: () => pick('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });

/** The expiry date / number pair of a template, read back from a saved document (any of the stored spellings). */
export const readSavedDocumentMeta = (documents = {}, template = {}) => {
  const saved = (template.fields || []).map((field) => documents?.[field.key]).find((doc) => doc && typeof doc === 'object') || {};
  return {
    identifyNumber: String(saved.identifyNumber || saved.documentNumber || saved.identify_number || saved.document_number || '').trim(),
    expiryDate: String(saved.expiryDate || saved.expiry_date || '').trim().slice(0, 10),
  };
};

/**
 * Is everything the templates ask for there? `files` = newly picked files by field key, `existing` = documents already
 * saved on the record. Returns an error message, or '' when the form can go ahead.
 */
export const validateFleetDocumentInputs = (templates = [], files = {}, meta = {}, existing = {}) => {
  for (const template of templates) {
    const fields = template.fields || [];
    const have = (field) => Boolean(files[field.key] || existing?.[field.key]);
    const required = fields.some((field) => field.required ?? template.is_required ?? false);
    const anyUploaded = fields.some(have);
    for (const field of fields) {
      if ((field.required ?? template.is_required ?? false) && !have(field)) {
        return `Upload ${field.label || template.name}`;
      }
    }
    if (!anyUploaded && !required) continue;
    const entry = meta[template.id] || {};
    if (template.has_identify_number && !String(entry.identifyNumber || '').trim()) {
      return `Enter the ${template.name} number`;
    }
    if (template.has_expiry_date) {
      if (!String(entry.expiryDate || '').trim()) return `Enter the ${template.name} expiry date`;
      if (isPastExpiryDate(entry.expiryDate)) return `${template.name} has already expired`;
    }
  }
  return '';
};

/** Uploads the newly picked files and builds the `documents` map the server expects (number / expiry on every side). */
export const buildFleetDocumentsPayload = async (templates = [], files = {}, meta = {}, existing = {}, folder = 'fleet-vehicle-documents') => {
  const documents = {};
  for (const template of templates) {
    const entry = meta[template.id] || {};
    const extra = {
      ...(String(entry.identifyNumber || '').trim()
        ? { identifyNumber: entry.identifyNumber.trim(), identify_number: entry.identifyNumber.trim(), documentNumber: entry.identifyNumber.trim(), document_number: entry.identifyNumber.trim() }
        : {}),
      ...(String(entry.expiryDate || '').trim() ? { expiryDate: entry.expiryDate, expiry_date: entry.expiryDate } : {}),
    };
    for (const field of template.fields || []) {
      const file = files[field.key];
      let url = getDocumentPreviewUrl(existing?.[field.key]);
      if (file) {
        if (!String(file.type || '').startsWith('image/')) {
          throw new Error(`${field.label || template.name} supports image files only.`);
        }
        const result = await uploadService.uploadImage(await readFileAsDataUrl(file), folder);
        url = result?.url || result?.secureUrl || result?.data?.url || result?.data?.secureUrl || '';
        if (!url) throw new Error(`Could not upload ${field.label || template.name}.`);
      }
      if (url) {
        documents[field.key] = { previewUrl: url, secureUrl: url, url, uploaded: true, ...extra };
      }
    }
  }
  return documents;
};

// grid-cols-2: rows of two equal cells
const chunk = (list, size) => {
  const rows = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
};

// lockUneditable: documents the admin marked 'not editable' are only shown (used when an owner edits a saved record).
const FleetDocumentFields = ({ templates = [], files = {}, existing = {}, meta = {}, onFile, onClear, onMeta, lockUneditable = false }) => {
  const [focusedInput, setFocusedInput] = useState('');

  if (!templates.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No documents are needed right now.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {templates.map((template) => {
        const entry = meta[template.id] || {};
        const required = (template.fields || []).some((field) => field.required ?? template.is_required ?? false);
        const locked = lockUneditable && template.is_editable === false;
        const fields = template.fields || [];
        const columns = fields.length > 1 ? 2 : 1;
        return (
          <View key={template.id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardTitleRow}>
                <View style={styles.cardIcon}>
                  <FileText size={16} color={colors.blue[600]} />
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>{template.name}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: required ? colors.blue[100] : colors.slate[100] }]}>
                <Text style={[styles.badgeText, { color: required ? colors.blue[700] : colors.slate[500] }]}>
                  {locked ? 'Locked' : required ? 'Required' : 'Optional'}
                </Text>
              </View>
            </View>

            <View style={styles.grid}>
              {chunk(fields, columns).map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={styles.gridRow}>
                  {row.map((field) => {
                    const preview = files[field.key]?.uri || getDocumentPreviewUrl(existing?.[field.key]);
                    return (
                      <View key={field.key} style={styles.cell}>
                        <Pressable
                          disabled={locked}
                          onPress={async () => {
                            const file = await chooseImage();
                            if (file) onFile?.(field.key, file);
                          }}
                          style={styles.drop}
                        >
                          {preview ? (
                            <AppImage src={preview} style={StyleSheet.absoluteFill} contentFit="cover" />
                          ) : (
                            <View style={styles.dropEmpty}>
                              <Upload size={18} color={colors.slate[400]} />
                              <Text style={styles.dropLabel}>{sideLabel(field)}</Text>
                            </View>
                          )}
                          {preview ? (
                            <View style={styles.dropBar}>
                              <Text style={styles.dropBarText}>{`${sideLabel(field)} - tap to change`}</Text>
                            </View>
                          ) : null}
                        </Pressable>
                        {!locked && files[field.key] ? (
                          <Pressable onPress={() => onClear?.(field.key)} accessibilityLabel="Remove file" style={styles.clearBtn}>
                            <X size={13} color={colors.rose[500]} />
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                  {row.length < columns ? <View style={styles.cell} /> : null}
                </View>
              ))}
            </View>

            {locked && (template.has_identify_number || template.has_expiry_date) ? (
              <Text style={styles.lockedMeta}>
                {[meta[template.id]?.identifyNumber ? `Number ${meta[template.id].identifyNumber}` : '', meta[template.id]?.expiryDate ? `Expires ${meta[template.id].expiryDate}` : ''].filter(Boolean).join('  -  ')}
              </Text>
            ) : null}

            {!locked && (template.has_identify_number || template.has_expiry_date) ? (
              <View style={styles.metaGrid}>
                {template.has_identify_number ? (
                  <View>
                    <Text style={styles.metaLabel}>{`${template.name} number *`}</Text>
                    <TextInput
                      value={entry.identifyNumber || ''}
                      onChangeText={(text) => onMeta?.(template.id, 'identifyNumber', text)}
                      onFocus={() => setFocusedInput(`${template.id}:number`)}
                      onBlur={() => setFocusedInput('')}
                      placeholder="Document number"
                      placeholderTextColor={colors.slate[400]}
                      style={[styles.input, focusedInput === `${template.id}:number` ? styles.inputFocused : null]}
                    />
                  </View>
                ) : null}
                {template.has_expiry_date ? (
                  <View>
                    <Text style={styles.metaLabel}>Expiry date *</Text>
                    <NativeDateInput
                      min={todayDateInputValue()}
                      value={entry.expiryDate || ''}
                      onChangeValue={(value) => onMeta?.(template.id, 'expiryDate', value)}
                      style={styles.input}
                      textStyle={styles.inputText}
                    />
                    {isPastExpiryDate(entry.expiryDate) ? <Text style={styles.pastText}>This date has already passed.</Text> : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  dateBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dateText: { flex: 1 },
  iosSheet: { paddingHorizontal: 16, paddingTop: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.slate[300],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[500] },
  list: { gap: 16 },
  card: { borderRadius: 22, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: 16 },
  cardHead: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardIcon: { width: 32, height: 32, borderRadius: 14, backgroundColor: colors.blue[50], alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  badge: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, minWidth: 0 },
  drop: {
    height: 112,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.slate[300],
    backgroundColor: colors.slate[50],
  },
  dropEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dropLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.slate[400] },
  dropBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: alpha(colors.black, 0.55), paddingVertical: 4 },
  dropBarText: { textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.white },
  clearBtn: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: alpha(colors.white, 0.95),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  lockedMeta: { marginTop: 12, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
  metaGrid: { marginTop: 12, gap: 12 },
  metaLabel: { marginBottom: 4, fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.55, color: colors.slate[400] },
  input: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.slate[800],
  },
  inputFocused: { borderColor: colors.blue[400] },
  inputText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[800] },
  pastText: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.rose[500] },
});

export default FleetDocumentFields;
