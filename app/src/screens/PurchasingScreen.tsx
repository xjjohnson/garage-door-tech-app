import { useCallback, useEffect, useState } from 'react';
import { useBackStep } from '../lib/backStep';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { Card, dateText, Message, Meta, money, PartsSummary, Note, NumBox, Row, TextBox, Title, toCents, toNum, useRun } from '../components/Dept';
import { PricelistEditor } from '../components/PricelistEditor';
import { ChipRow } from '../components/controls';
import { MenuGroup, SectionMenu, SectionPage } from '../components/SectionMenu';
import { useBadges } from '../lib/useBadges';
import { partsRequests } from '../lib/odooOffice';
import { ActivityList } from './CarePages';
import { OdooClient } from '../lib/odoo';
import {
  cancelPurchase,
  confirmAndSend,
  costWentUp,
  CostRise,
  draftForVendor,
  editPurchaseLine,
  listPurchases,
  listVendors,
  marginPercent,
  partVendors,
  PartPricing,
  PartVendors,
  PoDetail,
  PO_GROUP_LABEL,
  PoGroup,
  PoRow,
  readPurchase,
  removeVendorPrice,
  savePricing,
  saveVendorPrice,
  searchPricing,
  suggestFromUse,
  toOrder,
  UseSuggestion,
  Vendor,
  VendorOrder,
} from '../lib/odooPurchasing';
import { listPlaces, Place, recentPartsUsed } from '../lib/odooWarehouse';
import { writeOrderpoint } from '../lib/odooStock';
import { useDepartments } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import { colors, fs, sp } from '../theme';

type Tab = 'order' | 'requests' | 'orders' | 'vendors' | 'prices' | 'lists' | 'usage';
const LABELS: Record<Tab, string> = { order: 'To order', requests: 'Parts requests', orders: 'Purchase orders', vendors: 'Vendors', prices: 'Cost and price', lists: 'Pricelists', usage: 'Reorder levels' };

/**
 * The buyer's area: what is under minimum across the warehouse and every truck,
 * purchase orders (confirm and email from here), vendors and their prices, cost
 * and sell price with the "cost went up" review, pricelists, and reorder levels
 * suggested from what jobs really used. Odoo holds all of it.
 */
export function PurchasingScreen() {
  const { client, status } = useOdoo();
  const { access, ready } = useDepartments();
  const [tab, setTab] = useState<Tab | null>(null);
  const back = useCallback(() => setTab(null), []);
  const badges = useBadges().purchasing;
  if (status === 'loading' || status === 'signingIn' || (client && !ready)) return <Note>Checking your Odoo access…</Note>;
  if (!client) return <Note testID="purchasing-signin">Sign in to Odoo to use purchasing. Orders and prices are kept in Odoo.</Note>;
  if (!access.purchasing) {
    return (
      <Card testID="purchasing-no-access">
        <Title>For the buyer</Title>
        <Note>This area opens for people in Odoo's Purchase group, or the owner. Ask the owner to add you in Odoo (Settings, Users).</Note>
      </Card>
    );
  }
  const groups: MenuGroup<Tab>[] = [
    {
      title: 'Ordering',
      items: [
        { id: 'order', label: 'To order', detail: 'Under minimum, counting what is on order', badge: badges.toOrder },
        { id: 'requests', label: 'Parts requests', detail: 'Asked for by sales' },
        { id: 'orders', label: 'Purchase orders', detail: 'Review, confirm and email', badge: badges.drafts + badges.late },
        { id: 'vendors', label: 'Vendors', detail: 'Contacts and their prices' },
      ],
    },
    {
      title: 'Cost and price',
      items: [
        { id: 'prices', label: 'Cost and price', detail: 'Cost went up review' },
        { id: 'lists', label: 'Pricelists', detail: 'Prices by customer type' },
      ],
    },
    {
      title: 'Planning',
      items: [{ id: 'usage', label: 'Reorder levels', detail: 'Suggested from what jobs used' }],
    },
  ];
  return (
    <View style={styles.stack} testID="purchasing">
      {tab === null ? <SectionMenu groups={groups} onPick={setTab} testID="purchasing-tabs" rowTestID={(id) => `purchasing-tab-${id}`} /> : null}
      {tab !== null ? (
        <SectionPage area="Purchasing" title={LABELS[tab]} onBack={back} testID="purchasing-back">
        {tab === 'order' ? <ToOrder client={client} /> : null}
        {tab === 'requests' ? <ActivityList client={client} load={() => partsRequests(client)} empty="No one has asked for parts." doneLabel="Mark ordered" testID="requests" /> : null}
        {tab === 'orders' ? <Orders client={client} /> : null}
        {tab === 'vendors' ? <Vendors client={client} /> : null}
        {tab === 'prices' ? <CostAndPrice client={client} canEdit={access.pricing} /> : null}
        {tab === 'lists' ? <PricelistEditor client={client} canEdit={access.pricing} /> : null}
        {tab === 'usage' ? <Usage client={client} /> : null}
        </SectionPage>
      ) : null}
    </View>
  );
}

