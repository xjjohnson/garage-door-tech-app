import { router } from 'expo-router';
import { ComponentType, Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import RNWebView, { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { Action } from '../components/Buttons';
import { formatMiles, googleNavLink, googleRouteLink, googleSearchLink, miles, Point, wazeNavLink } from '../lib/geocode';
import { balance, invoiceLabel, invoiceStatus } from '../lib/invoices';
import { phoneLink } from '../lib/jobs';
import { MapData, mapHtml, MapPin, parseMapMessage, PinKind, setDataScript } from '../lib/mapHtml';
import { OdooError, OdooPlace } from '../lib/odoo';
import { formatMoney } from '../lib/prices';
import { Appointment, formatTime, onDay } from '../lib/schedule';
import { retryGeocode, useGeocode } from '../lib/useGeocode';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { useSchedule } from '../lib/useSchedule';
import { useStartJob } from '../lib/useStartJob';
import { colors, touch, type } from '../theme';

/** The WebView's class typing doesn't fit React 19's JSX checks; this is the part the map uses. */
interface WebHandle {
  injectJavaScript: (js: string) => void;
}
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebHandle> }>;

/** Customers further than this from every stop aren't "nearby". */
export const NEARBY_MILES = 10;

/** A place on the map: one of today's stops, or a nearby customer worth a knock. */
export interface Place {
  id: string;
  kind: PinKind;
  label: string;
  title: string;
  detail: string;
  address: string;
  phone: string;
  appointment?: Appointment;
  customerId?: string;
}

/** Today's stops in time order, numbered, and which one is next. */
export function routeStops(appointments: Appointment[], now: number): Place[] {
  const day = onDay(appointments, now).filter((a) => a.status !== 'cancelled');
  const next = day.find((a) => a.status === 'booked' && a.start + a.minutes * 60000 > now);
  return day.map((a, i) => ({
    id: `stop-${a.id}`,
    kind: a.status === 'done' ? 'done' : a === next ? 'next' : 'stop',
    label: String(i + 1),
    title: `${i + 1} · ${a.name} · ${formatTime(a.start)}`,
    detail: [a.address, a.what].filter(Boolean).join(' · '),
    address: a.address,
    phone: a.phone,
    appointment: a,
    ...(a.customerId ? { customerId: a.customerId } : {}),
  }));
}

/**
 * Today on a map: the day's stops as numbered pins joined in order, and,
 * with Show nearby, customers who owe money ($) or have an open quote (Q)
 * near the route. Tap a pin for Navigate (Google Maps or Waze) and the job.
 */
export function TodayMapScreen({ now = Date.now }: { now?: () => number }) {
  const { appointments } = useSchedule();
  const { invoices } = useInvoices();
  const { client } = useOdoo();
  const startJob = useStartJob();
  const t = now();
  const [nearby, setNearby] = useState(false);
  const [odooPlaces, setOdooPlaces] = useState<OdooPlace[]>([]);
  const [odooError, setOdooError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const stops = useMemo(() => routeStops(appointments, t), [appointments, t]);

  useEffect(() => {
    if (!nearby || !client) {
      setOdooPlaces([]);
      return;
    }
    let alive = true;
    setOdooError(null);
    // Each layer on its own: a tech who can't read invoices still sees quotes, and the other way round.
    Promise.allSettled([client.owedInvoices(), client.openQuotes()]).then((res) => {
      if (!alive) return;
      setOdooPlaces(res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])));
      const failed = res.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed.length === res.length) setOdooError(failed[0].reason instanceof OdooError ? failed[0].reason.message : "Couldn't read Odoo.");
    });
    return () => {
      alive = false;
    };
  }, [nearby, client]);

  /** Owed on the phone's invoices, plus Odoo's invoices and quotes the phone doesn't have. */
  const extras = useMemo<(Place & { at?: Point })[]>(() => {
    if (!nearby) return [];
    const owed = invoices.filter((i) => i.address.trim() && ['unpaid', 'partial'].includes(invoiceStatus(i)));
    const sentIds = new Set(invoices.map((i) => i.odoo?.id).filter(Boolean));
    const fromPhone = owed.map<Place>((i) => ({
      id: `owed-${i.id}`,
      kind: 'owed',
      label: '$',
      title: `${i.billTo || 'Customer'} owes ${formatMoney(balance(i))}`,
      detail: `${invoiceLabel(i)} · ${i.address}`,
      address: i.address,
      phone: '',
      ...(i.customerId ? { customerId: i.customerId } : {}),
    }));
    const fromOdoo = odooPlaces
      .filter((p) => p.address.trim() && !(p.kind === 'owed' && sentIds.has(p.id)))
      .map<Place & { at?: Point }>((p) => ({
        id: `odoo-${p.kind}-${p.id}`,
        kind: p.kind,
        label: p.kind === 'owed' ? '$' : 'Q',
        title: p.kind === 'owed' ? `${p.customer} owes ${formatMoney(p.cents)}` : `${p.customer} · quote ${formatMoney(p.cents)}`,
        detail: `${p.ref} · ${p.address}`,
        address: p.address,
        phone: p.phone,
        ...(p.lat !== undefined && p.lon !== undefined ? { at: { lat: p.lat, lon: p.lon } } : {}),
      }));
    return [...fromPhone, ...fromOdoo].slice(0, 60);
  }, [nearby, invoices, odooPlaces]);

  const addresses = useMemo(() => [...stops.map((s) => s.address), ...extras.filter((e) => !e.at).map((e) => e.address)], [stops, extras]);
  const { points, waiting } = useGeocode(addresses);
  const pointOf = useCallback((p: Place & { at?: Point }) => p.at ?? points[p.address.trim()] ?? undefined, [points]);

  const stopPoints = stops.map((s) => pointOf(s)).filter((p): p is Point => !!p);
  const shownExtras = extras.filter((e) => {
    const p = pointOf(e);
    if (!p) return false;
    return stopPoints.length === 0 || stopPoints.some((s) => miles(s, p) <= NEARBY_MILES);
  });
  const all: Place[] = [...stops, ...shownExtras];
  // Addresses the map couldn't place exactly: not found at all, or only by ZIP.
  const problems = [...stops, ...extras.filter((e) => !e.at)].flatMap((p) => {
    const v = p.address.trim() ? points[p.address.trim()] : undefined;
    return v === null ? [{ p, missing: true }] : v?.approx ? [{ p, missing: false }] : [];
  });
  const notFound = new Set(problems.filter((x) => x.missing).map((x) => x.p.address.trim())).size;
  const approx = new Set(problems.filter((x) => !x.missing).map((x) => x.p.address.trim())).size;
  const [showProblems, setShowProblems] = useState(false);
  const noAddress = stops.filter((s) => !s.address.trim()).length;

  // The page gets new pins without reloading; it re-fits only when the set of pins changes.
  const web = useRef<WebHandle>(null);
  const [ready, setReady] = useState(false);
  const pins: MapPin[] = all.flatMap((p) => {
    const at = pointOf(p);
    return at ? [{ id: p.id, lat: at.lat, lon: at.lon, label: p.label, kind: p.kind, ...(at.approx ? { approx: true } : {}) }] : [];
  });
  const pinKey = pins.map((p) => p.id).join(',');
  const lastFit = useRef('');
  const data: MapData = { pins, route: stops.map((s) => pointOf(s)).filter((p): p is Point => !!p).map((p) => [p.lat, p.lon]), fit: pinKey !== lastFit.current, ...(selected ? { selected } : {}) };
  const script = setDataScript(data);
  useEffect(() => {
    if (!ready) return;
    web.current?.injectJavaScript(script);
    lastFit.current = pinKey;
  }, [ready, script, pinKey]);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = parseMapMessage(e.nativeEvent.data);
    if (!m) return;
    if (m.type === 'ready') {
      lastFit.current = '';
      setReady(true);
    } else if (m.type === 'offline') setOffline(true);
    else setSelected(m.id);
  };

  const sel = all.find((p) => p.id === selected) ?? null;
  const prev = sel?.appointment ? stops[stops.findIndex((s) => s.id === sel.id) - 1] : undefined;
  const fromPrev = sel && prev && pointOf(sel) && pointOf(prev) ? miles(pointOf(prev)!, pointOf(sel)!) : undefined;
  const html = useMemo(() => mapHtml(colors.selected), []);
  const route = googleRouteLink(stops.filter((s) => s.kind !== 'done').map((s) => s.address));
  const open = (url: string | undefined) => url && Linking.openURL(url).catch(() => undefined);

  return (
    <View style={styles.stack} testID="today-map">
      <View style={styles.mapBox}>
        <WebView
          ref={web}
          source={{ html, baseUrl: 'https://johnsons.hivemindjohnson.work/' }}
          originWhitelist={['*']}
          onMessage={onMessage}
          javaScriptEnabled
          setSupportMultipleWindows={false}
          nestedScrollEnabled
          style={styles.map}
          testID="map-webview"
        />
        <Pressable
          onPress={() => setNearby((n) => !n)}
          accessibilityRole="switch"
          accessibilityState={{ checked: nearby }}
          testID="map-nearby"
          style={({ pressed }) => [styles.nearby, nearby && styles.nearbyOn, pressed && styles.pressed]}
        >
          <Text style={[styles.nearbyText, nearby && styles.nearbyTextOn]}>{nearby ? 'Nearby: on' : 'Show nearby'}</Text>
        </Pressable>
      </View>

      <Text style={styles.meta} testID="map-status">
        {offline ? 'No map without internet. ' : ''}
        {waiting > 0 ? `Finding ${waiting} address${waiting === 1 ? '' : 'es'} on the map... ` : ''}
        {noAddress > 0 ? `${noAddress} stop${noAddress === 1 ? ' has' : 's have'} no address. ` : ''}
        {nearby ? (shownExtras.length ? `${shownExtras.length} nearby: $ owes money, Q open quote.` : waiting ? '' : `Nobody who owes or has an open quote within ${NEARBY_MILES} mi.`) : ''}
        {odooError ? ` ${odooError}` : ''}
      </Text>

      {problems.length > 0 ? (
        <Pressable
          onPress={() => setShowProblems((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showProblems }}
          testID="map-problems-toggle"
          style={({ pressed }) => [styles.problemBar, pressed && styles.pressed]}
        >
          <Text style={[styles.problemText, styles.grow]}>
            {[notFound ? `${notFound} address${notFound === 1 ? '' : 'es'} not found` : '', approx ? `${approx} placed by ZIP only` : ''].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.problemText}>{showProblems ? 'Hide' : 'See which'}</Text>
        </Pressable>
      ) : null}
      {showProblems && problems.length > 0 ? (
        <View style={styles.problems} testID="map-problems">
          <Text style={styles.note}>
            Usually the city doesn't match the ZIP, or the street is new or misspelled. Check it in Google Maps, fix it where it was typed (Odoo jobs on the contact in Odoo, other visits in the schedule), then tap Try again.
          </Text>
          {problems.map(({ p, missing }) => (
            <View key={p.id} style={styles.problem} testID={`map-problem-${p.id}`}>
              <Text style={styles.lineTitle}>{p.title}</Text>
              <Text style={styles.lineSub}>
                {p.address} · {missing ? 'not found' : 'pin is at the middle of the ZIP, not the house'}
              </Text>
              <View style={styles.row}>
                <Action label="Try again" grow onPress={() => retryGeocode(p.address)} testID={`map-retry-${p.id}`} />
                <Action label="Google Maps" grow onPress={() => open(googleSearchLink(p.address))} testID={`map-search-${p.id}`} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {sel ? (
        <View style={styles.card} testID="map-selected">
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, styles.grow]}>{sel.title}</Text>
            {fromPrev !== undefined ? <Text style={styles.meta}>{formatMiles(fromPrev)} from {prev!.label}</Text> : null}
          </View>
          {sel.detail ? <Text style={styles.cardSub}>{sel.detail}</Text> : null}
          <View style={styles.row}>
            <Action label="Google Maps" grow onPress={() => open(googleNavLink(sel.address, pointOf(sel)))} testID="map-nav-google" />
            <Action label="Waze" grow onPress={() => open(wazeNavLink(sel.address, pointOf(sel)))} testID="map-nav-waze" />
          </View>
          {sel.appointment ? (
            <Action label={sel.appointment.jobId ? 'Open job' : 'Start job'} primary onPress={() => startJob(sel.appointment!)} testID="map-open-job" />
          ) : (
            <View style={styles.row}>
              {phoneLink(sel.phone) ? <Action label="Call" grow onPress={() => open(phoneLink(sel.phone))} testID="map-call" /> : null}
              {sel.customerId ? <Action label="Customer" grow onPress={() => router.push({ pathname: '/customer/[id]', params: { id: sel.customerId! } })} testID="map-customer" /> : null}
            </View>
          )}
        </View>
      ) : null}

      {route ? <Action label="Whole day in Google Maps" onPress={() => open(route)} testID="map-route" /> : null}

      {stops.length === 0 ? <Text style={styles.note}>Nothing booked today. Turn on Show nearby to see who owes money or has an open quote.</Text> : null}
      <View>
        {all.map((p) => (
          <Pressable key={p.id} onPress={() => setSelected(p.id)} accessibilityRole="button" accessibilityState={{ selected: p.id === selected }} testID={`map-row-${p.id}`} style={({ pressed }) => [styles.line, p.id === selected && styles.lineOn, pressed && styles.pressed]}>
            <View style={[styles.dot, dotStyle[p.kind]]}>
              <Text style={[styles.dotText, (p.kind === 'next' || p.kind === 'stop') && styles.dotTextLight]}>{p.label}</Text>
            </View>
            <View style={styles.grow}>
              <Text style={styles.lineTitle}>{p.title}</Text>
              {p.detail ? <Text style={styles.lineSub}>{p.detail}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={styles.credit}>Map © OpenStreetMap contributors. Addresses are looked up with OpenStreetMap Nominatim and kept on this phone.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  mapBox: { height: 420, borderRadius: 14, borderWidth: 3, borderColor: colors.border, overflow: 'hidden', backgroundColor: '#E9EDE6' },
  map: { flex: 1, backgroundColor: '#E9EDE6' },
  nearby: { position: 'absolute', right: 10, top: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg, justifyContent: 'center' },
  nearbyOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  nearbyText: { fontSize: 16, fontWeight: '900', color: colors.text },
  nearbyTextOn: { color: colors.onSelected },
  meta: { fontSize: 15, fontWeight: '700', color: colors.muted },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  card: { borderWidth: 3, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  cardTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  cardSub: { fontSize: 16, fontWeight: '700', color: colors.muted },
  line: { minHeight: touch.min + 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 2, borderBottomColor: colors.info, paddingVertical: 6 },
  lineOn: { backgroundColor: colors.card },
  lineTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  lineSub: { fontSize: 15, fontWeight: '600', color: colors.muted },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border },
  dotText: { fontSize: 16, fontWeight: '900', color: colors.text },
  dotTextLight: { color: colors.onSelected },
  pressed: { backgroundColor: colors.info },
  problemBar: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.safety },
  problemText: { fontSize: 16, fontWeight: '900', color: colors.text },
  problems: { gap: 10 },
  problem: { gap: 6, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.border },
  credit: { fontSize: 13, fontWeight: '600', color: colors.muted },
});

const dotStyle = StyleSheet.create({
  next: { backgroundColor: colors.selected, borderColor: colors.selected },
  stop: { backgroundColor: colors.text },
  done: { backgroundColor: colors.info },
  owed: { backgroundColor: colors.safety },
  quote: { backgroundColor: colors.bg },
});
