import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { Action } from '../components/Buttons';
import { Card, dateText, Message, Meta, Note, NumBox, Row, TextBox, Title, toNum, useRun } from '../components/Dept';
import { ChipRow } from '../components/controls';
import { MenuGroup, SectionMenu, SectionPage } from '../components/SectionMenu';
import { useBadges } from '../lib/useBadges';
import { OdooClient } from '../lib/odoo';
import { findProductByCode } from '../lib/odooStock';
import {
  Adjustment,
  adjustmentLog,
  adjustmentText,
  applyCounts,
  Attention,
  BIG_DIFF,
  CountLine,
  isBigDifference,
  isBelowMin,
  JobUse,
  listPlaces,
  needsAttention,
  openReceipts,
  OpenReceipt,
  Place,
  placeOverview,
  PlaceSummary,
  readPlace,
  receiveInto,
  recentPartsUsed,
  transferStock,
} from '../lib/odooWarehouse';
import { useDepartments } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import { colors } from '../theme';

type Tab = 'overview' | 'count' | 'move' | 'receive' | 'jobs' | 'log';
const LABELS: Record<Tab, string> = { overview: 'Overview', count: 'Count', move: 'Move parts', receive: 'Receive', jobs: 'Parts on jobs', log: 'History' };

const DAY = 86400000;

/**
 * The warehouse manager's area: the warehouse and every truck side by side,
 * counting any of them, moving parts between them, receiving purchase orders,
 * the parts used on every job, and who changed what. All of it is Odoo's own
 * Inventory; nothing here is kept on the phone.
 */
export function WarehouseScreen() {
  const { client, status } = useOdoo();
  const { access, ready } = useDepartments();
  const [tab, setTab] = useState<Tab | null>(null);
  const back = useCallback(() => setTab(null), []);
  const badges = useBadges();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [countAt, setCountAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !access.warehouse) return;
    let alive = true;
    listPlaces(client).then(
      (p) => alive && setPlaces(p),
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [client, access.warehouse]);

  if (status === 'loading' || status === 'signingIn' || (client && !ready)) return <Note>Checking your Odoo access…</Note>;
  if (!client) return <Note testID="warehouse-signin">Sign in to Odoo to use the warehouse. Stock is kept in Odoo Inventory.</Note>;
  if (!access.warehouse) {
    return (
      <Card testID="warehouse-no-access">
        <Title>For the warehouse manager</Title>
        <Note>This area opens for people in Odoo's Inventory Administrator group, or the owner. Ask the owner to add you in Odoo (Settings, Users).</Note>
      </Card>
    );
  }
  const groups: MenuGroup<Tab>[] = [
    {
      title: 'Right now',
      items: [
        { id: 'overview', label: 'Overview', detail: 'The warehouse and every truck at a glance' },
        { id: 'receive', label: 'Receive', detail: 'Purchase orders on their way in', badge: badges.warehouse.receive },
      ],
    },
    {
      title: 'Count and move',
      items: [
        { id: 'count', label: 'Count', detail: 'The warehouse or any truck' },
        { id: 'move', label: 'Move parts', detail: 'Between the warehouse and trucks' },
      ],
    },
    {
      title: 'Records',
      items: [
        { id: 'jobs', label: 'Parts on jobs', detail: 'What each job used' },
        { id: 'log', label: 'History', detail: 'Who changed what' },
      ],
    },
  ];
  const goCount = (id: number) => {
    setCountAt(id);
    setTab('count');
  };
  return (
    <View style={styles.stack} testID="warehouse">
      {tab === null ? <SectionMenu groups={groups} onPick={setTab} testID="warehouse-tabs" rowTestID={(id) => `warehouse-tab-${id}`} /> : null}
      {tab !== null ? (
        <SectionPage area="Warehouse" title={LABELS[tab]} onBack={back} testID="warehouse-back">
        {error ? <Text style={styles.bad}>{error}</Text> : null}
        {!places ? <Note>Reading Odoo…</Note> : null}
        {places && tab === 'overview' ? <Overview client={client} places={places} onCount={goCount} /> : null}
        {places && tab === 'count' ? <Count client={client} places={places} start={countAt} by={client.session.name} /> : null}
        {places && tab === 'move' ? <Move client={client} places={places} /> : null}
        {tab === 'receive' ? <Receive client={client} /> : null}
        {tab === 'jobs' ? <PartsOnJobs client={client} /> : null}
        {tab === 'log' ? <History client={client} /> : null}
        </SectionPage>
      ) : null}
    </View>
  );
}

// ---- Overview and truck counts ----

