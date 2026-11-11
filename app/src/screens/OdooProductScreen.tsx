import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { OdooError, OdooProduct } from '../lib/odoo';
import { formatMoney, linkLine, newAddOnId, priceLines, priceText, setLinePrice } from '../lib/prices';
import { useOdoo } from '../lib/useOdoo';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type } from '../theme';

/**
 * Search the business's Odoo products and pick one for a price-sheet line.
 * Picking links the line and puts in the Odoo price straight away; with
 * line "new" it adds an add-on named after the product.
 */
export function OdooProductScreen({ line }: { line: string }) {
  const { status, client } = useOdoo();
  const { sheet, update } = usePriceSheet();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<OdooProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = line === 'new' ? null : priceLines(sheet).find((l) => l.key === line);

  const search = useCallback(
    async (q: string) => {
      if (!client) return;
      setBusy(true);
      setError(null);
      try {
        setItems(await client.products(q));
      } catch (e) {
        setError(e instanceof OdooError ? e.message : "Couldn't search Odoo. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [client],
  );

  useEffect(() => {
    search('');
  }, [search]);

  if (status !== 'signedIn' || !client) {
    return <Text style={styles.note}>Sign in to Odoo first: Jobs, then Team.</Text>;
  }

  const pick = (p: OdooProduct) => {
    const link = { id: p.id, name: p.code ? `[${p.code}] ${p.name}` : p.name };
    update((s) => {
      if (line === 'new') {
        const id = newAddOnId(Date.now());
        const added = { ...s, addOns: [...s.addOns, { id, name: p.name, price: priceText(p.cents), tiers: { good: false, better: false, best: true } }] };
        return linkLine(added, `addOn.${id}`, link);
      }
      return linkLine(setLinePrice(s, line, priceText(p.cents)), line, link);
    });
    if (router.canGoBack()) router.back();
  };

  return (
    <View style={styles.stack} testID="odoo-products">
      <Text style={styles.note}>
        {target ? `Pick the Odoo product for “${target.label}”. Its Odoo price goes in now, and again whenever you tap Update prices from Odoo.` : 'Pick an Odoo product to add as an item on your quotes.'}
      </Text>
      <View style={styles.row}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => search(query)}
          placeholder="Name or reference"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search Odoo products"
          testID="odoo-products-search"
          style={[styles.input, styles.grow]}
        />
        <Pressable onPress={() => search(query)} accessibilityRole="button" testID="odoo-products-go" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Search</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy && !items ? <Text style={styles.note}>Loading Odoo products...</Text> : null}
      {items && items.length === 0 ? <Text style={styles.note}>No products found that can be sold.</Text> : null}
      {(items ?? []).map((p) => (
        <Pressable key={p.id} onPress={() => pick(p)} accessibilityRole="button" testID={`odoo-product-${p.id}`} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <View style={styles.grow}>
            <Text style={styles.name}>{p.name}</Text>
            {p.code ? <Text style={styles.meta}>{p.code}</Text> : null}
          </View>
          <Text style={styles.price}>{formatMoney(p.cents)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  item: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  name: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  price: { fontSize: type.body, fontWeight: '900', color: colors.text },
  pressed: { backgroundColor: colors.safety },
});
