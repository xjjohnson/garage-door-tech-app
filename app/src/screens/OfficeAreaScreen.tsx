import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { DeptArea } from '../components/DeptArea';
import { ChipRow } from '../components/controls';
import { Note } from '../components/Dept';
import { usePageRows } from '../components/DeptRows';
import { MenuGroup, SectionMenu } from '../components/SectionMenu';
import type { OdooClient } from '../lib/odoo';
import { doNext, searchRows, sumCents } from '../lib/officeBoard';
import { formatMoney } from '../lib/prices';
import { useDepartments } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import { colors, fs, sp } from '../theme';
import { PeopleFront, TimeSheets } from './OfficePeople';
import { useBadges } from '../lib/useBadges';
import { useLimits } from '../lib/useLimits';
import { overdueInvoices, ordersToInvoice, quotesWaiting, sentNotOpened, unpaidInvoices } from '../lib/odooOffice';
import { ClosedNoOrder, PaymentsToRecord } from './OfficeExtras';
import { CameBack, ComplaintsList, LogComplaint, WarrantyList } from './CarePages';
import { invoiceTotal, MoneyList } from './MoneyPages';
import { makeStyles } from '../lib/makeStyles';

export type OfficeTab = 'notinvoiced' | 'overdue' | 'quotes' | 'unpaid' | 'cameback' | 'complaints' | 'newcomplaint' | 'warranty' | 'payments' | 'noorder' | 'notopened' | 'timesheets';
const LABELS: Record<OfficeTab, string> = {
  notinvoiced: 'Done, not invoiced',
  overdue: 'Invoices overdue',
  quotes: 'Quotes waiting for a yes',
  unpaid: 'Unpaid invoices',
  cameback: 'Came back',
  complaints: 'Open complaints',
  newcomplaint: 'Log a complaint',
  warranty: 'Warranty',
  payments: 'Payments to record',
  noorder: 'Closed jobs, no order',
  notopened: 'Invoices sent, not opened',
  timesheets: 'Time sheets',
};

/**
 * Office: billing and money, and the customers who need looking after. Invoices, payments and
 * quotes are Odoo's own; complaints are to-dos on the customer; warranty is read from equipment.
 */
export function OfficeAreaScreen({ initial, now = Date.now }: { initial?: OfficeTab; now?: () => number }) {
  const b = useBadges().office;
  const limits = useLimits();
  const { access } = useDepartments();
  const groups: MenuGroup<OfficeTab>[] = [
    {
      title: 'Needs you now',
      items: [
        { id: 'notinvoiced', label: LABELS.notinvoiced, detail: 'Approved orders with nothing billed yet', badge: b.notInvoiced },
        { id: 'overdue', label: LABELS.overdue, detail: 'Past the due date', badge: b.overdue },
        { id: 'payments', label: LABELS.payments, detail: 'Taken on this phone, not in Odoo yet' },
        { id: 'quotes', label: LABELS.quotes, detail: 'Sent, no answer yet' },
      ],
    },
    {
      title: 'Money in',
      items: [
        { id: 'unpaid', label: LABELS.unpaid, detail: 'Everything customers still owe' },
        { id: 'notopened', label: LABELS.notopened, detail: 'Emailed, never opened' },
        { id: 'noorder', label: LABELS.noorder, detail: 'Done, with nothing to bill from' },
      ],
    },
    {
      title: 'Customers',
      items: [
        { id: 'cameback', label: LABELS.cameback, detail: 'The same house again soon', badge: b.cameBack },
        { id: 'complaints', label: LABELS.complaints, detail: 'To-dos on customers', badge: b.complaints },
        { id: 'newcomplaint', label: LABELS.newcomplaint, detail: 'Save one in Odoo' },
        { id: 'warranty', label: LABELS.warranty, detail: 'Who is covered, and for how long' },
      ],
    },
  ];
  return (
    <DeptArea<OfficeTab>
      area="Office"
      who="the office"
      need="office"
      prefix="office"
      groups={groups}
      labels={LABELS}
      initial={initial}
      front={(open, client) => <OfficeFront client={client} open={open} owner={access.owner} now={now} groups={groups} />}
      page={(tab, client) => {
        switch (tab) {
          case 'notinvoiced':
            return <MoneyList client={client} table filters invoice={false} load={() => ordersToInvoice(client, limits, now())} empty="Nothing is waiting to be invoiced." testID="notinvoiced" header={invoiceTotal} />;
          case 'overdue':
            return <MoneyList client={client} table filters invoice load={() => overdueInvoices(client, limits, now())} empty="No invoice is past due." testID="overdue" header={invoiceTotal} />;
          case 'quotes':
            return <MoneyList client={client} table filters invoice={false} load={() => quotesWaiting(client, now())} empty="No quote is waiting." testID="quotes" />;
          case 'unpaid':
            return <MoneyList client={client} table filters invoice load={() => unpaidInvoices(client, now())} empty="Nobody owes anything." testID="unpaid" header={invoiceTotal} />;
          case 'cameback':
            return <CameBack client={client} limits={limits} now={now} />;
          case 'complaints':
            return <ComplaintsList client={client} />;
          case 'newcomplaint':
            return <LogComplaint client={client} now={now} />;
          case 'warranty':
            return <WarrantyList client={client} now={now} />;
          case 'payments':
            return <PaymentsToRecord />;
          case 'noorder':
            return <ClosedNoOrder client={client} limits={limits} now={now} />;
          case 'notopened':
            return <MoneyList client={client} table filters invoice load={() => sentNotOpened(client, now())} empty="Every emailed invoice was opened." testID="notopened" header={invoiceTotal} />;
          case 'timesheets':
            return <TimeSheets client={client} now={now} />;
        }
      }}
    />
  );
}

