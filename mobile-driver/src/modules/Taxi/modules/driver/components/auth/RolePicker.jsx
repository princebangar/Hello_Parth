// Web: components/auth/RolePicker.jsx — radio group of the partner roles (login screen row, role-selection list).
// Same props as the web (value, onChange(roleId), disabled, variant, label).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/native/ui';
import { DRIVER_ROLES } from '../../utils/driverRoles';

// grid-cols-4 on the web: the roles fill the first columns of a 4-column row
const ROW_COLUMNS = 4;

/**
 * Radio group of the partner roles.
 * variant "row": all roles in a single compact row, icon + label only (login screen).
 * variant "list": one wide row per role, with its description (legacy role-selection screen).
 */
const RolePicker = ({ value, onChange, disabled = false, variant = 'row', label = 'Choose your role' }) => {
  const isRow = variant === 'row';
  const emptyColumns = isRow ? Math.max(0, ROW_COLUMNS - DRIVER_ROLES.length) : 0;

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={isRow ? styles.row : styles.list}>
      {DRIVER_ROLES.map(({ id, label: roleLabel, description, Icon, accent, tint }) => {
        const active = id === value;

        return (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(id)}
            style={({ pressed }) => [
              styles.option,
              isRow ? styles.optionRow : styles.optionList,
              active ? { borderColor: accent, backgroundColor: tint } : styles.optionIdle,
              !active && pressed ? styles.optionPressed : null,
              disabled ? styles.optionDisabled : null,
            ]}
          >
            <View style={[isRow ? styles.iconRow : styles.iconList, { backgroundColor: tint }]}>
              <Icon size={isRow ? 16 : 20} strokeWidth={2.2} color={accent} />
            </View>
            <View style={isRow ? styles.textRow : styles.textList}>
              <Text style={isRow ? styles.labelRow : styles.labelList}>
                {isRow ? roleLabel.replace(' Driver', '').replace('Fleet ', '') : roleLabel}
              </Text>
              {!isRow ? <Text style={styles.description}>{description}</Text> : null}
            </View>
            {active ? (
              <View style={[isRow ? styles.checkRow : styles.checkList, { backgroundColor: accent }]}>
                <Check size={isRow ? 9 : 12} strokeWidth={3.5} color="#ffffff" />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {Array.from({ length: emptyColumns }, (_, index) => (
        <View key={`empty-${index}`} style={styles.emptyColumn} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  list: { gap: 12 },
  option: { position: 'relative', borderRadius: 14, borderWidth: 2 },
  optionRow: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 8 },
  optionList: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  optionIdle: { borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  optionPressed: { transform: [{ scale: 0.99 }] },
  optionDisabled: { opacity: 0.6 },
  emptyColumn: { flex: 1 },
  iconRow: { height: 32, width: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconList: { height: 40, width: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  textRow: { minWidth: 0 },
  textList: { flex: 1, minWidth: 0, paddingRight: 20 },
  labelRow: { fontSize: 10.5, lineHeight: 11.55, fontWeight: '600', color: '#0b1220', textAlign: 'center' },
  labelList: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: '#0b1220' },
  description: { marginTop: 2, fontSize: 12, lineHeight: 18.4, color: '#64748b' },
  checkRow: {
    position: 'absolute',
    right: -4,
    top: -4,
    height: 16,
    width: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkList: {
    position: 'absolute',
    right: 10,
    top: 10,
    height: 20,
    width: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RolePicker;