function Overview({ client, places, onCount }: { client: OdooClient; places: Place[]; onCount: (id: number) => void }) {
  const [rows, setRows] = useState<PlaceSummary[] | null>(null);
  useEffect(() => {
    let alive = true;
    placeOverview(client, places).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [client, places]);
  if (!rows) return <Note>Reading every location…</Note>;
  const now = Date.now();
  const trucks = rows.filter((r) => r.place.truck);
  const counted = trucks.filter((r) => r.lastCountedAt && now - r.lastCountedAt < 7 * DAY).length;
  return (
    <View style={styles.stack} testID="warehouse-overview">
      {trucks.length > 0 ? (
        <Card>
          <Title>Truck counts this week</Title>
          <Meta>{counted === trucks.length ? 'Every truck has been counted.' : `${counted} of ${trucks.length} trucks counted in the last 7 days.`}</Meta>
        </Card>
      ) : null}
      {rows.map((r) => {
        const fresh = !!r.lastCountedAt && now - r.lastCountedAt < 7 * DAY;
        return (
          <Card key={r.place.id} warn={r.low > 0} testID={`overview-${r.place.id}`}>
            <Title>{r.place.name}</Title>
            <Meta>{`${r.parts} part${r.parts === 1 ? '' : 's'} · ${r.low} below minimum · ${r.zero} at zero`}</Meta>
            <Meta bad={r.place.truck && !fresh}>{`Last counted: ${dateText(r.lastCountedAt)}${r.place.truck ? (fresh ? ' · counted this week' : ' · due') : ''}`}</Meta>
            <Action label="Count it" onPress={() => onCount(r.place.id)} testID={`overview-count-${r.place.id}`} />
          </Card>
        );
      })}
    </View>
  );
}

// ---- Count ----

function Count({ client, places, start, by }: { client: OdooClient; places: Place[]; start: number | null; by: string }) {
  const [placeId, setPlaceId] = useState<number>(start ?? places[0]?.id ?? 0);
  const [lines, setLines] = useState<CountLine[] | null>(null);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const { busy, msg, run, setMsg } = useRun();

  const load = useCallback(() => {
    setLines(null);
    setTyped({});
    setNotes({});
    return readPlace(client, placeId).then(setLines, (e) => setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }));
  }, [client, placeId, setMsg]);
  useEffect(() => {
    if (placeId) load();
  }, [placeId, load]);

  const changes = useMemo(
    () =>
      (lines ?? []).flatMap((l) => {
        const n = toNum(typed[l.id] ?? '');
        return n !== null && n !== l.qty ? [{ line: l, counted: n, big: isBigDifference(l.qty, n) }] : [];
      }),
    [lines, typed],
  );
  const needNote = changes.filter((c) => c.big && !notes[c.line.id]?.trim());
  const shown = (lines ?? []).filter((l) => !search.trim() || `${l.name} ${l.code} ${l.barcode}`.toLowerCase().includes(search.trim().toLowerCase()));

  const scanned = (code: string) => {
    setScanning(false);
    const found = (lines ?? []).find((l) => l.barcode === code || l.code.toLowerCase() === code.toLowerCase());
    if (found) {
      setSearch(found.name);
      return;
    }
    run('scan', async () => {
      const p = await findProductByCode(client, code);
      if (!p) return { text: `No Odoo product has the code ${code}.`, bad: true };
      setLines((cur) => (cur && !cur.some((l) => l.id === p.id) ? [...cur, { ...p, qty: 0 }] : cur));
      setSearch(p.name);
      return `${p.name} is not counted here yet. Type how many there are.`;
    });
  };

  const apply = () =>
    run('apply', async () => {
      const r = await applyCounts(client, placeId, changes.map((c) => ({ productId: c.line.id, name: c.line.name, expected: c.line.qty, counted: c.counted, note: notes[c.line.id] })), by, Date.now());
      await load();
      const bits = [`${r.applied.length} adjusted in Odoo`];
      if (r.problems.length) bits.push(r.problems.map((p) => `${p.name}: ${p.why}`).join(' '));
      return { text: bits.join('. '), bad: r.problems.length > 0 };
    });

  return (
    <View style={styles.stack} testID="warehouse-count">
      <ChipRow scroll options={places.map((p) => ({ label: p.name, value: p.id }))} value={placeId} onChange={setPlaceId} testID="count-place" compact />
      <Row>
        <View style={styles.grow}>
          <TextBox value={search} onChange={setSearch} label="Find a part" testID="count-search" />
        </View>
        <Action label="Scan" onPress={() => setScanning(true)} testID="count-scan" />
      </Row>
      <Message msg={msg} testID="count-message" />
      {!lines ? <Note>Reading what Odoo has here…</Note> : null}
      {lines && lines.length === 0 ? <Note testID="count-empty">Odoo has nothing here yet. Scan a part and type how many there are to start it.</Note> : null}
      {shown.map((l) => {
        const n = toNum(typed[l.id] ?? '');
        const diff = n !== null ? n - l.qty : 0;
        return (
          <Card key={l.id} warn={isBelowMin(l)} testID={`count-line-${l.id}`}>
            <Title>{l.name}</Title>
            <Meta>{`Odoo has ${l.qty}${l.min ? ` · minimum ${l.min}` : ''}${l.countedAt ? ` · counted ${dateText(l.countedAt)}` : ''}`}</Meta>
            <Row>
              <NumBox value={typed[l.id] ?? ''} onChange={(v) => setTyped((t) => ({ ...t, [l.id]: v }))} label="Counted" testID={`count-input-${l.id}`} />
              {n !== null && diff !== 0 ? <Text style={[styles.diff, diff < 0 && styles.bad]}>{diff > 0 ? `+${diff}` : String(diff)}</Text> : null}
            </Row>
            {n !== null && diff !== 0 && isBigDifference(l.qty, n) ? (
              <View style={styles.stack}>
                <Meta bad>{`That is a big difference (over ${BIG_DIFF.units} or ${BIG_DIFF.percent}%). Say why.`}</Meta>
                <TextBox value={notes[l.id] ?? ''} onChange={(v) => setNotes((x) => ({ ...x, [l.id]: v }))} label="Why is it different?" testID={`count-note-${l.id}`} />
              </View>
            ) : null}
          </Card>
        );
      })}
      {changes.length > 0 ? (
        <Card testID="count-review">
          <Title>{`Ready to apply ${changes.length} change${changes.length === 1 ? '' : 's'}`}</Title>
          {changes.map((c) => (
            <Meta key={c.line.id}>{`${c.line.name}: ${c.line.qty} to ${c.counted}`}</Meta>
          ))}
          {needNote.length > 0 ? <Meta bad>{`${needNote.length} need${needNote.length === 1 ? 's' : ''} a note first.`}</Meta> : null}
          <Action primary label={busy === 'apply' ? 'Applying…' : 'Apply counts to Odoo'} disabled={busy !== null || needNote.length > 0} onPress={apply} testID="count-apply" />
        </Card>
      ) : null}
      <BarcodeScanner visible={scanning} title="Scan a part" hint="Counts the part you scan." onCode={scanned} onClose={() => setScanning(false)} />
    </View>
  );
}

