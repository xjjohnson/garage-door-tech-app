import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { Discount, DiscountPreset, discountAmountText, discountText, parseDollars, parsePct } from '../lib/discounts';
import { colors, touch, type } from '../theme';
import { Action } from './Buttons';
import { SectionTitle } from './controls';

/**
 * Quick discount on a ticket: tap one of the owner's presets (Senior 10%,
 * $25 off...) or type a custom percent or dollar amount. A percent goes on
 * every line as Odoo's own discount; dollars become one negative Discount
 * line. Odoo works out the totals.
 */
export function DiscountPanel({ discount, presets, onChange }: { discount?: Discount; presets: DiscountPreset[]; onChange: (d: Discount | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [kind, setKind] = useState<'pct' | 'cents'>('pct');
  const value = kind === 'pct' ? parsePct(custom) : parseDollars(custom);
  const pick = (d: Discount) => {
    onChange(d);
    setOpen(false);
    setCustom('');
  };
  return (
    <View style={styles.box} testID="ticket-discount">
      <SectionTitle>Discount</SectionTitle>
      {discount ? (
        <>
          <Text style={styles.label} testID="ticket-discount-current">
            {discountText(discount)}
          </Text>
          <Action label="Take the discount off" onPress={() => onChange(undefined)} testID="ticket-discount-remove" />
        </>
      ) : null}
      {!open ? (
        <Action label={discount ? 'Change the discount' : 'Add a discount'} onPress={() => setOpen(true)} testID="ticket-discount-open" />
      ) : (
        <>
          {presets.map((p, i) => (
            <Action key={`${p.label}${i}`} label={`${p.label} (${discountAmountText(p)})`} onPress={() => pick(p)} testID={`ticket-discount-preset-${i}`} />
          ))}
          <Text style={styles.label}>Or type one</Text>
          <View style={styles.row}>
            <Action label="% off" primary={kind === 'pct'} grow onPress={() => setKind('pct')} testID="ticket-discount-kind-pct" />
            <Action label="$ off" primary={kind === 'cents'} grow onPress={() => setKind('cents')} testID="ticket-discount-kind-cents" />
          </View>
          <TextInput
            value={custom}
            onChangeText={setCustom}
            placeholder={kind === 'pct' ? 'Percent, like 15' : 'Dollars, like 40'}
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            accessibilityLabel={kind === 'pct' ? 'Percent off' : 'Dollars off'}
            testID="ticket-discount-custom"
            style={styles.input}
          />
          <Action
            label={value ? `Take ${discountAmountText(kind === 'pct' ? { label: '', pct: value } : { label: '', cents: value })}` : 'Enter an amount'}
            primary
            disabled={!value}
            onPress={() => value && pick(kind === 'pct' ? { label: '', pct: value } : { label: '', cents: value })}
            testID="ticket-discount-apply"
          />
          <Action label="Cancel" onPress={() => setOpen(false)} testID="ticket-discount-cancel" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  row: { flexDirection: 'row', gap: 8 },
  label: { fontSize: type.body, fontWeight: '800', color: colors.text },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
});
