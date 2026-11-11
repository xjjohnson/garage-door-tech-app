import { Brand, BRANDS, DOC_KIND_LABEL, MANUAL_LINKS, ManualLink, Market, MARKET_LABEL } from '../data/manuals';

/** Lowercase, letters and digits only, so "8500 W", "8500-w" and "8500W" match. */
export function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Split what the tech typed into words, each squashed; empty words dropped. */
export function queryWords(query: string): string[] {
  return query
    .split(/[\s,/]+/)
    .map(squash)
    .filter((w) => w.length > 0);
}

export interface SearchHit {
  link: ManualLink;
  brand: Brand;
}

const brandById = new Map(BRANDS.map((b) => [b.id, b]));

/** Every address a link opens: the maker's page, then each direct document. */
export function linkUrls(link: ManualLink): string[] {
  return [link.url, ...(link.docs ?? []).map((d) => d.url)];
}

/** Residential, commercial & gate, or both. Gate links are commercial & gate unless they say otherwise. */
export function linkMarkets(link: ManualLink): Market[] {
  if (link.markets && link.markets.length > 0) return link.markets;
  return link.category === 'gate' ? ['commercial'] : ['residential'];
}

/** The makers that have at least one link for this market (all makers for null), in BRANDS order. */
export function brandsFor(market: Market | null, links: ManualLink[] = MANUAL_LINKS): Brand[] {
  if (!market) return BRANDS;
  const ids = new Set(links.filter((l) => linkMarkets(l).includes(market)).map((l) => l.brand));
  return BRANDS.filter((b) => ids.has(b.id));
}

function haystack(link: ManualLink, brand: Brand): string {
  const markets = linkMarkets(link).map((m) => MARKET_LABEL[m]);
  const docs = (link.docs ?? []).map((d) => d.label);
  return [brand.name, ...brand.aliases, link.title, DOC_KIND_LABEL[link.kind], link.category, ...markets, ...link.models, ...docs].map(squash).join(' ');
}

/**
 * Rank: a word that is exactly one of the entry's models counts most, then a
 * model that starts with the word, then the brand's name, then anything else.
 */
function score(link: ManualLink, brand: Brand, words: string[]): number {
  const models = link.models.map(squash);
  const names = [brand.name, ...brand.aliases].map(squash);
  let total = 0;
  for (const w of words) {
    if (models.includes(w)) total += 100;
    else if (models.some((m) => m.startsWith(w))) total += 40;
    else if (names.some((n) => n.startsWith(w))) total += 20;
    else total += 1;
  }
  return total;
}

/**
 * Every link whose maker, title, kind, models or document names contain all
 * the words typed.
 * With no words, every link (optionally only one maker's, or one market's),
 * in the data's order.
 */
export function searchManuals(
  query: string,
  brandId: string | null = null,
  links: ManualLink[] = MANUAL_LINKS,
  market: Market | null = null,
): SearchHit[] {
  const words = queryWords(query);
  const hits: { hit: SearchHit; score: number; order: number }[] = [];
  links.forEach((link, order) => {
    const brand = brandById.get(link.brand);
    if (!brand) return;
    if (brandId && link.brand !== brandId) return;
    if (market && !linkMarkets(link).includes(market)) return;
    if (words.length > 0) {
      const hay = haystack(link, brand);
      if (!words.every((w) => hay.includes(w))) return;
    }
    hits.push({ hit: { link, brand }, score: words.length > 0 ? score(link, brand, words) : 0, order });
  });
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return hits.map((h) => h.hit);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-10" -> "Nov 10, 2026". Anything else is shown as it is. */
export function formatChecked(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

export type ReachResult = 'online' | 'offline';

/**
 * Is there a signal? Asks the link's own website for its headers only, with a
 * short time limit. Any answer at all, even an error page, means the phone is
 * online; only a failed connection or the time running out means offline.
 * Plain JavaScript (fetch), so it ships over the air with no new APK.
 */
export async function checkReach(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 6000): Promise<ReachResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImpl(url, { method: 'HEAD', signal: controller.signal });
    return 'online';
  } catch {
    return 'offline';
  } finally {
    clearTimeout(timer);
  }
}
