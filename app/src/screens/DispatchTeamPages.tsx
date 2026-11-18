import { ComponentType, Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import RNWebView, { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { Card, dateText, Meta, Note, Title } from '../components/Dept';
import { DAY_COLORS, MapData, mapHtml, MapPin, parseMapMessage, setDataScript } from '../lib/mapHtml';
import type { OdooClient, OdooTask, OdooUser } from '../lib/odoo';
import { isLive, seenText, TechPosition, techPositions } from '../lib/odooLocation';
import { listPlaces, placeOverview, PlaceSummary } from '../lib/odooWarehouse';
import { devNow } from '../lib/devFlags';
import { addDays, formatTime, startOfDay } from '../lib/schedule';
import { useGeocode } from '../lib/useGeocode';
import { colors, radius } from '../theme';

/** The Dispatch pages that are about people and trucks, not jobs. Each reads Odoo when opened and says plainly when this login can't see something. */

const say = (e: unknown) => (e instanceof Error ? e.message : String(e));
const odooMs = (v: unknown) => (typeof v === 'string' ? Date.parse(`${v.replace(' ', 'T')}Z`) : NaN);

/** Runs a read when the page opens; `null` while loading. */
function useRead<T>(client: OdooClient, read: () => Promise<T>): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const fn = useRef(read);
  fn.current = read;
  useEffect(() => {
    let alive = true;
    fn.current().then(
      (data) => alive && setState({ data, error: null }),
      (e) => alive && setState({ data: null, error: say(e) }),
    );
    return () => {
      alive = false;
    };
  }, [client]);
  return state;
}

const NOT_INSTALLED = /(doesn.t|does not) exist/i;

const Failed = ({ what, error }: { what: string; error: string }) =>
  NOT_INSTALLED.test(error) ? (
    <Card testID="dispatch-not-installed">
      <Title>{what}</Title>
      <Note>Not installed in Odoo yet. Dispatch works without it.</Note>
    </Card>
  ) : (
  <Card warn testID="dispatch-read-error">
    <Title>{what}</Title>
    <Note>Odoo wouldn't show this to your login, or it couldn't be reached: {error}</Note>
  </Card>
  );

// ---- Who's working ----

export interface Working {
  tech: OdooUser;
  /** Clocked in since, ms, when Odoo Attendance has an open check-in. */
  since?: number;
  position?: TechPosition;
}

/** Each Field Service worker with whether they are clocked in (Odoo Attendance) and where they were last seen. Pure so it can be tested. */
export function whoIsWorking(techs: OdooUser[], open: { name: string; since: number }[], positions: TechPosition[]): Working[] {
  const clocked = new Map(open.map((o) => [o.name.trim().toLowerCase(), o.since]));
  return techs.map((t) => {
    const since = clocked.get(t.name.trim().toLowerCase());
    const position = positions.find((p) => p.id === t.id);
    return { tech: t, ...(since !== undefined ? { since } : {}), ...(position ? { position } : {}) };
  });
}

export function WhoIsWorking({ client, now = devNow }: { client: OdooClient; now?: () => number }) {
  const { data, error } = useRead(client, async () => {
    const [techs, rows, positions] = await Promise.all([
      client.techs(),
      client.call('hr.attendance', 'search_read', [[['check_out', '=', false]]], { fields: ['employee_id', 'check_in'], limit: 100 }) as Promise<Record<string, unknown>[]>,
      techPositions(client).catch(() => [] as TechPosition[]),
    ]);
    const open = rows.flatMap((r) => (Array.isArray(r.employee_id) && !Number.isNaN(odooMs(r.check_in)) ? [{ name: String(r.employee_id[1]), since: odooMs(r.check_in) }] : []));
    return whoIsWorking(techs, open, positions);
  });
  if (error) return <Failed what="Who's working" error={error} />;
  if (!data) return <Note>Reading Odoo…</Note>;
  if (data.length === 0) return <Note>No Field Service workers in Odoo yet.</Note>;
  const t = now();
  return (
    <View style={styles.stack} testID="dispatch-working">
      {data.map((w) => (
        <Card key={w.tech.id} testID={`dispatch-working-${w.tech.id}`}>
          <Title>{w.tech.name}</Title>
          <Meta>{w.since !== undefined ? `Clocked in since ${formatTime(w.since)}` : 'Not clocked in'}</Meta>
          {w.position ? <Meta>{isLive(w.position, t) ? `Truck seen ${seenText(w.position.at, t)}` : `Truck last seen ${seenText(w.position.at, t)}`}</Meta> : <Meta>No truck location yet</Meta>}
        </Card>
      ))}
    </View>
  );
}

// ---- Time off ----

export function TimeOff({ client, now = devNow }: { client: OdooClient; now?: () => number }) {
  const { data, error } = useRead(client, async () => {
    const from = startOfDay(now());
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    return (await client.call('hr.leave', 'search_read', [[['state', '=', 'validate'], ['date_to', '>=', iso(from)], ['date_from', '<', iso(addDays(from, 14))]]], { fields: ['employee_id', 'date_from', 'date_to'], order: 'date_from asc', limit: 100 })) as Record<string, unknown>[];
  });
  if (error) return <Failed what="Time off" error={error} />;
  if (!data) return <Note>Reading Odoo…</Note>;
  if (data.length === 0) return <Note testID="dispatch-timeoff-empty">No one has approved time off in the next two weeks.</Note>;
  return (
    <View style={styles.stack} testID="dispatch-timeoff">
      {data.map((r) => (
        <Card key={String(r.id)}>
          <Title>{Array.isArray(r.employee_id) ? String(r.employee_id[1]) : 'Someone'}</Title>
          <Meta>
            {dateText(odooMs(r.date_from))} to {dateText(odooMs(r.date_to))}
          </Meta>
        </Card>
      ))}
    </View>
  );
}

// ---- Truck parts alerts ----

export function TruckAlerts({ client }: { client: OdooClient }) {
  const { data, error } = useRead(client, async () => {
    const trucks = (await listPlaces(client)).filter((p) => p.truck);
    return (await placeOverview(client, trucks)).filter((s) => s.low > 0 || s.zero > 0);
  });
  if (error) return <Failed what="Truck parts alerts" error={error} />;
  if (!data) return <Note>Reading every truck…</Note>;
  if (data.length === 0) return <Note testID="dispatch-trucks-empty">Every truck is at or above its minimums.</Note>;
  return (
    <View style={styles.stack} testID="dispatch-trucks">
      {data.map((s: PlaceSummary) => (
        <Card key={s.place.id} warn>
          <Title>{s.place.name}</Title>
          <Meta bad={s.zero > 0}>
            {s.zero > 0 ? `${s.zero} out of stock, ` : ''}
            {s.low} below minimum · last counted {dateText(s.lastCountedAt)}
          </Meta>
        </Card>
      ))}
    </View>
  );
}

// ---- Follow-ups due ----

export function FollowUpsDue({ client, now = devNow }: { client: OdooClient; now?: () => number }) {
  const { data, error } = useRead(client, async () => {
    const today = new Date(now()).toISOString().slice(0, 10);
    return (await client.call('mail.activity', 'search_read', [[['res_model', '=', 'res.partner'], ['date_deadline', '<=', today]]], { fields: ['res_name', 'summary', 'date_deadline', 'user_id'], order: 'date_deadline asc', limit: 50 })) as Record<string, unknown>[];
  });
  if (error) return <Failed what="Follow-ups due" error={error} />;
  if (!data) return <Note>Reading Odoo…</Note>;
  if (data.length === 0) return <Note testID="dispatch-followups-empty">No follow-up calls are due.</Note>;
  return (
    <View style={styles.stack} testID="dispatch-followups">
      {data.map((r) => (
        <Card key={String(r.id)}>
          <Title>{typeof r.res_name === 'string' ? r.res_name : 'Customer'}</Title>
          <Meta>{typeof r.summary === 'string' && r.summary ? r.summary : 'Follow-up call'}</Meta>
          <Meta>
            Due {dateText(Date.parse(String(r.date_deadline)))}
            {Array.isArray(r.user_id) ? ` · ${String(r.user_id[1])}` : ''}
          </Meta>
        </Card>
      ))}
    </View>
  );
}

// ---- Map: every tech's stops and where the trucks are ----

interface WebHandle {
  injectJavaScript: (js: string) => void;
}
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebHandle> }>;

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('');

