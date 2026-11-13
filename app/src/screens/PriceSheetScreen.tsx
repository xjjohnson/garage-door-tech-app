import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipOption, MeasureField, MultiChipRow, SectionTitle } from '../components/controls';
import { formatNumber } from '../lib/measure';
import { AddOn, cents, formatMoney, isSpareOdooItem, linkLine, newAddOnId, PriceSheet, Tier, TIER_CYCLES, TIER_LABEL, TIERS } from '../lib/prices';
import { useOdoo } from '../lib/useOdoo';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type } from '../theme';

const TIER_OPTIONS: ChipOption<Tier>[] = TIERS.map((t) => ({ label: TIER_LABEL[t], value: t }));

/**
 * The company's prices, entered once on the big keypad. Every change is saved
 * on the phone as it's made; there's no Save button to forget.
 */
export function PriceSheetScreen() {
  const { sheet, update } = usePriceSheet();
  const set = (patch: Partial<PriceSheet>) => update((s) => ({ ...s, ...patch }));
  const setAddOn = (id: string, patch: Partial<AddOn>) => update((s) => ({ ...s, addOns: s.addOns.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const odoo = useOdoo();
  const linking = odoo.status === 'signedIn' && !!odoo.client?.session.apps.products;

  return (
    <View style={styles.stack} testID="price-sheet">
      <Text style={styles.note}>Quotes use these prices as they are when the quote is opened.</Text>

      <SectionTitle first>On every option</SectionTitle>
      <Money label="Service call" value={sheet.serviceCall} onChange={(serviceCall) => set({ serviceCall })} testID="price-service" />
      {linking ? <OdooLinkRow line="serviceCall" /> : null}
      <Money label="Torsion spring labor" hint="Labor to replace torsion springs, for one or a pair." value={sheet.springLabor} onChange={(springLabor) => set({ springLabor })} testID="price-labor" />
      {linking ? <OdooLinkRow line="springLabor" /> : null}

      <SectionTitle>Torsion springs, price each</SectionTitle>
      <Text style={styles.note}>Each option puts in springs of a higher cycle rating. A pair is charged as two.</Text>
      {TIERS.map((t) => (
        <View key={t} style={styles.line}>
          <Money
            label={`${TIER_LABEL[t]}: ${formatNumber(TIER_CYCLES[t])}-cycle spring`}
            value={sheet.spring[t]}
            onChange={(v) => update((s) => ({ ...s, spring: { ...s.spring, [t]: v } }))}
            testID={`price-spring-${t}`}
          />
          {linking ? <OdooLinkRow line={`spring.${t}`} /> : null}
        </View>
      ))}

      <SectionTitle>Extension springs, price each</SectionTitle>
      <Text style={styles.note}>Every option puts in the same size. Price them as you sell them, e.g. standard for Good and long-life for Better and Best. A pair is charged as two.</Text>
      <Money label="Extension spring labor" value={sheet.extensionLabor} onChange={(extensionLabor) => set({ extensionLabor })} testID="price-ext-labor" />
      {linking ? <OdooLinkRow line="extensionLabor" /> : null}
      {TIERS.map((t) => (
        <View key={t} style={styles.line}>
          <Money
            label={`${TIER_LABEL[t]}: extension spring`}
            value={sheet.extensionSpring[t]}
            onChange={(v) => update((s) => ({ ...s, extensionSpring: { ...s.extensionSpring, [t]: v } }))}
            testID={`price-ext-${t}`}
          />
          {linking ? <OdooLinkRow line={`extensionSpring.${t}`} /> : null}
        </View>
      ))}

      <SectionTitle>Add-ons</SectionTitle>
      <Text style={styles.note}>Pick which options include each one.</Text>
      {sheet.addOns.filter((a) => !isSpareOdooItem(sheet, a)).map((a) => (
        <View key={a.id} style={styles.addOn} testID={`addon-${a.id}`}>
          <TextInput
            value={a.name}
            onChangeText={(name) => setAddOn(a.id, { name })}
            placeholder="Part or service"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Add-on name"
            testID={`addon-name-${a.id}`}
            style={styles.name}
          />
          <Money label="Price" value={a.price} onChange={(price) => setAddOn(a.id, { price })} testID={`addon-price-${a.id}`} />
          {linking ? <OdooLinkRow line={`addOn.${a.id}`} /> : null}
          <MultiChipRow
            options={TIER_OPTIONS}
            values={TIERS.filter((t) => a.tiers[t])}
            onChange={(vals) => setAddOn(a.id, { tiers: { good: vals.includes('good'), better: vals.includes('better'), best: vals.includes('best') } })}
            testID={`addon-tiers-${a.id}`}
          />
          <Pressable
            onPress={() => update((s) => linkLine({ ...s, addOns: s.addOns.filter((x) => x.id !== a.id) }, `addOn.${a.id}`, null))}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${a.name || 'add-on'}`}
            testID={`addon-remove-${a.id}`}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <Pressable
        onPress={() =>
          update((s) => ({ ...s, addOns: [...s.addOns, { id: newAddOnId(Date.now()), name: '', price: '', tiers: { good: false, better: false, best: true } }] }))
        }
        accessibilityRole="button"
        testID="addon-add"
        style={({ pressed }) => [styles.button, styles.dashed, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>Add an item</Text>
      </Pressable>
      <SpareOdooItems />

      <SectionTitle>Tax</SectionTitle>
      <MeasureField
        label="Sales tax on parts"
        hint="Charged on springs and add-ons, not on labor or the service call. Leave blank for none."
        value={sheet.taxPercent}
        onChange={(taxPercent) => set({ taxPercent })}
        unit="%"
        allowFraction={false}
        placeholder="None"
        testID="price-tax"
      />
    </View>
  );
}

/** Odoo items not on any quote option yet: folded away, so the sheet stays easy to scroll. */
function SpareOdooItems() {
  const { sheet, update } = usePriceSheet();
  const [open, setOpen] = useState(false);
  const spare = sheet.addOns.filter((a) => isSpareOdooItem(sheet, a));
  if (!spare.length) return null;
  const setTiers = (id: string, vals: Tier[]) =>
    update((s) => ({ ...s, addOns: s.addOns.map((a) => (a.id === id ? { ...a, tiers: { good: vals.includes('good'), better: vals.includes('better'), best: vals.includes('best') } } : a)) }));
  return (
    <View style={styles.stack} testID="odoo-spare">
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID="odoo-spare-toggle" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>
          {open ? 'Hide' : 'Show'} {spare.length} more Odoo {spare.length === 1 ? 'item' : 'items'}
        </Text>
      </Pressable>
      {open ? <Text style={styles.note}>Not on any quote option yet. Pick Good, Better or Best to put one on quotes.</Text> : null}
      {open
        ? spare.map((a) => (
            <View key={a.id} style={styles.addOn} testID={`spare-${a.id}`}>
              <View style={styles.linkRow}>
                <Text style={[styles.linkText, styles.grow]}>{a.name}</Text>
                <Text style={styles.linkText}>{cents(a.price) ? formatMoney(cents(a.price)) : 'No price'}</Text>
              </View>
              <MultiChipRow options={TIER_OPTIONS} values={[]} onChange={(vals) => setTiers(a.id, vals)} testID={`spare-tiers-${a.id}`} />
            </View>
          ))
        : null}
    </View>
  );
}

/** Under a price: which Odoo product it follows, with Link, Change and Unlink. */
function OdooLinkRow({ line }: { line: string }) {
  const { sheet, update } = usePriceSheet();
  const link = sheet.odoo[line];
  const pick = () => router.push({ pathname: '/odoo-product', params: { line } });
  return (
    <View style={styles.linkRow} testID={`odoo-link-${line}`}>
      {link ? <Text style={styles.linkText} numberOfLines={2}>Odoo: {link.name}</Text> : null}
      <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel={link ? `Change Odoo product for ${line}` : `Link ${line} to an Odoo product`} testID={`odoo-pick-${line}`} style={({ pressed }) => [styles.small, pressed && styles.pressed]}>
        <Text style={styles.smallText}>{link ? 'Change' : 'Link to Odoo product'}</Text>
      </Pressable>
      {link ? (
        <Pressable onPress={() => update((s) => linkLine(s, line, null))} accessibilityRole="button" accessibilityLabel={`Unlink ${link.name}`} testID={`odoo-unlink-${line}`} style={({ pressed }) => [styles.small, pressed && styles.pressed]}>
          <Text style={styles.smallText}>Unlink</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Money({ label, hint, value, onChange, testID }: { label: string; hint?: string; value: string; onChange: (v: string) => void; testID?: string }) {
  return <MeasureField label={label} hint={hint} value={value} onChange={onChange} unit="dollars" allowFraction={false} placeholder="Tap to set" testID={testID} />;
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  line: { gap: 8 },
  grow: { flex: 1 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  linkText: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  small: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  smallText: { fontSize: 16, fontWeight: '800', color: colors.text },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  addOn: { gap: 8, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  name: {
    minHeight: touch.min,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: type.body,
    fontWeight: '800',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  dashed: { borderStyle: 'dashed' },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
});
