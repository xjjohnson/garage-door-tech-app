import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../components/AppText';
import { INDUSTRIES, Industry, useIndustry, writeIndustry } from '../lib/industry';
import type { OdooClient } from '../lib/odoo';
import { makeStyles } from '../lib/makeStyles';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';

/**
 * Management > Industry: which tool pack the business uses. Saved in Odoo so
 * every phone agrees. Nothing is deleted when it changes; the tools are only
 * hidden.
 */
export function IndustryTab({ client, canEdit }: { client: OdooClient; canEdit: boolean }) {
  const styles = useStyles();
  const current = useIndustry();
  const [msg, setMsg] = useState('');
  const pick = async (id: Industry) => {
    if (!canEdit || id === current) return;
    try {
      await writeIndustry(client, id);
      setMsg('Saved. Every phone picks it up from Odoo.');
    } catch {
      setMsg('Odoo did not take the change. Nothing was saved.');
    }
  };
  return (
    <View style={styles.stack} testID="manage-industry">
      <Text style={styles.note}>Pick what your business does. The tools for it show up on every phone; the others stay hidden, and nothing is deleted.</Text>
      {INDUSTRIES.map((i) => {
        const on = i.id === current;
        return (
          <Pressable key={i.id} onPress={() => pick(i.id)} disabled={!canEdit} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !canEdit }} testID={`industry-${i.id}`} style={[styles.row, on && styles.rowOn]}>
            <Text style={styles.label}>{i.label}{on ? '  (in use)' : ''}</Text>
            <Text style={styles.detail}>{i.detail}</Text>
          </Pressable>
        );
      })}
      {!canEdit ? <Text style={styles.note}>Only the owner can change this.</Text> : null}
      {msg ? <Text style={styles.note} testID="industry-msg">{msg}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
  row: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, padding: sp(14), gap: sp(4), backgroundColor: colors.card },
  rowOn: { borderColor: colors.selected, borderWidth: bw(3) },
  label: { fontSize: type.body, fontWeight: '800', color: colors.text },
  detail: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
}));