/** Today's jobs as pins, one colour per tech and numbered in their order, plus a dot for each tech's truck. */
export function buildPins(jobs: OdooTask[], points: Record<string, { lat: number; lon: number; approx?: boolean } | null | undefined>, techs: OdooUser[], positions: TechPosition[], now: number): MapPin[] {
  const pins: MapPin[] = [];
  const byTech = new Map<number, OdooTask[]>();
  for (const j of jobs) for (const w of j.assignees) byTech.set(w, [...(byTech.get(w) ?? []), j]);
  [...byTech.entries()].forEach(([tech, list], ti) => {
    const color = DAY_COLORS[ti % DAY_COLORS.length]!;
    [...list].sort((a, b) => (a.start ?? 0) - (b.start ?? 0)).forEach((j, i) => {
      const at = points[j.address.trim()];
      if (at) pins.push({ id: `job-${j.id}`, lat: at.lat, lon: at.lon, label: String(i + 1), kind: 'stop', color, ...(at.approx ? { approx: true } : {}) });
    });
  });
  for (const p of positions) pins.push({ id: `tech-${p.id}`, lat: p.lat, lon: p.lon, label: initials(techs.find((t) => t.id === p.id)?.name ?? p.name) || 'T', kind: 'next', ...(isLive(p, now) ? {} : { dim: true }) });
  return pins;
}