// ---- Move parts between places ----

const newKey = () => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

function Move({ client, places }: { client: OdooClient; places: Place[] }) {
  const [from, setFrom] = useState<number>(places[0]?.id ?? 0);
  const [to, setTo] = useState<number>(places.find((p) => p.truck)?.id ?? places[1]?.id ?? 0);
  const [lines, setLines] = useState<CountLine[] | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [key, setKey] = useState(newKey);
  const { busy, msg, run, setMsg } = useRun();
  useEffect(() => {
    let alive = true;
    setLines(null);
    setQty({});
    if (from)
      readPlace(client, from).then(
        (l) => alive && setLines(l.filter((x) => x.qty > 0)),
        (e) => alive && setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }),
      );
    return () => {
      alive = false;
    };
  }, [client, from, setMsg]);
  const moving = (lines ?? []).flatMap((l) => {
    const n = toNum(qty[l.id] ?? '');
    return n && n > 0 ? [{ productId: l.id, name: l.name, qty: Math.min(n, l.qty), asked: n, have: l.qty }] : [];
  });
  const go = () =>
    run('move', async () => {
      const r = await transferStock(client, from, to, moving.map(({ productId, name, qty: q }) => ({ productId, name, qty: q })), key);
      setKey(newKey());
      setQty({});
      readPlace(client, from).then((l) => setLines(l.filter((x) => x.qty > 0)), () => undefined);
      return r.done ? `${r.name} done: ${moving.length} part${moving.length === 1 ? '' : 's'} moved.` : { text: `${r.name} is made but Odoo wants a person to finish it. Open it in Odoo (Inventory, Transfers).`, bad: true };
    });
  const name = (id: number) => places.find((p) => p.id === id)?.name ?? '';
  return (
    <View style={styles.stack} testID="warehouse-move">
      <Title>From</Title>
      <ChipRow scroll options={places.map((p) => ({ label: p.name, value: p.id }))} value={from} onChange={setFrom} testID="move-from" compact />
      <Title>To</Title>
      <ChipRow scroll options={places.map((p) => ({ label: p.name, value: p.id }))} value={to} onChange={setTo} testID="move-to" compact />
      <Message msg={msg} testID="move-message" />
      {!lines ? <Note>Reading {name(from)}…</Note> : null}
      {lines && lines.length === 0 ? <Note>Nothing in stock at {name(from)}.</Note> : null}
      {(lines ?? []).map((l) => (
        <Card key={l.id} testID={`move-line-${l.id}`}>
          <Title>{l.name}</Title>
          <Row>
            <Meta>{`${l.qty} here`}</Meta>
            <NumBox value={qty[l.id] ?? ''} onChange={(v) => setQty((q) => ({ ...q, [l.id]: v }))} label="Move" testID={`move-input-${l.id}`} />
          </Row>
        </Card>
      ))}
      {moving.length > 0 ? (
        <Card testID="move-review">
          <Title>{`Move ${moving.length} part${moving.length === 1 ? '' : 's'} from ${name(from)} to ${name(to)}`}</Title>
          {moving.map((m) => (
            <Meta key={m.productId}>{`${m.qty} × ${m.name}${m.asked > m.have ? ` (only ${m.have} there)` : ''}`}</Meta>
          ))}
          <Action primary label={busy === 'move' ? 'Moving…' : 'Make the transfer'} disabled={busy !== null || from === to} onPress={go} testID="move-go" />
        </Card>
      ) : null}
    </View>
  );
}

