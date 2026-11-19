import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import type { OdooClient } from '../lib/odoo';
import { DeptLimits, LIMIT_LABELS, readLimits, writeLimits } from '../lib/deptLimits';
import { colors, touch, type, bw, fs, rad } from '../theme';

const KEYS = Object.keys(LIMIT_LABELS) as (keyof DeptLimits)[];

/**
 * Management > Departments: the few limits the Office, Sales and Owner pages
 * use. Saved in Odoo so every phone uses the same numbers.
 */
export function LimitsTab({ client, canEdit }: { client: OdooClient; canEdit: boolean }) {
  const [vals, setVals] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let alive = true;
    readLimits(client).then((l) => alive && setVals(Object.fromEntries(KEYS.map((k) => [k, String(l[k])]))));
    return () => {
      alive = false;
    };
  }, [client]);
  const save = async () => {
    if (!vals) return;
    const next = Object.fromEntries(KEYS.map((k) => [k, Number(vals[k])])) as unknown as DeptLimits;
    if (KEYS.some((k) => !Number.isFinite(next[k]) || next[k] < 0 || next[k] > 3650)) {
      setMsg('Use whole numbers from 0 to 3650.');
      return;
    }
    try {
      await writeLimits(client, next);
      setMsg('Saved. Every phone picks it up from Odoo.');
    } catch {
      setMsg('Odoo did not take the change. Nothing was saved.');
    }
  };
  if (!vals) return <Text style={styles.note}>Reading from Odoo...</Text>;
  return (
    <View style={styles.stack} testID="manage-limits">
      <Text style={styles.note}>The Office, Sales and Owner pages use these numbers to decide what needs a person.</Text>
      {KEYS.map((k) => (
        <View key={k} style={styles.field}>
          <Text style={styles.label}>{LIMIT_LABELS[k].label} ({LIMIT_LABELS[k].unit})</Text>
          <TextInput
            value={vals[k]}
            onChangeText={(v) => {
              setVals({ ...vals, [k]: v.replace(/[^0-9]/g, '') });
              setMsg('');
            }}
            editable={canEdit}
            keyboardType="number-pad"
            accessibilityLabel={LIMIT_LABELS[k].label}
            testID={`manage-limit-${k}`}
            style={styles.line}
          />
        </View>
      ))}
      {canEdit ? (
        <Pressable onPress={save} accessibilityRole="button" testID="manage-limits-save" style={styles.primary}>
          <Text style={styles.primaryText}>Save to Odoo</Text>
        </Pressable>
      ) : (
        <Text style={styles.note}>Only the owner can change these.</Text>
      )}
      {msg ? (
        <Text style={styles.note} testID="manage-limits-msg" accessibilityLiveRegion="polite">
          {msg}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: 22 },
  field: { gap: 6 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  line: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  primary: { minHeight: touch.min, borderRadius: rad(14), backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
});