export function DispatchMap({ client, now = devNow }: { client: OdooClient; now?: () => number }) {
  const { data, error } = useRead(client, async () => {
    const today = startOfDay(now());
    const [jobs, techs, positions] = await Promise.all([client.jobsBetween(today, addDays(today, 1)), client.techs(), techPositions(client).catch(() => [] as TechPosition[])]);
    return { jobs, techs, positions };
  });
  const addresses = useMemo(() => (data?.jobs ?? []).map((j) => j.address).filter((a) => a.trim()), [data]);
  const { points } = useGeocode(addresses);
  const pins = useMemo(() => (data ? buildPins(data.jobs, points, data.techs, data.positions, now()) : []), [data, points, now]);
  const web = useRef<WebHandle>(null);
  const [ready, setReady] = useState(false);
  const lastFit = useRef('');
  const key = pins.map((p) => p.id).join(',');
  const script = setDataScript({ pins, route: [], fit: key !== lastFit.current } as MapData);
  useEffect(() => {
    if (!ready) return;
    web.current?.injectJavaScript(script);
    lastFit.current = key;
  }, [ready, script, key]);
  const html = useMemo(() => mapHtml(colors.selected), []);
  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const m = parseMapMessage(e.nativeEvent.data);
    if (m?.type === 'ready') {
      lastFit.current = '';
      setReady(true);
    }
  }, []);
  if (error) return <Failed what="Map" error={error} />;
  if (!data) return <Note>Reading Odoo…</Note>;
  const t = now();
  return (
    <View style={styles.stack} testID="dispatch-map">
      <View style={styles.mapBox}>
        <WebView ref={web} source={{ html, baseUrl: 'https://johnsons.hivemindjohnson.work/' }} originWhitelist={['*']} onMessage={onMessage} javaScriptEnabled setSupportMultipleWindows={false} nestedScrollEnabled style={styles.map} testID="dispatch-map-webview" />
      </View>
      <Note>Numbered colored pins are today's stops, one color per tech. Green circles with initials are the trucks; faded ones were last seen a while ago.</Note>
      {data.positions.length === 0 ? <Note testID="dispatch-map-nolocation">No truck locations yet. A tech's phone shares its position while they are clocked in and the app is open.</Note> : null}
      {data.positions.map((p) => (
        <Card key={p.id} testID={`dispatch-truck-${p.id}`}>
          <Title>{data.techs.find((x) => x.id === p.id)?.name ?? p.name}</Title>
          <Meta>{isLive(p, t) ? `Live, ${seenText(p.at, t)}` : `Last seen ${seenText(p.at, t)}`}</Meta>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  mapBox: { height: 340, borderRadius: radius.sheet, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', backgroundColor: '#E9EDE6' },
  map: { flex: 1, backgroundColor: '#E9EDE6' },
});