// ---- Receiving ----

function Receive({ client }: { client: OdooClient }) {
  const [list, setList] = useState<OpenReceipt[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [got, setGot] = useState<Record<number, string>>({});
  const [scanning, setScanning] = useState(false);
  const { busy, msg, run, setMsg } = useRun();
  const load = useCallback(() => openReceipts(client).then(setList, (e) => setMsg({ text: e instanceof Error ? e.message : String(e), bad: true })), [client, setMsg]);
  useEffect(() => {
    load();
  }, [load]);
  const receipt = list?.find((r) => r.pickingId === open);
  const open_ = (r: OpenReceipt) => {
    setOpen(r.pickingId);
    setGot(Object.fromEntries(r.lines.map((l) => [l.moveId, String(l.ordered)])));
  };
  const scanned = (code: string) => {
    setScanning(false);
    if (!receipt) return;
    findProductByCode(client, code).then((p) => {
      const line = p && receipt.lines.find((l) => l.productId === p.id);
      if (!line) return setMsg({ text: `${p?.name ?? code} is not on this receipt.`, bad: true });
      setMsg({ text: `${line.name} is on this receipt. Check the number received.` });
    }, () => setMsg({ text: 'Could not look that code up.', bad: true }));
  };
  const receive = () =>
    receipt &&
    run('receive', async () => {
      const r = await receiveInto(client, receipt.pickingId, receipt.lines.map((l) => ({ moveId: l.moveId, qty: toNum(got[l.moveId] ?? '') ?? 0 })));
      setOpen(null);
      await load();
      if (!r.done) return { text: `${receipt.name}: Odoo wants a person to finish it. Open it in Odoo.`, bad: true };
      return r.short ? `${receipt.name} received. ${r.short} line${r.short === 1 ? ' was' : 's were'} short: the rest stays open in Odoo as a backorder.` : `${receipt.name} received in full.`;
    });
  return (
    <View style={styles.stack} testID="warehouse-receive">
      <Message msg={msg} testID="receive-message" />
      {!list ? <Note>Reading open orders…</Note> : null}
      {list && list.length === 0 ? <Note testID="receive-empty">Nothing is waiting to be received.</Note> : null}
      {(list ?? []).map((r) => (
        <Card key={r.pickingId} warn={r.late} testID={`receipt-${r.pickingId}`}>
          <Title>{`${r.name}${r.vendor ? ` · ${r.vendor}` : ''}`}</Title>
          <Meta bad={r.late}>{`${r.origin || 'No order'} · expected ${dateText(r.scheduled)}${r.late ? ' · late' : ''}`}</Meta>
          {open === r.pickingId ? (
            <View style={styles.stack}>
              {r.lines.map((l) => (
                <Row key={l.moveId}>
                  <View style={styles.grow}>
                    <Text style={styles.name}>{l.name}</Text>
                    <Meta>{`Ordered ${l.ordered}`}</Meta>
                  </View>
                  <NumBox value={got[l.moveId] ?? ''} onChange={(v) => setGot((g) => ({ ...g, [l.moveId]: v }))} label="Got" testID={`receive-input-${l.moveId}`} />
                </Row>
              ))}
              <Row>
                <Action label="Scan to check" onPress={() => setScanning(true)} testID="receive-scan" />
                <Action primary label={busy === 'receive' ? 'Receiving…' : 'Receive these'} disabled={busy !== null} onPress={receive} testID="receive-go" />
              </Row>
            </View>
          ) : (
            <Action label="Receive" onPress={() => open_(r)} testID={`receive-open-${r.pickingId}`} />
          )}
        </Card>
      ))}
      <BarcodeScanner visible={scanning} title="Scan what came in" hint="Checks the part is on this receipt." onCode={scanned} onClose={() => setScanning(false)} />
    </View>
  );
}

// ---- Parts used on jobs ----

function PartsOnJobs({ client }: { client: OdooClient }) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<{ used: JobUse[]; attention: Attention } | null>(null);
  const [view, setView] = useState<'used' | 'attention'>('used');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    const since = Date.now() - days * DAY;
    recentPartsUsed(client, since)
      .then(async (used) => ({ used, attention: await needsAttention(client, since, used) }))
      .then(
        (d) => alive && setData(d),
        (e) => alive && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      alive = false;
    };
  }, [client, days]);
  const flag = data ? data.attention.noParts.length + data.attention.negative.length : 0;
  return (
    <View style={styles.stack} testID="warehouse-jobs">
      <ChipRow options={[{ label: '7 days', value: 7 }, { label: '14 days', value: 14 }, { label: '30 days', value: 30 }]} value={days} onChange={setDays} compact />
      <ChipRow options={[{ label: 'Parts used', value: 'used' as const }, { label: flag ? `Needs attention (${flag})` : 'Needs attention', value: 'attention' as const }]} value={view} onChange={setView} testID="jobs-view" compact />
      {error ? <Text style={styles.bad}>{error}</Text> : null}
      {!data && !error ? <Note>Reading jobs…</Note> : null}
      {data && view === 'used' && data.used.length === 0 ? <Note testID="jobs-empty">No parts have been recorded on jobs in this time.</Note> : null}
      {data && view === 'used'
        ? data.used.map((u) => (
            <Card key={u.orderId} testID={`job-used-${u.orderId}`}>
              <Title>{u.job}</Title>
              <Meta>{`${dateText(u.at)}${u.by ? ` · ${u.by}` : ''}${u.from ? ` · from ${u.from}` : ''}`}</Meta>
              {u.lines.map((l, i) => (
                <Text key={i} style={styles.name}>{`${l.qty} × ${l.name}`}</Text>
              ))}
            </Card>
          ))
        : null}
      {data && view === 'attention' ? (
        <View style={styles.stack} testID="jobs-attention">
          {flag === 0 ? <Note>Nothing needs a look.</Note> : null}
          {data.attention.noParts.length > 0 ? <Title>Jobs finished with no parts recorded</Title> : null}
          {data.attention.noParts.map((j) => (
            <Card key={j.orderId}>
              <Title>{j.job}</Title>
            </Card>
          ))}
          {data.attention.negative.length > 0 ? <Title>Counts below zero</Title> : null}
          {data.attention.negative.map((n, i) => (
            <Card key={i} warn>
              <Title>{n.name}</Title>
              <Meta bad>{`${n.qty} at ${n.place}: more was used than the count had.`}</Meta>
            </Card>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---- Adjustment history ----

function History({ client }: { client: OdooClient }) {
  const [person, setPerson] = useState('');
  const [part, setPart] = useState('');
  const [rows, setRows] = useState<Adjustment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setError(null);
      adjustmentLog(client, { person, part }).then(
        (r) => alive && setRows(r),
        (e) => alive && setError(e instanceof Error ? e.message : String(e)),
      );
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [client, person, part]);
  return (
    <View style={styles.stack} testID="warehouse-log">
      <TextBox value={person} onChange={setPerson} label="Who (name)" testID="log-person" />
      <TextBox value={part} onChange={setPart} label="Part" testID="log-part" />
      {error ? <Text style={styles.bad}>{error}</Text> : null}
      {!rows && !error ? <Note>Reading Odoo…</Note> : null}
      {rows && rows.length === 0 ? <Note>No adjustments found.</Note> : null}
      {(rows ?? []).map((a) => (
        <Card key={a.id}>
          <Title>{a.product}</Title>
          <Meta>{`${adjustmentText(a)} · ${dateText(a.at)}${a.by ? ` · ${a.by}` : ''}`}</Meta>
          {a.reference ? <Meta>{a.reference}</Meta> : null}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  grow: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  bad: { color: colors.stop, fontSize: 16, fontWeight: '800' },
  diff: { fontSize: 22, fontWeight: '800', color: colors.text },
});
