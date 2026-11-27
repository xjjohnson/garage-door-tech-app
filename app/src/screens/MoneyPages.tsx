import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { Action } from '../components/Buttons';
import { Card, Message, Meta, Note, NumBox, Row, TextBox, Title, toCents, useRun } from '../components/Dept';
import { ChipRow } from '../components/controls';
import { PageError, RowItem, RowList, usePageRows } from '../components/DeptRows';
import { callLink, quoteText, reminderText, textLink } from '../lib/deptActions';
import { Age, AGE_LABEL, AGES, ageTotals, inAge, searchRows } from '../lib/officeBoard';
import { PAY_LABEL, PAY_METHODS, PayMethod } from '../lib/invoices';
import type { OdooClient } from '../lib/odoo';
import { LOST_REASONS, markLost, MoneyRow } from '../lib/odooOffice';
import { emailRecord, partnerEmail } from '../lib/odooReports';
import { sendPayments } from '../lib/odooSales';
import { formatMoney } from '../lib/prices';
import { useInvoices } from '../lib/useInvoices';
import { sp } from '../theme';

type Mode = { kind: 'pay'; row: MoneyRow } | { kind: 'email'; row: MoneyRow; to: string } | { kind: 'lost'; row: MoneyRow } | null;

/**
 * A list of invoices or quotes with the buttons that apply: Open, Record payment, Email again
 * (shows who it goes to first), Text (opens the phone's messages), Call, and Mark lost for
 * quotes. Every Odoo write waits for a second press on a panel that shows what will change.
 */