// ---- To order ----

export function ToOrder({ client }: { client: OdooClient }) {
  const [groups, setGroups] = useState<VendorOrder[] | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const { busy, msg, run, setMsg } = useRun();
  const load = useCallback(
    () =>
      toOrder(client).then(
        (g) => {
          setGroups(g);
          setQty(Object.fromEntries(g.flatMap((v) => v.lines.map((l) => [l.productId, String(l.qty)]))));
        },
        (e) => setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }),
      ),
    [client, setMsg],
  );
  useEffect(() => {
    load();
  }, [load]);
  const make = (v: VendorOrder) =>
    run(`po-${v.vendorId}`, async () => {
      const po = await draftForVendor(client, v.vendorId, v.lines.map((l) => ({ productId: l.productId, name: l.name, qty: toNum(qty[l.productId] ?? '') ?? 0, priceCents: l.priceCents })));
      await load();
      return `Draft ${po.name} ${po.reused ? 'updated' : 'made'} for ${v.vendor}. Open it under Purchase orders to review, confirm and send.`;
    });
  return (
    <View style={styles.stack} testID="purchasing-order">
      <Message msg={msg} testID="order-message" />
      {!groups ? <Note>Adding up the warehouse and every truck…</Note> : null}
      {groups && groups.length === 0 ? <Note testID="order-empty">Nothing is under its minimum, counting what is already on order.</Note> : null}
      {(groups ?? []).map((v) => (
        <Card key={v.vendorId} testID={`order-vendor-${v.vendorId}`}>
          <Title>{v.vendor}</Title>
          <Meta>{`About ${money(v.totalCents)} · parts already on open orders are not counted twice`}</Meta>
          {v.lines.map((l) => (
            <Row key={l.productId}>
              <View style={styles.grow}>
                <Text style={styles.name}>{l.name}</Text>
                <Meta>{`Have ${l.onHand} · minimum ${l.min}${l.onOrder ? ` · ${l.onOrder} on order` : ''}`}</Meta>
              </View>
              <NumBox value={qty[l.productId] ?? ''} onChange={(x) => setQty((q) => ({ ...q, [l.productId]: x }))} label="Order" testID={`order-qty-${l.productId}`} width={80} />
            </Row>
          ))}
          {v.vendorId ? <Action primary label={busy === `po-${v.vendorId}` ? 'Making…' : 'Make a draft order'} disabled={busy !== null} onPress={() => make(v)} testID={`order-draft-${v.vendorId}`} /> : <Meta bad>Add a vendor to these parts (Vendors tab) to order them.</Meta>}
        </Card>
      ))}
    </View>
  );
}

// ---- Purchase orders ----

const GROUPS: PoGroup[] = ['draft', 'sent', 'receive', 'done'];

