import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, NavRow } from '../components/Buttons';
import { SectionTitle, Segmented } from '../components/controls';
import { formatMoney } from '../lib/prices';
import { categoryLevel, fetchedLabel, itemsByIds, PriceBookItem, searchItems, sortByName } from '../lib/priceBook';
import { usePriceBook } from '../lib/usePriceBook';
import { PriceSheetScreen } from './PriceSheetScreen';
import { colors, touch, type } from '../theme';

export type PriceBookTab = 'all' | 'favorites' | 'estimate';

/**
 * Odoo's products and prices, browsed by category with search, the tech's
 * own favorites and what sells most, plus the good / better / best estimate
 * prices (what was the price sheet). With onPick, tapping an item picks it
 * (for adding to a job); without, the price book is for looking up and
 * setting estimate prices. One Update from Odoo refreshes both.
 */
export function PriceBookScreen({ onPick, now = Date.now, initialTab = 'all' }: { onPick?: (item: PriceBookItem) => void; now?: () => number; initialTab?: PriceBookTab }) {
  const { book, loaded, favorites, toggle, refresh, busy, error, signedIn, sheetResult } = usePriceBook(now);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PriceBookTab>(onPick ? 'all' : initialTab);
  const [path, setPath] = useState<string[]>([]);

  const found = useMemo(() => searchItems(book.items, query), [book.items, query]);
  const level = useMemo(() => categoryLevel(book.items, path), [book.items, path]);
  const favItems = useMemo(() => sortByName(itemsByIds(book.items, favorites)), [book.items, favorites]);
  const frequent = useMemo(() => itemsByIds(book.items, book.frequent), [book.items, book.frequent]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const row = (i: PriceBookItem) => <ItemRow key={i.id} item={i} favorite={favSet.has(i.id)} onToggle={() => toggle(i.id)} onPick={onPick} />;
  const searching = query.trim().length > 0 && tab !== 'estimate';
  const tabs = (
    <Segmented
      options={[
        { value: 'all', label: 'All' },
        { value: 'favorites', label: favorites.length ? `Favorites (${favorites.length})` : 'Favorites' },
        ...(onPick ? [] : [{ value: 'estimate' as const, label: 'Estimates' }]),
      ]}
      value={tab}
      onChange={setTab}
      testID="price-book-tabs"
    />
  );

  return (
    <View style={styles.stack} testID="price-book">
      {tab === 'estimate' ? (
        <>
          {tabs}
          <Text style={styles.note}>Good, better and best prices for spring estimates. Lines linked to an Odoo product take its price on Update from Odoo.</Text>
          <PriceSheetScreen />
        </>
      ) : (
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name, code or category"
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="Search the price book"
        testID="price-book-search"
        style={styles.input}
      />
      )}
      {tab === 'estimate' ? null : searching ? (
        <>
          <SectionTitle>{found.length === 1 ? '1 match' : `${found.length} matches`}</SectionTitle>
          {found.length === 0 ? <Text style={styles.note}>Nothing matches “{query.trim()}”.</Text> : found.map(row)}
        </>
      ) : (
        <>
          {tabs}
          {tab === 'favorites' ? (
            favItems.length === 0 ? (
              <Text style={styles.note}>Tap the star on any item to keep it here. Favorites are yours alone.</Text>
            ) : (
              favItems.map(row)
            )
          ) : (
            <>
              {path.length > 0 ? (
                <Pressable onPress={() => setPath(path.slice(0, -1))} accessibilityRole="button" testID="price-book-up" style={({ pressed }) => [styles.up, pressed && styles.pressed]}>
                  <Text style={styles.upText}>‹ {path.length > 1 ? path[path.length - 2] : 'All categories'}</Text>
                </Pressable>
              ) : null}
              {path.length > 0 ? <SectionTitle>{path[path.length - 1]}</SectionTitle> : null}
              {level.folders.map((f) => (
                <NavRow key={f.name} label={f.name} detail={f.count === 1 ? '1 item' : `${f.count} items`} onPress={() => setPath([...path, f.name])} testID={`price-book-cat-${f.name}`} />
              ))}
              {path.length === 0 && frequent.length > 0 ? (
                <>
                  <SectionTitle>Frequently used</SectionTitle>
                  {frequent.map(row)}
                </>
              ) : null}
              {level.items.length > 0 ? (
                <>
                  {path.length === 0 && level.folders.length > 0 ? <SectionTitle>Other items</SectionTitle> : null}
                  {level.items.map(row)}
                </>
              ) : null}
              {loaded && book.items.length === 0 ? (
                <Text style={styles.note}>{signedIn ? (busy ? 'Loading prices from Odoo...' : 'No products in Odoo that can be sold yet.') : 'Sign in to Odoo (Jobs, then Team) to load your prices.'}</Text>
              ) : null}
            </>
          )}
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {sheetResult && !onPick ? (
        <Text style={styles.meta} testID="price-book-sheet-result">
          Estimate prices:{' '}
          {sheetResult.added ? `added ${sheetResult.added} Odoo ${sheetResult.added === 1 ? 'item' : 'items'} (pick Good, Better or Best under Estimates to quote one). ` : ''}
          {sheetResult.changed.length ? `Updated ${sheetResult.changed.map((c) => `${c.label} to $${c.to}`).join(', ')}.` : sheetResult.added ? '' : 'all match Odoo.'}
          {sheetResult.missing.length ? ` No longer in Odoo: ${sheetResult.missing.join(', ')}.` : ''}
        </Text>
      ) : null}
      <Text style={styles.meta} testID="price-book-updated">
        {busy ? 'Updating from Odoo...' : fetchedLabel(book.fetchedAt, now())}. Prices, categories and descriptions are edited in Odoo.
      </Text>
      {signedIn ? <Action label={busy ? 'Updating...' : 'Update from Odoo'} onPress={refresh} disabled={busy} testID="price-book-refresh" /> : null}
    </View>
  );
}

function ItemRow({ item, favorite, onToggle, onPick }: { item: PriceBookItem; favorite: boolean; onToggle: () => void; onPick?: (item: PriceBookItem) => void }) {
  const body = (
    <>
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.meta} numberOfLines={2}>
        {[item.kind === 'service' ? 'Service' : 'Material', item.code, item.description].filter(Boolean).join(' · ')}
      </Text>
    </>
  );
  return (
    <View style={styles.item} testID={`price-book-item-${item.id}`}>
      {onPick ? (
        <Pressable onPress={() => onPick(item)} accessibilityRole="button" accessibilityHint="Adds it" testID={`price-book-pick-${item.id}`} style={({ pressed }) => [styles.grow, pressed && styles.pressed]}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.grow}>{body}</View>
      )}
      <Text style={styles.price}>{formatMoney(item.cents)}</Text>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={favorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
        accessibilityState={{ selected: favorite }}
        testID={`price-book-star-${item.id}`}
        style={({ pressed }) => [styles.star, pressed && styles.pressed]}
      >
        <Text style={[styles.starText, favorite && styles.starOn]}>{favorite ? '★' : '☆'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  grow: { flex: 1, gap: 2 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  up: { minHeight: touch.min, justifyContent: 'center' },
  upText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  item: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: colors.info },
  name: { fontSize: type.body, fontWeight: '800', color: colors.text },
  price: { fontSize: type.body, fontWeight: '900', color: colors.text },
  star: { minWidth: touch.min, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  starText: { fontSize: 30, color: colors.text },
  starOn: { color: colors.brand },
  pressed: { backgroundColor: colors.safety },
});
