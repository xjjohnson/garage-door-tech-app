/**
 * The Sales theme's own screens (Home, Quotes, Invoices): desk tables with the dollars and the
 * age of each row up front, and a few big buttons. Every number is read from Odoo; the row
 * buttons are the ones the Sales area already has (Call, Text, Email again, Mark lost, Record
 * payment), each behind its own confirm step. Nothing is kept on the phone.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { Note } from '../components/Dept';
import { usePageRows } from '../components/DeptRows';
import { ChipRow } from '../components/controls';
import { overdueInvoices, quotesQuiet, quotesWaiting, unpaidInvoices, wonThisMonth } from '../lib/odooOffice';
import { formatMoney } from '../lib/prices';
import { useLimits } from '../lib/useLimits';
import { useOdoo } from '../lib/useOdoo';
import { Lost } from './SalesAreaScreen';
import { invoiceTotal, MoneyList } from './MoneyPages';
import { colors, fs, radius, sp } from '../theme';

const total = (rows: { cents: number }[]) => rows.reduce((n, r) => n + r.cents, 0);

function Signin({ what }: { what: string }) {
  return <Note testID="sales-desk-signin">Sign in to Odoo to see {what}. Everything here is read from Odoo.</Note>;
}

function Kpi({ value, label, bad, testID }: { value: string; label: string; bad?: boolean; testID?: string }) {
  return (
    <View style={styles.kpi} testID={testID}>
      <Text style={[styles.kpiValue, bad && styles.bad]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

/** Home for a salesperson: open quotes, what went quiet, what was won, two buttons, and the quotes to chase. */
export function SalesHome({ now = Date.now }: { now?: () => number }) {
  const { client } = useOdoo();
  const limits = useLimits();
  const { data } = usePageRows(async () => {
    if (!client) return null;
    const [open, quiet, won] = await Promise.all([quotesWaiting(client, now()), quotesQuiet(client, limits, now()), wonThisMonth(client, now())]);
    return { open, quiet, won };
  }, [client, limits.quoteQuietDays]);
  if (!client) return <Signin what="your quotes" />;
  return (
    <View style={styles.stack} testID="sales-home">
      <View style={styles.kpis}>
        <Kpi value={data ? formatMoney(total(data.open)) : '…'} label={`Open${data ? ` · ${data.open.length}` : ''}`} testID="sales-kpi-open" />
        <Kpi value={data ? String(data.quiet.length) : '…'} label="Quiet" bad={!!data?.quiet.length} testID="sales-kpi-quiet" />
        <Kpi value={data ? formatMoney(total(data.won)) : '…'} label="Won this month" testID="sales-kpi-won" />
      </View>
      <View style={styles.buttons}>
        <View style={styles.grow}>
          <Action label="+ New job" primary onPress={() => router.push('/new-job')} testID="sales-new-job" />
        </View>
        <View style={styles.grow}>
          <Action label="Request parts" onPress={() => router.push('/request-parts')} testID="sales-request-parts" />
        </View>
      </View>
      <Text style={styles.head}>QUOTES TO CHASE</Text>
      <MoneyList client={client} invoice={false} lost table load={() => quotesQuiet(client, limits, now())} empty="No quote has gone quiet." testID="sales-home-quiet" />
    </View>
  );
}

type QuoteView = 'quiet' | 'open' | 'won' | 'lost';
const QUOTE_VIEWS: { label: string; value: QuoteView }[] = [
  { label: 'Quiet', value: 'quiet' },
  { label: 'Open', value: 'open' },
  { label: 'Won', value: 'won' },
  { label: 'Lost', value: 'lost' },
];

/** Quotes: quiet, open, won this month and lost, each a table. Tap a row for Call, Text, Email again, Mark lost. */
export function SalesQuotes({ now = Date.now }: { now?: () => number }) {
  const { client } = useOdoo();
  const limits = useLimits();
  const [view, setView] = useState<QuoteView>('quiet');
  if (!client) return <Signin what="your quotes" />;
  return (
    <View style={styles.stack} testID="sales-quotes">
      <ChipRow options={QUOTE_VIEWS} value={view} onChange={(v) => setView(v as QuoteView)} testID="sales-quote-view" />
      {view === 'quiet' ? <MoneyList key="q" client={client} invoice={false} lost table load={() => quotesQuiet(client, limits, now())} empty="No quote has gone quiet." testID="sales-quotes-quiet" /> : null}
      {view === 'open' ? <MoneyList key="o" client={client} invoice={false} lost table load={() => quotesWaiting(client, now())} empty="No quote is waiting." testID="sales-quotes-open" /> : null}
      {view === 'won' ? <MoneyList key="w" client={client} invoice={false} table load={() => wonThisMonth(client, now())} empty="No quote has been approved this month yet." testID="sales-quotes-won" header={(rows) => `${formatMoney(total(rows))} won this month`} /> : null}
      {view === 'lost' ? <Lost client={client} /> : null}
    </View>
  );
}

type InvoiceView = 'unpaid' | 'overdue';
const INVOICE_VIEWS: { label: string; value: InvoiceView }[] = [
  { label: 'Unpaid', value: 'unpaid' },
  { label: 'Overdue', value: 'overdue' },
];

/** Invoices: everything still owed, or only what is late. Tap a row for Record payment, Email again, Open, Call. */
export function SalesInvoices({ now = Date.now }: { now?: () => number }) {
  const { client } = useOdoo();
  const limits = useLimits();
  const [view, setView] = useState<InvoiceView>('unpaid');
  if (!client) return <Signin what="your invoices" />;
  return (
    <View style={styles.stack} testID="sales-invoices">
      <ChipRow options={INVOICE_VIEWS} value={view} onChange={(v) => setView(v as InvoiceView)} testID="sales-invoice-view" />
      {view === 'unpaid' ? <MoneyList key="u" client={client} invoice table load={() => unpaidInvoices(client, now())} empty="Nothing is owed." testID="sales-invoices-unpaid" header={invoiceTotal} /> : null}
      {view === 'overdue' ? <MoneyList key="d" client={client} invoice table load={() => overdueInvoices(client, limits, now())} empty="No invoice is late." testID="sales-invoices-overdue" header={invoiceTotal} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(10) },
  kpis: { flexDirection: 'row', gap: sp(8) },
  kpi: { flex: 1, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, paddingVertical: sp(10), paddingHorizontal: sp(6), alignItems: 'center' },
  kpiValue: { fontSize: fs(22), fontWeight: '800', color: colors.text },
  kpiLabel: { fontSize: fs(12), color: colors.muted, textAlign: 'center' },
  bad: { color: colors.stop },
  buttons: { flexDirection: 'row', gap: sp(8) },
  grow: { flex: 1 },
  head: { fontSize: fs(12), fontWeight: '800', letterSpacing: 1, color: colors.muted, marginTop: sp(4) },
});
