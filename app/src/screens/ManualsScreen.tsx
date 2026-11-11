import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipOption, ChipRow, Segmented } from '../components/controls';
import { DOC_KIND_LABEL, MANUAL_LINKS, ManualLink, Market, MARKET_LABEL } from '../data/manuals';
import { deviceManualFiles, ManualFiles } from '../lib/manualFiles';
import { brandsFor, checkReach, formatChecked, linkMarkets, searchManuals } from '../lib/manualSearch';
import { useSavedManuals } from '../lib/useSavedManuals';
import { colors, touch, type } from '../theme';

const ALL = 'all';

/**
 * Cards drawn at once. The full list has hundreds of entries, each with its
 * document buttons, and drawing them all made the screen slow to open on a
 * phone. A search usually lands in the first few; "Show more" adds the next
 * batch.
 */
export const MANUALS_PAGE = 25;

/** Something a tap opens: an entry's maker page or one of its documents. */
interface Target {
  key: string;
  url: string;
}

function pageTarget(link: ManualLink): Target {
  return { key: link.id, url: link.url };
}

const DOC_STATE_TEXT = {
  saving: 'Saving to this phone…',
  failed: 'Not saved yet. Needs a signal.',
  web: "A web page, can't be saved. Needs a signal.",
} as const;

const MARKET_OPTIONS: ChipOption<string>[] = [
  { label: 'All', value: ALL },
  { label: MARKET_LABEL.residential, value: 'residential' },
  { label: MARKET_LABEL.commercial, value: 'commercial' },
];

// Made once: the hook below re-runs its loading when this changes.
const DEVICE_FILES = deviceManualFiles();

interface Props {
  fetchImpl?: typeof fetch;
  openUrl?: (url: string) => Promise<unknown>;
  /** Where starred PDFs are kept. Null where there's no storage (web), so nothing is saved. */
  files?: ManualFiles | null;
}

/**
 * Search the makers' manuals by brand, model or series. An entry with direct
 * documents shows a button for each, which opens the PDF straight away, plus
 * the maker's page for anything else; an entry without them opens the
 * maker's page. Before opening, it checks for a signal and says so plainly
 * when there isn't one. A starred entry comes first in the list and its PDFs
 * are saved on the phone, so they open with no signal.
 */