export function Orders({ client }: { client: OdooClient }) {
  const [rows, setRows] = useState<PoRow[] | null>(null);
  const [group, setGroup] = useState<PoGroup>('draft');
  const [open, setOpen] = useState<PoDetail | null>(null);
  const { busy, msg, run, setMsg } = useRun();
  const load = useCallback(() => listPurchases(client).then(setRows, (e) => setMsg({ text: e instanceof Error ? e.message : String(e), bad: true })), [client, setMsg]);
  useEffect(() => {
    load();
  }, [load]);
  const show = (id: number) => readPurchase(client, id).then(setOpen, (e) => setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }));
  if (open) return <OrderDetail client={client} po={open} busy={busy} msg={msg} run={run} onBack={() => { setOpen(null); load(); }} reload={() => show(open.id)} />;
  const mine = (rows ?? []).filter((r) => r.group === group);
  return (
    <View style={styles.stack} testID="purchasing-orders">
      <ChipRow scroll options={GROUPS.map((g) => ({ label: `${PO_GROUP_LABEL[g]}${rows ? ` (${rows.filter((r) => r.group === g).length})` : ''}`, value: g }))} value={group} onChange={setGroup} testID="orders-group" compact />
      <Message msg={msg} testID="orders-message" />
      {!rows ? <Note>Reading purchase orders…</Note> : null}
      {rows && mine.length === 0 ? <Note>No {PO_GROUP_LABEL[group].toLowerCase()} orders.</Note> : null}
      {mine.map((r) => (
        <Card key={r.id} warn={r.late} testID={`po-${r.id}`}>
          <Title>{`${r.name} · ${r.vendor}`}</Title>
          <PartsSummary items={r.items.map((i) => ({ name: i.name, qty: i.qty, extra: `${money(i.priceCents)} each` }))} testID={`po-parts-${r.id}`} />
          <Meta>{[r.forWhat, r.orderedBy ? `ordered by ${r.orderedBy}` : ''].filter(Boolean).join(' · ') || 'No job or reason on it'}</Meta>
          <Meta bad={r.late}>{`${money(r.totalCents)}${r.expected ? ` · expected ${dateText(r.expected)}` : ''}${r.late ? ' · late' : ''}`}</Meta>
          <Meta>{r.next}</Meta>
          <Action label="Open" onPress={() => show(r.id)} testID={`po-open-${r.id}`} />
        </Card>
      ))}
    </View>
  );
}