type Top = 'money' | 'people' | 'customers';
const TOPS: { label: string; value: Top }[] = [
  { label: 'Money', value: 'money' },
  { label: 'People', value: 'people' },
  { label: 'Customers', value: 'customers' },
];

/** The Office front page: four tabs. Money opens on dollar tiles and what to do next. */
function OfficeFront({ client, open, owner, now, groups }: { client: OdooClient; open: (id: OfficeTab) => void; owner: boolean; now: () => number; groups: MenuGroup<OfficeTab>[] }) {
  const styles = useStyles();
  const [top, setTop] = useState<Top>('money');
  const pick = (title: string) => groups.filter((g) => g.title === title);
  return (
    <View style={styles.stack} testID="office-front">
      <ChipRow options={TOPS} value={top} onChange={setTop} fit compact testID="office-top" />
      {top === 'money' ? <MoneyFront client={client} open={open} now={now} groups={groups} /> : null}
      {top === 'people' ? <PeopleFront client={client} owner={owner} now={now} onOpen={open} /> : null}
      {top === 'customers' ? <SectionMenu groups={pick('Customers')} onPick={open} testID="office-customers" rowTestID={(id) => `office-tab-${id}`} /> : null}
    </View>
  );
}

/** Dollar tiles, search, "Do next", and the money lists with their dollars. */
function MoneyFront({ client, open, now, groups, home }: { client: OdooClient; open: (id: OfficeTab) => void; now: () => number; groups: MenuGroup<OfficeTab>[]; /** On Home: no search box and no list of pages, just the tiles and Do next. */ home?: boolean }) {
  const styles = useStyles();
  const limits = useLimits();
  const [term, setTerm] = useState('');
  const board = usePageRows(async () => {
    const [overdue, toInvoice, quotes, unpaid] = await Promise.all([overdueInvoices(client, limits, now()), ordersToInvoice(client, limits, now()), quotesWaiting(client, now()), unpaidInvoices(client, now())]);
    return { overdue, toInvoice, quotes, unpaid };
  }, [client]);
  const b = board.data;
  const next = useMemo(() => (b ? doNext(b.overdue, b.toInvoice) : null), [b]);
  const found = useMemo(() => {
    if (!b || !term.trim()) return null;
    const seen = new Set<string>();
    const all = [...b.unpaid, ...b.toInvoice, ...b.quotes].filter((r) => (seen.has(`${r.model}-${r.id}`) ? false : (seen.add(`${r.model}-${r.id}`), true)));
    return searchRows(all, term);
  }, [b, term]);
  const detail = (id: OfficeTab): string | undefined => {
    if (!b) return undefined;
    const rows = { overdue: b.overdue, notinvoiced: b.toInvoice, quotes: b.quotes, unpaid: b.unpaid }[id as 'overdue'];
    return rows ? `${formatMoney(sumCents(rows))} · ${rows.length}` : undefined;
  };
  const money = groups.filter((g) => g.title === 'Needs you now' || g.title === 'Money in').flatMap((g) => g.items);
  const moneyMenu: MenuGroup<OfficeTab>[] = [{ title: 'Money lists', items: money.map((i) => ({ ...i, detail: detail(i.id) ?? i.detail })) }];
  return (
    <View style={styles.stack}>
      {home ? null : <TextInput value={term} onChangeText={setTerm} accessibilityLabel="Search customer, invoice or job" placeholder="Search customer or invoice number" placeholderTextColor={colors.muted} testID="office-search" style={styles.search} />}
      {b ? (
        <View style={styles.tiles}>
          <Tile big={formatMoney(sumCents(b.overdue))} small={`Overdue · ${b.overdue.length}`} red={b.overdue.length > 0} testID="tile-overdue" />
          <Tile big={formatMoney(sumCents(b.toInvoice))} small={`To invoice · ${b.toInvoice.length}`} testID="tile-toinvoice" />
          <Tile big={formatMoney(sumCents(b.quotes))} small={`Quotes out · ${b.quotes.length}`} testID="tile-quotes" />
        </View>
      ) : board.error ? <Note>Odoo wouldn't show the totals: {board.error}</Note> : <Note>Reading Odoo…</Note>}
      {found ? (
        <MoneyResults client={client} rows={found} reload={board.reload} title="Search results" empty="Nothing matches." testID="office-found" />
      ) : (
        <>
          {next && next.length ? <MoneyResults client={client} rows={next} reload={board.reload} title="Do next" empty="" testID="office-donext" /> : b ? <Note testID="office-donext-empty">Nothing needs doing right now.</Note> : null}
          {home ? null : <SectionMenu groups={moneyMenu} onPick={open} testID="office-money" rowTestID={(id) => `office-tab-${id}`} />}
        </>
      )}
    </View>
  );
}

function MoneyResults({ client, rows, reload, title, empty, testID }: { client: OdooClient; rows: import('../lib/odooOffice').MoneyRow[]; reload: () => void; title: string; empty: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <Text style={styles.heading}>{title}</Text>
      <MoneyList client={client} rows={rows} onChanged={reload} empty={empty} testID={testID} table />
    </View>
  );
}

function Tile({ big, small, red, testID }: { big: string; small: string; red?: boolean; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={[styles.big, red && { color: colors.stop }]}>{big}</Text>
      <Text style={styles.small}>{small}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(10) },
  tiles: { flexDirection: 'row', gap: sp(8) },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: sp(10), gap: sp(2) },
  big: { fontSize: fs(20), fontWeight: '800', color: colors.text },
  small: { fontSize: fs(12), fontWeight: '600', color: colors.muted },
  heading: { fontSize: fs(13), fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', paddingHorizontal: sp(4) },
  search: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: sp(12), fontSize: fs(16), color: colors.text },
  link: { fontSize: fs(16), fontWeight: '800', color: colors.selected, paddingVertical: sp(8) },
}));

/**
 * Home for the Office theme: the same dollar tiles and Do next list as the Office Money tab,
 * read from Odoo. Nothing shows for someone without Office access or when not signed in.
 */
export function OfficeHome({ client, now = Date.now }: { client: OdooClient | null; now?: () => number }) {
  const styles = useStyles();
  const { access } = useDepartments();
  if (!client || !(access.office || access.owner)) return null;
  return (
    <View style={styles.stack} testID="office-home">
      <MoneyFront client={client} home now={now} groups={[]} open={(tab) => router.push({ pathname: '/office', params: { tab } })} />
      <Text onPress={() => router.push('/office')} accessibilityRole="button" testID="office-home-open" style={styles.link}>Open Office  ›</Text>
    </View>
  );
}

/** The office-only bar's Home: signs in through the same checks, then the money board. */
export function OfficeHomePage() {
  const { client } = useOdoo();
  if (!client) return <Note testID="office-home-signin">Sign in to Odoo to see the money board.</Note>;
  return <OfficeHome client={client} />;
}