export function ManualsScreen({ fetchImpl = fetch, openUrl = (u) => Linking.openURL(u), files = DEVICE_FILES }: Props) {
  const saved = useSavedManuals(files);
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<string>(ALL);
  const [brand, setBrand] = useState<string>(ALL);
  // What's being checked or couldn't open: an entry's page or one of its documents.
  const [checking, setChecking] = useState<string | null>(null);
  const [offline, setOffline] = useState<Target | null>(null);

  const marketFilter = market === ALL ? null : (market as Market);
  const brandOptions = useMemo<ChipOption<string>[]>(
    () => [{ label: 'All', value: ALL }, ...brandsFor(marketFilter).map((b) => ({ label: b.name, value: b.id }))],
    [marketFilter],
  );
  // A maker picked earlier may have nothing in the market picked now.
  const brandFilter = brand !== ALL && brandOptions.some((o) => o.value === brand) ? brand : null;

  const found = useMemo(() => searchManuals(query, brandFilter, MANUAL_LINKS, marketFilter), [query, brandFilter, marketFilter]);
  // Starred entries first, in the order the search found them.
  const starredIds = saved.starred;
  const hits = useMemo(() => {
    const on = new Set(starredIds);
    return [...found.filter((h) => on.has(h.link.id)), ...found.filter((h) => !on.has(h.link.id))];
  }, [found, starredIds]);
  // How many cards to draw. A new search or filter starts again from one page.
  const filterKey = `${query}|${brandFilter ?? ''}|${marketFilter ?? ''}`;
  const [page, setPage] = useState({ key: filterKey, count: MANUALS_PAGE });
  const shownCount = page.key === filterKey ? page.count : MANUALS_PAGE;
  const shown = hits.slice(0, shownCount);
  const more = Math.min(MANUALS_PAGE, hits.length - shown.length);

  async function open(target: Target) {
    setChecking(target.key);
    const reach = await checkReach(target.url, fetchImpl);
    setChecking(null);
    if (reach === 'offline') {
      setOffline(target);
      return;
    }
    setOffline(null);
    openUrl(target.url).catch(() => setOffline(target));
  }

  function openAnyway(target: Target) {
    setOffline(null);
    openUrl(target.url).catch(() => setOffline(target));
  }

  /** A saved PDF opens from the phone, no signal check. If no app can show it, try the maker's copy. */
  function openSaved(uri: string, target: Target, title: string) {
    setOffline(null);
    files?.open(uri, title).catch(() => open(target));
  }

  return (
    <View style={styles.stack}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Brand or model number"
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

      <Segmented options={MARKET_OPTIONS} value={market} onChange={setMarket} testID="manuals-market" />

      <ChipRow options={brandOptions} value={brandFilter ?? ALL} onChange={setBrand} testID="manuals-brands" scroll />

      <Text style={styles.hint}>
        Manuals open from the maker's own website, so they need a signal.
        {saved.canSave ? ' Star one to save its PDFs on this phone for when there is no signal.' : ''}
      </Text>

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

      {shown.map(({ link, brand: b }) => {
        const starred = saved.isStarred(link.id);
        const header = (
          <>
            <View style={styles.itemTop}>
              <View style={styles.brandRow}>
                <Text style={styles.brand}>{b.name}</Text>
                <Text style={styles.kind}>{DOC_KIND_LABEL[link.kind]}</Text>
              </View>
              <Pressable
                onPress={() => saved.toggleStar(link)}
                accessibilityRole="button"
                accessibilityState={{ selected: starred }}
                accessibilityLabel={starred ? `Unstar ${b.name}, ${link.title}` : `Star ${b.name}, ${link.title}`}
                accessibilityHint={saved.canSave && link.docs?.length ? (starred ? 'Deletes the saved copies' : 'Saves its PDFs on this phone') : undefined}
                testID={`star-${link.id}`}
                style={({ pressed }) => [styles.star, starred && styles.starOn, pressed && styles.pressed]}
              >
                <Text style={[styles.starText, starred && styles.starTextOn]}>{starred ? '★ Starred' : '☆ Star'}</Text>
              </Pressable>
            </View>
            <View style={styles.itemTop}>
              <Text style={styles.market}>{linkMarkets(link).map((m) => MARKET_LABEL[m]).join(' · ')}</Text>
            </View>
            <Text style={styles.title}>{link.title}</Text>
            {link.note ? <Text style={styles.note}>{link.note}</Text> : null}
            <Text style={styles.models} numberOfLines={2}>
              {link.models.join(' · ')}
            </Text>
          </>
        );
        const page = pageTarget(link);
        const checked = `Link checked ${formatChecked(link.checked)}`;

        // No direct documents: the whole card opens the maker's page.
        if (!link.docs || link.docs.length === 0) {
          return (
            <Pressable
              key={link.id}
              onPress={() => open(page)}
              disabled={checking !== null}
              accessibilityRole="link"
              accessibilityLabel={`${b.name}, ${link.title}, ${DOC_KIND_LABEL[link.kind]}. Opens the maker's website.`}
              testID={`manual-${link.id}`}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              {header}
              {starred && saved.canSave ? <Text style={styles.saveNote}>Opens the maker's website, so it can't be saved. Needs a signal.</Text> : null}
              <Text style={styles.checked}>{checking === page.key ? 'Checking for a signal…' : checked}</Text>
            </Pressable>
          );
        }

        // Direct documents: one button each, then the maker's page for the rest.
        return (
          <View key={link.id} testID={`manual-${link.id}`} style={styles.item}>
            {header}
            <View style={styles.docs}>
              {link.docs.map((doc, n) => {
                const target: Target = { key: `${link.id}#${n}`, url: doc.url };
                const uri = saved.savedUri(doc.url);
                const state = starred ? saved.docState(doc.url) : undefined;
                return (
                  <Pressable
                    key={target.key}
                    onPress={() => (uri ? openSaved(uri, target, doc.label) : open(target))}
                    disabled={checking !== null}
                    accessibilityRole="link"
                    accessibilityLabel={`${b.name}, ${doc.label}. ${uri ? 'Opens the copy saved on this phone.' : 'Opens the document.'}`}
                    testID={`doc-${link.id}-${n}`}
                    style={({ pressed }) => [styles.doc, pressed && styles.pressed]}
                  >
                    <Text style={styles.docText}>{checking === target.key ? 'Checking for a signal…' : doc.label}</Text>
                    {uri ? (
                      <Text style={styles.docSaved} testID={`saved-${link.id}-${n}`}>
                        Saved on this phone
                      </Text>
                    ) : state ? (
                      <Text style={styles.docPending}>{DOC_STATE_TEXT[state]}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => open(page)}
                disabled={checking !== null}
                accessibilityRole="link"
                accessibilityLabel={`${b.name}, more documents on the maker's website.`}
                testID={`more-${link.id}`}
                style={({ pressed }) => [styles.doc, styles.more, pressed && styles.pressed]}
              >
                <Text style={styles.moreText}>{checking === page.key ? 'Checking for a signal…' : "More documents on the maker's page"}</Text>
              </Pressable>
            </View>
            {starred && link.docs.some((d) => saved.docState(d.url) === 'failed') ? (
              <Pressable
                onPress={() => saved.retry(link)}
                accessibilityRole="button"
                testID={`resave-${link.id}`}
                style={({ pressed }) => [styles.button, styles.showMore, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>Try saving again</Text>
              </Pressable>
            ) : null}
            <Text style={styles.checked}>{checked}</Text>
          </View>
        );
      })}

      {more > 0 ? (
        <Pressable
          onPress={() => setPage({ key: filterKey, count: shownCount + MANUALS_PAGE })}
          accessibilityRole="button"
          accessibilityLabel={`Show ${more} more links`}
          testID="manuals-more"
          style={({ pressed }) => [styles.button, styles.showMore, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>
            Show {more} more ({hits.length - shown.length} left)
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    minWidth: 0,
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
  showMore: { flex: 0, paddingHorizontal: 12 },
  empty: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 6 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { minHeight: touch.min, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg, gap: 4 },
  pressed: { backgroundColor: colors.safety },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  brandRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  brand: { fontSize: type.body, fontWeight: '900', color: colors.text },
  star: { minHeight: touch.min, minWidth: touch.min, paddingHorizontal: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  starOn: { backgroundColor: colors.selected },
  starText: { fontSize: 16, fontWeight: '900', color: colors.text },
  starTextOn: { color: colors.safety },
  saveNote: { fontSize: 15, fontWeight: '700', color: colors.text },
  docSaved: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  docPending: { fontSize: 15, fontWeight: '700', color: colors.muted, marginTop: 2 },
  kind: { fontSize: 14, fontWeight: '800', color: colors.onSelected, backgroundColor: colors.selected, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  title: { fontSize: type.body, fontWeight: '700', color: colors.text },
  note: { fontSize: 16, color: colors.muted },
  models: { fontSize: 15, color: colors.muted },
  market: { fontSize: 14, fontWeight: '800', color: colors.muted },
  checked: { fontSize: 14, fontWeight: '600', color: colors.muted },
  docs: { gap: 6, marginTop: 4 },
  doc: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center', backgroundColor: colors.card },
  docText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  more: { backgroundColor: colors.bg, borderStyle: 'dashed' },
  moreText: { fontSize: 16, fontWeight: '700', color: colors.text },
});
