import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { DEFAULT_DISCOUNTS, DiscountPreset, parseDollars, parsePct, presetsFor } from '../lib/discounts';
import { queueBusiness } from '../lib/settingsSync';
import { useInvoices } from '../lib/useInvoices';
import { colors, touch, type } from '../theme';

interface Row {
  label: string;
  kind: 'pct' | 'cents';
  /** The amount as typed: percent, or dollars. */
  text: string;
}

const toRow = (p: DiscountPreset): Row => (p.pct ? { label: p.label, kind: 'pct', text: String(p.pct) } : { label: p.label, kind: 'cents', text: String((p.cents ?? 0) / 100) });

/** A row as a preset, or undefined while its name or amount is missing or wrong. */
function toPreset(r: Row): DiscountPreset | undefined {
  const label = r.label.trim();
  if (!label) return undefined;
  if (r.kind === 'pct') {
    const pct = parsePct(r.text);
    return pct ? { label, pct } : undefined;
  }
  const cents = parseDollars(r.text);
  return cents ? { label, cents } : undefined;
}

/**
 * Management > Discounts: the quick discounts offered on a ticket (Senior 10%,
 * $25 off...). Saved with the company's business details in Odoo, so every
 * phone offers the same list. A percent goes on the lines as Odoo's own
 * discount; dollars become one negative Discount line.
 */
export function DiscountsTab({ canEdit }: { canEdit: boolean }) {
  const { business, setBusiness } = useInvoices();
  const [rows, setRows] = useState<Row[]>(() => presetsFor(business.discounts).map(toRow));
  const [saved, setSaved] = useState(false);
  const bad = rows.filter((r) => !toPreset(r)).length;
  const edit = (next: Row[]) => {
    setRows(next);
    setSaved(false);
  };
  const patch = (i: number, p: Partial<Row>) => edit(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <View style={styles.stack} testID="manage-discounts">
      <Text style={styles.note}>
        These show up when you add a discount to a ticket. A percent comes off every line as Odoo's own discount, so parts are taxed on the lower price. Dollars off is one Discount line with no tax. Odoo works out the totals.
      </Text>
      {rows.map((r, i) => (
        <View key={i} style={styles.field} testID={`manage-discount-${i}`}>
          <TextInput value={r.label} onChangeText={(v) => patch(i, { label: v })} editable={canEdit} placeholder="Name, like Senior" placeholderTextColor={colors.muted} accessibilityLabel="Discount name" testID={`manage-discount-label-${i}`} style={styles.input} />
          <View style={styles.row}>
            <Pressable onPress={() => canEdit && patch(i, { kind: 'pct' })} accessibilityRole="button" accessibilityState={{ selected: r.kind === 'pct' }} testID={`manage-discount-pct-${i}`} style={[styles.kind, r.kind === 'pct' && styles.kindOn]}>
              <Text style={[styles.buttonText, r.kind === 'pct' && styles.primaryText]}>% off</Text>
            </Pressable>
            <Pressable onPress={() => canEdit && patch(i, { kind: 'cents' })} accessibilityRole="button" accessibilityState={{ selected: r.kind === 'cents' }} testID={`manage-discount-cents-${i}`} style={[styles.kind, r.kind === 'cents' && styles.kindOn]}>
              <Text style={[styles.buttonText, r.kind === 'cents' && styles.primaryText]}>$ off</Text>
            </Pressable>
            <TextInput
              value={r.text}
              onChangeText={(v) => patch(i, { text: v })}
              editable={canEdit}
              keyboardType="decimal-pad"
              placeholder={r.kind === 'pct' ? '10' : '25'}
              placeholderTextColor={colors.muted}
              accessibilityLabel={r.kind === 'pct' ? 'Percent off' : 'Dollars off'}
              testID={`manage-discount-amount-${i}`}
              style={[styles.input, styles.amount]}
            />
          </View>
          {canEdit ? (
            <Pressable onPress={() => edit(rows.filter((_, j) => j !== i))} accessibilityRole="button" testID={`manage-discount-remove-${i}`} style={styles.back}>
              <Text style={styles.buttonText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {rows.length === 0 ? <Text style={styles.note} testID="manage-discounts-empty">No discounts in the list. You can still type a custom one on a ticket.</Text> : null}
      {canEdit ? (
        <>
          <Pressable onPress={() => edit([...rows, { label: '', kind: 'pct', text: '' }])} accessibilityRole="button" testID="manage-discount-add" style={styles.back}>
            <Text style={styles.buttonText}>Add a discount</Text>
          </Pressable>
          <Pressable onPress={() => edit(DEFAULT_DISCOUNTS.map(toRow))} accessibilityRole="button" testID="manage-discount-reset" style={styles.back}>
            <Text style={styles.buttonText}>Use the standard list</Text>
          </Pressable>
          {bad > 0 ? (
            <Text style={styles.note} testID="manage-discounts-bad">
              {bad === 1 ? '1 discount needs a name and an amount' : `${bad} discounts need a name and an amount`} (percent up to 100) before it is saved. It is left out until then.
            </Text>
          ) : null}
          <Pressable
            onPress={() => {
              const next = { ...business, discounts: rows.flatMap((r) => toPreset(r) ?? []) };
              setBusiness(() => next);
              queueBusiness(next);
              setSaved(true);
            }}
            accessibilityRole="button"
            testID="manage-discounts-save"
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Save to Odoo</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.note}>Only the owner can change the discounts.</Text>
      )}
      {saved ? (
        <Text style={styles.note} testID="manage-discounts-msg" accessibilityLiveRegion="polite">
          Saved. Every phone picks it up from Odoo.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  field: { gap: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  amount: { flex: 1 },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  kind: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  kindOn: { backgroundColor: colors.selected },
  back: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { minHeight: touch.min, borderRadius: 10, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
});
