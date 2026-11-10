import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipOption, ChipRow } from '../components/controls';
import { BRANDS, DOC_KIND_LABEL, ManualLink } from '../data/manuals';
import { checkReach, formatChecked, searchManuals } from '../lib/manualSearch';
import { colors, touch, type } from '../theme';

const ALL = 'all';

const BRAND_OPTIONS: ChipOption<string>[] = [{ label: 'All', value: ALL }, ...BRANDS.map((b) => ({ label: b.name, value: b.id }))];

interface Props {
  fetchImpl?: typeof fetch;
  openUrl?: (url: string) => Promise<unknown>;
}

/**
 * Search the makers' manuals by brand, model or series. Each row opens the
 * maker's own page in the phone's browser. Before opening, it checks for a
 * signal and says so plainly when there isn't one.
 */
export function ManualsScreen({ fetchImpl = fetch, openUrl = (u) => Linking.openURL(u) }: Props) {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState<string>(ALL);
  const [checking, setChecking] = useState<string | null>(null);
  const [offline, setOffline] = useState<ManualLink | null>(null);

  const hits = useMemo(() => searchManuals(query, brand === ALL ? null : brand), [query, brand]);

  async function open(link: ManualLink) {
    setChecking(link.id);
    const reach = await checkReach(link.url, fetchImpl);
    setChecking(null);
    if (reach === 'offline') {
      setOffline(link);
      return;
    }
    setOffline(null);
    openUrl(link.url).catch(() => setOffline(link));
  }

  function openAnyway(link: ManualLink) {
    setOffline(null);
    openUrl(link.url).catch(() => setOffline(link));
  }

  return (
    <View style={styles.stack}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Brand, model or series, e.g. 8500W"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search manuals"
          testID="manuals-search"
          style={styles.search}
        />
        {query !== '' ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            testID="manuals-clear"
            style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
          >
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <ChipRow options={BRAND_OPTIONS} value={brand} onChange={setBrand} testID="manuals-brands" />

      <Text style={styles.hint}>Links open the maker's own website, so they need a signal.</Text>

      {offline ? (
        <View style={styles.offline} accessibilityRole="alert" testID="manuals-offline">
          <Text style={styles.offlineTitle}>No signal</Text>
          <Text style={styles.offlineBody}>
            Couldn't reach {offline.url.replace(/^https:\/\/([^/]+).*$/, '$1')}. Manuals open on the maker's website, so they need internet.
            Try again once you have a signal.
          </Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => open(offline)}
              accessibilityRole="button"
              testID="manuals-retry"
              style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, styles.primaryText]}>Try again</Text>
            </Pressable>
            <Pressable
              onPress={() => openAnyway(offline)}
              accessibilityRole="button"
              testID="manuals-open-anyway"
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              <Text style={styles.buttonText}>Open anyway</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Text style={styles.count} testID="manuals-count">
        {hits.length === 1 ? '1 link' : `${hits.length} links`}
      </Text>

      {hits.length === 0 ? (
        <View style={styles.empty} testID="manuals-empty">
          <Text style={styles.emptyTitle}>Nothing matches "{query.trim()}"</Text>
          <Text style={styles.emptyBody}>
            Try only the brand, or the first few characters of the model. Each maker's manual search page also takes the full
            model number from the label.
          </Text>
        </View>
      ) : null}

      {hits.map(({ link, brand: b }) => {
        const busy = checking === link.id;
        return (
          <Pressable
            key={link.id}
            onPress={() => open(link)}
            disabled={checking !== null}
            accessibilityRole="link"
            accessibilityLabel={`${b.name}, ${link.title}, ${DOC_KIND_LABEL[link.kind]}. Opens the maker's website.`}
            testID={`manual-${link.id}`}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <View style={styles.itemTop}>
              <Text style={styles.brand}>{b.name}</Text>
              <Text style={styles.kind}>{DOC_KIND_LABEL[link.kind]}</Text>
            </View>
            <Text style={styles.title}>{link.title}</Text>
            {link.note ? <Text style={styles.note}>{link.note}</Text> : null}
            <Text style={styles.models} numberOfLines={2}>
              {link.models.join(' · ')}
            </Text>
            <Text style={styles.checked}>{busy ? 'Checking for a signal…' : `Link checked ${formatChecked(link.checked)}`}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: type.value,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  clear: { minHeight: 64, minWidth: touch.min + 16, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  clearText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  hint: { fontSize: 16, color: colors.muted },
  count: { fontSize: 16, fontWeight: '700', color: colors.muted },
  offline: { padding: 12, borderRadius: 10, borderWidth: 3, borderColor: colors.border, backgroundColor: colors.safety, gap: 8 },
  offlineTitle: { fontSize: type.value, fontWeight: '900', color: colors.text },
  offlineBody: { fontSize: type.body, color: colors.text, lineHeight: 24 },
  row: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  empty: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 6 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { minHeight: touch.min, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg, gap: 4 },
  pressed: { backgroundColor: colors.safety },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  brand: { fontSize: type.body, fontWeight: '900', color: colors.text },
  kind: { fontSize: 14, fontWeight: '800', color: colors.onSelected, backgroundColor: colors.selected, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  title: { fontSize: type.body, fontWeight: '700', color: colors.text },
  note: { fontSize: 16, color: colors.muted },
  models: { fontSize: 15, color: colors.muted },
  checked: { fontSize: 14, fontWeight: '600', color: colors.muted },
});