function OrderDetail({ client, po, busy, msg, run, onBack, reload }: { client: OdooClient; po: PoDetail; busy: string | null; msg: ReturnType<typeof useRun>['msg']; run: ReturnType<typeof useRun>['run']; onBack: () => void; reload: () => void }) {
  const editable = po.state === 'draft' || po.state === 'sent';
  const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries(po.lines.map((l) => [l.id, String(l.qty)])));
  const [price, setPrice] = useState<Record<number, string>>(() => Object.fromEntries(po.lines.map((l) => [l.id, String(l.priceCents / 100)])));
  const [sure, setSure] = useState(false);
  const changed = po.lines.filter((l) => toNum(qty[l.id] ?? '') !== l.qty || toCents(price[l.id] ?? '') !== l.priceCents);
  const saveLines = () =>
    run('lines', async () => {
      for (const l of changed) await editPurchaseLine(client, po.id, { id: l.id, qty: toNum(qty[l.id] ?? '') ?? l.qty, priceCents: toCents(price[l.id] ?? '') ?? l.priceCents });
      reload();
      return 'Order lines saved in Odoo.';
    });
  const send = () =>
    run('send', async () => {
      const r = await confirmAndSend(client, po.id);
      setSure(false);
      reload();
      return r.emailed ? { text: `${po.name} confirmed and emailed to ${po.vendor}.` } : { text: r.why ?? `${po.name} confirmed.`, bad: r.state === 'to approve' ? true : !r.emailed };
    });
  const cancel = () =>
    run('cancel', async () => {
      await cancelPurchase(client, po.id);
      reload();
      return `${po.name} cancelled.`;
    });
  useBackStep(onBack);
  const total = po.lines.reduce((n, l) => n + Math.round((toNum(qty[l.id] ?? '') ?? l.qty) * (toCents(price[l.id] ?? '') ?? l.priceCents)), 0);
  return (
    <View style={styles.stack} testID="po-detail">
      <Title>{`${po.name} · ${po.vendor}`}</Title>
      <Meta>{[po.forWhat, po.orderedBy ? `ordered by ${po.orderedBy}` : ''].filter(Boolean).join(' · ')}</Meta>
      <Meta>{po.next}</Meta>
      <Meta>{`${PO_GROUP_LABEL[po.group]}${po.expected ? ` · expected ${dateText(po.expected)}` : ''}${po.late ? ' · late' : ''}${po.email ? ` · ${po.email}` : ' · no email on the vendor'}`}</Meta>
      <Message msg={msg} testID="po-message" />
      {po.lines.map((l) => (
        <Card key={l.id} testID={`po-line-${l.id}`}>
          <Title>{l.name}</Title>
          {editable ? (
            <Row>
              <NumBox value={qty[l.id] ?? ''} onChange={(x) => setQty((q) => ({ ...q, [l.id]: x }))} label="Qty" testID={`po-qty-${l.id}`} width={80} />
              <NumBox value={price[l.id] ?? ''} onChange={(x) => setPrice((q) => ({ ...q, [l.id]: x }))} label="Price $" testID={`po-price-${l.id}`} width={96} />
            </Row>
          ) : (
            <Meta>{`${l.qty} ordered · ${l.received} received · ${money(l.priceCents)} each`}</Meta>
          )}
        </Card>
      ))}
      <Title>{`Total ${money(editable ? total : po.totalCents)}`}</Title>
      {editable && changed.length > 0 ? <Action label={busy === 'lines' ? 'Saving…' : 'Save line changes'} disabled={busy !== null} onPress={saveLines} testID="po-save" /> : null}
      {editable && !sure ? <Action primary label="Confirm and send…" disabled={busy !== null || changed.length > 0} onPress={() => setSure(true)} testID="po-confirm" hint="Shows what will be sent first" /> : null}
      {editable && changed.length > 0 ? <Meta bad>Save the line changes first.</Meta> : null}
      {sure ? (
        <Card warn testID="po-sure">
          <Title>{`Confirm ${po.name} and email it to ${po.vendor}?`}</Title>
          <Meta>{`${po.lines.length} line${po.lines.length === 1 ? '' : 's'}, ${money(po.totalCents)}. This cannot be taken back from the app.`}</Meta>
          <Row>
            <Action primary label={busy === 'send' ? 'Sending…' : 'Yes, confirm and send'} disabled={busy !== null} onPress={send} testID="po-send" />
            <Action label="Not yet" onPress={() => setSure(false)} testID="po-notyet" />
          </Row>
        </Card>
      ) : null}
      {po.state !== 'done' && po.state !== 'cancel' && !po.lines.some((l) => l.received > 0) ? <Action label="Cancel this order" disabled={busy !== null} onPress={cancel} testID="po-cancel" /> : null}
    </View>
  );
}

// ---- Vendors ----

