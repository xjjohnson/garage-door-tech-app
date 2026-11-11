import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipOption, MeasureField, MultiChipRow, SectionTitle } from '../components/controls';
import { formatNumber } from '../lib/measure';
import { AddOn, newAddOnId, PriceSheet, Tier, TIER_CYCLES, TIER_LABEL, TIERS } from '../lib/prices';
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

  return (
    <View style={styles.stack} testID="price-sheet">
      <Text style={styles.note}>Prices stay on this phone. Quotes use them as they are when the quote is opened.</Text>

      <SectionTitle first>On every option</SectionTitle>
      <Money label="Service call" value={sheet.serviceCall} onChange={(serviceCall) => set({ serviceCall })} testID="price-service" />
      <Money label="Spring labor" hint="Labor to replace the springs, for one or a pair." value={sheet.springLabor} onChange={(springLabor) => set({ springLabor })} testID="price-labor" />

      <SectionTitle>Springs, price each</SectionTitle>
      <Text style={styles.note}>Each option puts in springs of a higher cycle rating. A pair is charged as two.</Text>
      {TIERS.map((t) => (
        <Money
          key={t}
          label={`${TIER_LABEL[t]}: ${formatNumber(TIER_CYCLES[t])}-cycle spring`}
          value={sheet.spring[t]}
          onChange={(v) => update((s) => ({ ...s, spring: { ...s.spring, [t]: v } }))}
          testID={`price-spring-${t}`}
        />
      ))}

      <SectionTitle>Add-ons</SectionTitle>
      <Text style={styles.note}>Pick which options include each one.</Text>
      {sheet.addOns.map((a) => (
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
          <MultiChipRow
            options={TIER_OPTIONS}
            values={TIERS.filter((t) => a.tiers[t])}
            onChange={(vals) => setAddOn(a.id, { tiers: { good: vals.includes('good'), better: vals.includes('better'), best: vals.includes('best') } })}
            testID={`addon-tiers-${a.id}`}
          />
          <Pressable
            onPress={() => update((s) => ({ ...s, addOns: s.addOns.filter((x) => x.id !== a.id) }))}
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

function Money({ label, hint, value, onChange, testID }: { label: string; hint?: string; value: string; onChange: (v: string) => void; testID?: string }) {
  return <MeasureField label={label} hint={hint} value={value} onChange={onChange} unit="dollars" allowFraction={false} placeholder="Tap to set" testID={testID} />;
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
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
