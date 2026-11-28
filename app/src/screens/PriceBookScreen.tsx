import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Action, NavRow } from '../components/Buttons';
import { SectionTitle, Segmented } from '../components/controls';
import { formatMoney } from '../lib/prices';
import { categoryLevel, fetchedLabel, groupVariants, itemsByIds, PriceBookItem, searchItems, sortByName } from '../lib/priceBook';
import { usePriceBook } from '../lib/usePriceBook';
import { useStock } from '../lib/useStock';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

export type PriceBookTab = 'all' | 'favorites' | 'instock';

/**
 * Odoo's products and prices, browsed by category with search, the tech's
 * own favorites, what is on their truck (In stock) and what sells most. With onPick, tapping an item picks it
 * (for adding to a job); without, the price book is for looking up. Good /
 * better / best comes from Odoo's quotation templates, not from here.
 */
export function PriceBookScreen({ onPick, now = Date.now, initialTab = 'all', kind }: { onPick?: (item: PriceBookItem) => void; now?: () => number; initialTab?: PriceBookTab; kind?: 'service' | 'material' }) {
  const styles = useStyles();
  const { book: fullBook, loaded, favorites, toggle, refresh, busy, error, signedIn } = usePriceBook(now);
  const { items: stockItems } = useStock();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PriceBookTab>(onPick ? 'all' : initialTab);
  const [path, setPath] = useState<string[]>([]);
  // Add a service shows only services, Add a material only goods; no kind shows everything.
  const book = useMemo(() => {
    if (!kind) return fullBook;
    const items = fullBook.items.filter((i) => i.kind === kind);
    const ids = new Set(items.map((i) => i.id));
    return { ...fullBook, items, frequent: fullBook.frequent.filter((id) => ids.has(id)) };
  }, [fullBook, kind]);

  const found = useMemo(() => searchItems(book.items, query), [book.items, query]);
  const level = useMemo(() => categoryLevel(book.items, path), [book.items, path]);
  const favItems = useMemo(() => sortByName(itemsByIds(book.items, favorites)), [book.items, favorites]);
  const frequent = useMemo(() => itemsByIds(book.items, book.frequent), [book.items, book.frequent]);
  // On the tech's truck: stock items linked to an Odoo product with some on hand.
  const onTruck = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of stockItems) if (i.odooId && i.onHand > 0) m.set(i.odooId, (m.get(i.odooId) ?? 0) + i.onHand);
    return m;
  }, [stockItems]);
  const inStock = useMemo(() => sortByName(book.items.filter((i) => onTruck.has(i.id))), [book.items, onTruck]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const row = (i: PriceBookItem) => <ItemRow key={i.id} item={i} onTruck={onTruck.get(i.id)} favorite={favSet.has(i.id)} onToggle={() => toggle(i.id)} onPick={onPick} />;
  const searching = query.trim().length > 0;
  const tabs = (
    <Segmented
      options={[
        { value: 'all', label: 'All' },
        { value: 'favorites', label: favorites.length ? `Favorites (${favorites.length})` : 'Favorites' },
        { value: 'instock', label: inStock.length ? `In stock (${inStock.length})` : 'In stock' },
      ]}
      value={tab}
      onChange={setTab}
      testID="price-book-tabs"
    />
  );

  return (
    <View style={styles.stack} testID="price-book">
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
      {searching ? (
        <>
          <SectionTitle>{found.length === 1 ? '1 match' : `${found.length} matches`}</SectionTitle>
          {found.length === 0 ? <Text style={styles.note}>Nothing matches “{query.trim()}”.</Text> : found.map(row)}
        </>
      ) : (
        <>
          {tabs}
          {tab === 'instock' ? (
            inStock.length === 0 ? (
              <Text style={styles.note} testID="price-book-no-stock">Nothing from the price book is on your truck yet. Parts on your truck (Truck stock) show up here with how many you have.</Text>
            ) : (
              inStock.map(row)
            )
          ) : tab === 'favorites' ? (
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
                  {groupVariants(level.items).map((g, n) => ('heading' in g ? <Text key={`h-${g.heading}-${n}`} style={styles.variantHeading}>{g.heading}</Text> : row(g.item)))}
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
      <Text style={styles.meta} testID="price-book-updated">
        {busy ? 'Updating from Odoo...' : fetchedLabel(book.fetchedAt, now())}. Prices, categories and descriptions are edited in Odoo.
      </Text>
      {signedIn ? <Action label={busy ? 'Updating...' : 'Update from Odoo'} onPress={refresh} disabled={busy} testID="price-book-refresh" /> : null}
    </View>
  );
}

function ItemRow({ item, onTruck, favorite, onToggle, onPick }: { item: PriceBookItem; onTruck?: number; favorite: boolean; onToggle: () => void; onPick?: (item: PriceBookItem) => void }) {
  const styles = useStyles();
  const body = (
    <>
      {item.variant && item.baseName ? <Text style={styles.meta}>{item.baseName}</Text> : null}
      <Text style={styles.name}>{item.variant ?? item.name}</Text>
      <Text style={styles.meta} numberOfLines={2}>
        {[item.kind === 'service' ? 'Service' : 'Material', onTruck ? `${onTruck} on truck` : '', item.code, item.description].filter(Boolean).join(' · ')}
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

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  grow: { flex: 1, gap: sp(2) },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
  meta: { fontSize: fs(15), fontWeight: '600', color: colors.muted },
  variantHeading: { fontSize: fs(16), fontWeight: '800', color: colors.text, marginTop: sp(8) },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  input: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  up: { minHeight: touch.min, justifyContent: 'center' },
  upText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  item: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: sp(10), paddingVertical: sp(10), borderBottomWidth: 1, borderBottomColor: colors.line },
  name: { fontSize: type.body, fontWeight: '800', color: colors.text },
  price: { fontSize: type.body, fontWeight: '800', color: colors.text },
  star: { minWidth: touch.min, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', borderRadius: rad(10) },
  starText: { fontSize: fs(30), color: colors.text },
  starOn: { color: colors.selected },
  pressed: { backgroundColor: colors.info },
}));