function Vendors({ client }: { client: OdooClient }) {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [part, setPart] = useState('');
  const [parts, setParts] = useState<PartPricing[]>([]);
  const [picked, setPicked] = useState<{ part: PartPricing; v: PartVendors } | null>(null);
  const [draft, setDraft] = useState<{ id?: number; vendorId?: number; vendor: string; price: string; min: string; code: string; delay: string } | null>(null);
  const { busy, msg, run } = useRun();
  useEffect(() => {
    listVendors(client).then(setVendors, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [client]);
  useEffect(() => {
    if (!part.trim()) return setParts([]);
    let alive = true;
    const t = setTimeout(() => searchPricing(client, part, 6).then((r) => alive && setParts(r), () => undefined), 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [client, part]);
  const pick = async (p: PartPricing) => {
    setPicked({ part: p, v: await partVendors(client, p.productId) });
    setDraft(null);
    setParts([]);
    setPart('');
  };
  const save = () =>
    picked &&
    draft &&
    run('vendor', async () => {
      if (!draft.vendorId) throw new Error('Pick a vendor.');
      await saveVendorPrice(client, picked.v.templateId, { id: draft.id, vendorId: draft.vendorId, priceCents: toCents(draft.price) ?? 0, minQty: toNum(draft.min) ?? 0, code: draft.code, delay: toNum(draft.delay) ?? 0 });
      setPicked({ ...picked, v: await partVendors(client, picked.part.productId) });
      setDraft(null);
      return 'Saved to Odoo.';
    });
  const drop = (id: number) =>
    picked &&
    run('drop', async () => {
      await removeVendorPrice(client, id);
      setPicked({ ...picked, v: await partVendors(client, picked.part.productId) });
      return 'Vendor price removed.';
    });
  return (
    <View style={styles.stack} testID="purchasing-vendors">
      <Message msg={msg} testID="vendors-message" />
      <TextBox value={part} onChange={setPart} label="Find a part to see its vendors" testID="vendor-part-search" />
      {parts.map((p) => (
        <Action key={p.productId} label={p.name} onPress={() => pick(p)} testID={`vendor-part-${p.productId}`} />
      ))}
      {picked ? (
        <Card testID="vendor-part-card">
          <Title>{picked.part.name}</Title>
          <Meta>Cheapest first. The first vendor is the one reorders go to.</Meta>
          {picked.v.rows.length === 0 ? <Note>No vendors on this part yet.</Note> : null}
          {picked.v.rows.map((r) => (
            <Row key={r.id}>
              <View style={styles.grow}>
                <Text style={styles.name}>{`${r.vendor} · ${money(r.priceCents)}`}</Text>
                <Meta>{`${r.minQty ? `from ${r.minQty} · ` : ''}${r.code ? `code ${r.code} · ` : ''}${r.delay} day${r.delay === 1 ? '' : 's'}`}</Meta>
              </View>
              <Action label="Change" onPress={() => setDraft({ id: r.id, vendorId: r.vendorId, vendor: r.vendor, price: String(r.priceCents / 100), min: String(r.minQty), code: r.code, delay: String(r.delay) })} testID={`vendor-row-edit-${r.id}`} />
              <Action label="Remove" onPress={() => drop(r.id)} disabled={busy !== null} testID={`vendor-row-remove-${r.id}`} />
            </Row>
          ))}
          {!draft ? <Action label="Add a vendor price" onPress={() => setDraft({ vendor: '', price: '', min: '', code: '', delay: '' })} testID="vendor-row-add" /> : null}
          {draft ? (
            <View style={styles.stack} testID="vendor-draft">
              {!draft.id ? <ChipRow scroll options={(vendors ?? []).map((v) => ({ label: v.name, value: v.id }))} value={draft.vendorId ?? 0} onChange={(id) => setDraft({ ...draft, vendorId: id, vendor: vendors?.find((v) => v.id === id)?.name ?? '' })} testID="vendor-pick" compact /> : <Meta>{draft.vendor}</Meta>}
              <Row>
                <NumBox value={draft.price} onChange={(price) => setDraft({ ...draft, price })} label="Price $" testID="vendor-price" />
                <NumBox value={draft.min} onChange={(min) => setDraft({ ...draft, min })} label="From qty" testID="vendor-min" />
                <NumBox value={draft.delay} onChange={(delay) => setDraft({ ...draft, delay })} label="Days" testID="vendor-delay" width={80} />
              </Row>
              <TextBox value={draft.code} onChange={(code) => setDraft({ ...draft, code })} label="Vendor's part code" testID="vendor-code" />
              <Row>
                <Action primary label={busy === 'vendor' ? 'Saving…' : 'Save to Odoo'} disabled={busy !== null} onPress={save} testID="vendor-save" />
                <Action label="Cancel" onPress={() => setDraft(null)} testID="vendor-cancel" />
              </Row>
            </View>
          ) : null}
        </Card>
      ) : null}
      <Title>Vendors</Title>
      {error ? <Text style={styles.bad}>{error}</Text> : null}
      {!vendors && !error ? <Note>Reading vendors…</Note> : null}
      {vendors && vendors.length === 0 ? <Note>Odoo has no vendors yet. Make a contact in Purchase, Vendors.</Note> : null}
      {(vendors ?? []).map((v) => (
        <Card key={v.id} testID={`vendor-${v.id}`}>
          <Title>{v.name}</Title>
          <Meta>{`${v.email || 'no email'}${v.phone ? ` · ${v.phone}` : ''}`}</Meta>
          <Meta>{`${v.parts} part price${v.parts === 1 ? '' : 's'}${v.leadDays ? ` · about ${v.leadDays} days to deliver` : ''}`}</Meta>
        </Card>
      ))}
    </View>
  );
}

// ---- Cost, price and the "cost went up" review ----

function CostAndPrice({ client, canEdit }: { client: OdooClient; canEdit: boolean }) {
  const [q, setQ] = useState('');
  const [parts, setParts] = useState<PartPricing[] | null>(null);
  const [rises, setRises] = useState<CostRise[] | null>(null);
  const [cost, setCost] = useState<Record<number, string>>({});
  const [price, setPrice] = useState<Record<number, string>>({});
  const { busy, msg, run } = useRun();
  const loadRises = useCallback(() => costWentUp(client).then(setRises, () => setRises([])), [client]);
  useEffect(() => {
    loadRises();
  }, [loadRises]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => searchPricing(client, q).then((r) => alive && setParts(r), () => alive && setParts([])), 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [client, q]);
  const saveOne = (p: PartPricing) =>
    run(`save-${p.productId}`, async () => {
      const c = toCents(cost[p.productId] ?? '');
      const pr = toCents(price[p.productId] ?? '');
      await savePricing(client, p.productId, { ...(c !== null && c !== p.costCents ? { costCents: c } : {}), ...(pr !== null && pr !== p.priceCents ? { priceCents: pr } : {}) });
      setParts((cur) => (cur ?? []).map((x) => (x.productId === p.productId ? { ...x, costCents: c ?? x.costCents, priceCents: pr ?? x.priceCents } : x)));
      return `${p.name} saved in Odoo.`;
    });
  const accept = (r: CostRise) =>
    run(`rise-${r.productId}`, async () => {
      const newPrice = toCents(price[r.productId] ?? '') ?? r.suggestedPriceCents;
      await savePricing(client, r.productId, { costCents: r.paidCents, priceCents: newPrice });
      await loadRises();
      return `${r.name}: cost is now ${money(r.paidCents)} and the price ${money(newPrice)}.`;
    });
  return (
    <View style={styles.stack} testID="purchasing-prices">
      <Message msg={msg} testID="prices-message" />
      {!canEdit ? <Note>You can look at cost and price here. Changing them needs a purchasing manager who is also a sales manager in Odoo.</Note> : null}
      {rises && rises.length > 0 ? (
        <View style={styles.stack} testID="cost-rises">
          <Title>{`Cost went up (${rises.length})`}</Title>
          {rises.map((r) => (
            <Card key={r.productId} warn testID={`rise-${r.productId}`}>
              <Title>{r.name}</Title>
              <Meta>{`Cost ${money(r.costCents)}, last paid ${money(r.paidCents)}${r.paidAt ? ` on ${dateText(r.paidAt)}` : ''}. Price now ${money(r.priceCents)} (${marginPercent(r.costCents, r.priceCents)}% margin).`}</Meta>
              {canEdit ? (
                <>
                  <Row>
                    <Text style={styles.name}>New price $</Text>
                    <NumBox value={price[r.productId] ?? String(r.suggestedPriceCents / 100)} onChange={(x) => setPrice((p) => ({ ...p, [r.productId]: x }))} label="New price" testID={`rise-price-${r.productId}`} />
                  </Row>
                  <Meta>{`Same margin would be ${money(r.suggestedPriceCents)}.`}</Meta>
                  <Action primary label={busy === `rise-${r.productId}` ? 'Saving…' : 'Update cost and price'} disabled={busy !== null} onPress={() => accept(r)} testID={`rise-accept-${r.productId}`} />
                </>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}
      <TextBox value={q} onChange={setQ} label="Find a part" testID="prices-search" />
      {!parts ? <Note>Reading parts…</Note> : null}
      {(parts ?? []).map((p) => {
        const c = cost[p.productId] ?? String(p.costCents / 100);
        const pr = price[p.productId] ?? String(p.priceCents / 100);
        return (
          <Card key={p.productId} testID={`price-${p.productId}`}>
            <Title>{p.name}</Title>
            <Meta>{`Margin ${marginPercent(toCents(c) ?? p.costCents, toCents(pr) ?? p.priceCents)}%${p.lastPaidCents ? ` · last paid ${money(p.lastPaidCents)}` : ''}`}</Meta>
            {canEdit ? (
              <>
                <Row>
                  <NumBox value={c} onChange={(x) => setCost((m) => ({ ...m, [p.productId]: x }))} label="Cost $" testID={`price-cost-${p.productId}`} />
                  <NumBox value={pr} onChange={(x) => setPrice((m) => ({ ...m, [p.productId]: x }))} label="Price $" testID={`price-price-${p.productId}`} />
                </Row>
                <Action label={busy === `save-${p.productId}` ? 'Saving…' : 'Save this part'} disabled={busy !== null} onPress={() => saveOne(p)} testID={`price-save-${p.productId}`} />
              </>
            ) : (
              <Meta>{`Cost ${money(p.costCents)} · price ${money(p.priceCents)}`}</Meta>
            )}
          </Card>
        );
      })}
    </View>
  );
}

// ---- Reorder levels from real use ----

function Usage({ client }: { client: OdooClient }) {
  const [weeks, setWeeks] = useState(8);
  const [rows, setRows] = useState<UseSuggestion[] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeId, setPlaceId] = useState(0);
  const { busy, msg, run, setMsg } = useRun();
  useEffect(() => {
    listPlaces(client).then((p) => {
      setPlaces(p);
      setPlaceId((cur) => cur || p[0]?.id || 0);
    }, () => undefined);
  }, [client]);
  useEffect(() => {
    let alive = true;
    setRows(null);
    recentPartsUsed(client, Date.now() - weeks * 7 * 86400000).then(
      (u) => alive && setRows(suggestFromUse(u, weeks)),
      (e) => alive && setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }),
    );
    return () => {
      alive = false;
    };
  }, [client, weeks, setMsg]);
  const apply = (r: UseSuggestion) =>
    run(`use-${r.productId}`, async () => {
      await writeOrderpoint(client, placeId, r.productId, r.min, r.max);
      return `${r.name}: minimum ${r.min}, maximum ${r.max} saved in Odoo.`;
    });
  return (
    <View style={styles.stack} testID="purchasing-usage">
      <ChipRow options={[{ label: '4 weeks', value: 4 }, { label: '8 weeks', value: 8 }, { label: '12 weeks', value: 12 }]} value={weeks} onChange={setWeeks} testID="usage-weeks" compact />
      <Note>Suggestions come from parts really used on jobs. Minimum covers about 2 weeks of use; maximum is twice that. Apply them one part at a time.</Note>
      {places.length > 1 ? <ChipRow scroll options={places.map((p) => ({ label: p.name, value: p.id }))} value={placeId} onChange={setPlaceId} testID="usage-place" compact /> : null}
      <Message msg={msg} testID="usage-message" />
      {!rows ? <Note>Reading jobs…</Note> : null}
      {rows && rows.length === 0 ? <Note testID="usage-empty">No parts have been recorded on jobs in this time.</Note> : null}
      {(rows ?? []).map((r) => (
        <Card key={r.productId} testID={`usage-${r.productId}`}>
          <Title>{r.name}</Title>
          <Meta>{`${r.used} used · about ${r.perWeek} a week → minimum ${r.min}, maximum ${r.max}`}</Meta>
          <Action label={busy === `use-${r.productId}` ? 'Saving…' : 'Apply to Odoo'} disabled={busy !== null || !placeId} onPress={() => apply(r)} testID={`usage-apply-${r.productId}`} />
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(12) },
  grow: { flex: 1 },
  name: { fontSize: fs(18), fontWeight: '700', color: colors.text },
  bad: { color: colors.stop, fontSize: fs(16), fontWeight: '800' },
});