export function MoneyList({ client, load, rows: preRows, onChanged, empty, invoice, lost, header, filters, table, testID }: { client: OdooClient; load?: () => Promise<MoneyRow[]>; /** Rows the page above already read. */ rows?: MoneyRow[] | null; /** Called after a write so the page above reads again. */ onChanged?: () => void; empty: string; /** Left out: each row is judged by what it is (an invoice or a quote). */ invoice?: boolean; lost?: boolean; header?: (rows: MoneyRow[]) => string; /** Age chips with dollars (invoice lists) and a search box. */ filters?: boolean; /** The tight desk table (tap a row for its buttons). */ table?: boolean; testID: string }) {
  const own = usePageRows(load ?? (async () => [] as MoneyRow[]), [client]);
  const data = preRows !== undefined ? preRows : own.data;
  const error = preRows !== undefined ? null : own.error;
  const reload = () => {
    own.reload();
    onChanged?.();
  };
  const [age, setAge] = useState<Age>('all');
  const [term, setTerm] = useState('');
  const isInvoice = (r: MoneyRow) => invoice ?? r.model === 'account.move';
  const { business } = useInvoices();
  const [mode, setMode] = useState<Mode>(null);
  const { busy, msg, run } = useRun();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('check');
  const [ref, setRef] = useState('');

  const open = (r: MoneyRow) => router.push({ pathname: '/odoo-record/[kind]/[id]', params: { kind: r.model === 'account.move' ? 'invoices' : 'quotations', id: String(r.id) } });
  const text = (r: MoneyRow) => {
    const link = textLink(r.phone, isInvoice(r) ? reminderText(r, business.name) : quoteText(r, business.name));
    if (link) Linking.openURL(link).catch(() => undefined);
  };
  const call = (r: MoneyRow) => {
    const link = callLink(r.phone);
    if (link) Linking.openURL(link).catch(() => undefined);
  };

  const shown = useMemo(() => (data ? searchRows(filters ? inAge(data, age) : data, filters ? term : '') : null), [data, age, term, filters]);
  const rows: RowItem[] | null = useMemo(
    () =>
      shown?.map((r) => {
        const inv = isInvoice(r);
        return {
          key: `${r.model}-${r.id}`,
          title: r.customer || r.name,
          sub: table ? r.name : [r.name, r.ref].filter(Boolean).join(' · '),
          amount: formatMoney(r.cents),
          ...(table ? { age: r.text } : {}),
          ...(inv && r.days > 0 && table ? { bad: r.text } : table ? { lines: r.ref ? [r.ref] : [] } : inv ? {} : { lines: [r.text] }),
          actions: [
            ...(inv ? [{ label: 'Record payment', primary: true, onPress: () => { setMode({ kind: 'pay', row: r }); setAmount((r.cents / 100).toFixed(2)); setRef(''); } }] : []),
            { label: 'Open', primary: !inv, onPress: () => open(r) },
            { label: 'Email again', onPress: () => void run('prep', async () => { const to = await partnerEmail(client, r.partnerId); setMode({ kind: 'email', row: r, to }); return { text: '' }; }) },
            ...(r.phone && textLink(r.phone, 'x') ? [{ label: 'Text', onPress: () => text(r) }] : []),
            ...(r.phone && callLink(r.phone) ? [{ label: 'Call', onPress: () => call(r) }] : []),
            ...(lost ? [{ label: 'Mark lost', onPress: () => setMode({ kind: 'lost', row: r }) }] : []),
          ],
        };
      }) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, business.name],
  );
  if (error) return <PageError what="This list" error={error} />;

  const total = data && header && !filters ? header(data) : '';
  const totals = data ? ageTotals(data) : null;
  return (
    <View style={{ gap: sp(10) }}>
      <Message msg={msg} />
      {mode?.kind === 'pay' ? (
        <Card warn testID="pay-panel">
          <Title>Record a payment on {mode.row.name}</Title>
          <Meta>{mode.row.customer} · {formatMoney(mode.row.cents)} owed. Nothing is saved until you press Record.</Meta>
          <ChipRow options={PAY_METHODS.map((m) => ({ label: PAY_LABEL[m], value: m }))} value={method} onChange={(v) => setMethod(v as PayMethod)} testID="pay-method" />
          <Row>
            <NumBox value={amount} onChange={setAmount} label="Amount" testID="pay-amount" />
            <TextBox value={ref} onChange={setRef} label="Check number or note" testID="pay-ref" />
          </Row>
          <Row>
            <Action
              label={`Record ${toCents(amount) !== null ? formatMoney(toCents(amount)!) : ''} ${PAY_LABEL[method]}`}
              primary
              disabled={busy !== null || !(toCents(amount) && toCents(amount)! > 0)}
              testID="pay-record"
              onPress={() =>
                run('pay', async () => {
                  const cents = toCents(amount)!;
                  await sendPayments(client, mode.row.id, [{ id: `office-${Date.now()}`, method, amount: cents, at: Date.now(), reference: ref.trim() }], (m) => PAY_LABEL[m]);
                  setMode(null);
                  reload();
                  return `Recorded ${formatMoney(cents)} ${PAY_LABEL[method]} on ${mode.row.name} in Odoo.`;
                })
              }
            />
            <Action label="Cancel" onPress={() => setMode(null)} />
          </Row>
        </Card>
      ) : null}
      {mode?.kind === 'email' ? (
        <Card warn testID="email-panel">
          <Title>Email {mode.row.name} again?</Title>
          <Meta>Odoo's own email goes to {mode.to}. Nothing is sent until you press Send.</Meta>
          <Row>
            <Action
              label="Send"
              primary
              disabled={busy !== null}
              testID="email-send"
              onPress={() =>
                run('email', async () => {
                  const r = await emailRecord(client, mode.row.model, mode.row.id, mode.row.partnerId);
                  setMode(null);
                  return r.state === 'failed' ? { text: `Odoo could not send it to ${mode.to}.`, bad: true } : `Emailed ${mode.row.name} to ${mode.to}.`;
                })
              }
            />
            <Action label="Cancel" onPress={() => setMode(null)} />
          </Row>
        </Card>
      ) : null}
      {mode?.kind === 'lost' ? (
        <Card warn testID="lost-panel">
          <Title>Why was {mode.row.name} lost?</Title>
          <Meta>This cancels the quote in Odoo and writes the reason in its notes. Pick one to confirm.</Meta>
          <Row>
            {LOST_REASONS.map((reason) => (
              <Action
                key={reason}
                label={reason}
                disabled={busy !== null}
                testID={`lost-${reason.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                onPress={() =>
                  run('lost', async () => {
                    await markLost(client, mode.row.id, reason);
                    setMode(null);
                    reload();
                    return `${mode.row.name} marked lost: ${reason}.`;
                  })
                }
              />
            ))}
            <Action label="Cancel" onPress={() => setMode(null)} />
          </Row>
        </Card>
      ) : null}
      {filters && totals ? (
        <View style={{ gap: sp(8) }}>
          <TextBox value={term} onChange={setTerm} label="Search customer or number" testID={`${testID}-search`} />
          {invoice === true ? <ChipRow options={AGES.filter((a) => a === 'all' || totals[a].count > 0).map((a) => ({ label: `${AGE_LABEL[a]} ${formatMoney(totals[a].cents)}`, value: a }))} value={age} onChange={setAge} compact scroll testID={`${testID}-age`} /> : null}
        </View>
      ) : null}
      <RowList table={table} rows={rows} empty={empty} testID={testID} header={total ? <Note testID={`${testID}-total`}>{total}</Note> : undefined} />
    </View>
  );
}

/** "Total overdue $2,840 · 3 invoices" for the top of an invoice list. */
export const invoiceTotal = (rows: MoneyRow[]) => (rows.length ? `${formatMoney(rows.reduce((n, r) => n + r.cents, 0))} across ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}` : '');
