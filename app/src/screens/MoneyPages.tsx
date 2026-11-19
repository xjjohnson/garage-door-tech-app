import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { Action } from '../components/Buttons';
import { Card, Message, Meta, Note, NumBox, Row, TextBox, Title, toCents, useRun } from '../components/Dept';
import { ChipRow } from '../components/controls';
import { PageError, RowItem, RowList, usePageRows } from '../components/DeptRows';
import { callLink, quoteText, reminderText, textLink } from '../lib/deptActions';
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
export function MoneyList({ client, load, empty, invoice, lost, header, testID }: { client: OdooClient; load: () => Promise<MoneyRow[]>; empty: string; invoice: boolean; lost?: boolean; header?: (rows: MoneyRow[]) => string; testID: string }) {
  const { data, error, reload } = usePageRows(load, [client]);
  const { business } = useInvoices();
  const [mode, setMode] = useState<Mode>(null);
  const { busy, msg, run } = useRun();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('check');
  const [ref, setRef] = useState('');

  const open = (r: MoneyRow) => router.push({ pathname: '/odoo-record/[kind]/[id]', params: { kind: r.model === 'account.move' ? 'invoices' : 'quotations', id: String(r.id) } });
  const text = (r: MoneyRow) => {
    const link = textLink(r.phone, invoice ? reminderText(r, business.name) : quoteText(r, business.name));
    if (link) Linking.openURL(link).catch(() => undefined);
  };
  const call = (r: MoneyRow) => {
    const link = callLink(r.phone);
    if (link) Linking.openURL(link).catch(() => undefined);
  };

  const rows: RowItem[] | null = useMemo(
    () =>
      data?.map((r) => ({
        key: `${r.model}-${r.id}`,
        title: r.customer || r.name,
        sub: [r.name, formatMoney(r.cents) + (invoice ? ' owed' : ''), r.ref].filter(Boolean).join(' · '),
        ...(invoice && r.days > 0 ? { bad: r.text } : { lines: [r.text] }),
        actions: [
          ...(invoice ? [{ label: 'Record payment', primary: true, onPress: () => { setMode({ kind: 'pay', row: r }); setAmount((r.cents / 100).toFixed(2)); setRef(''); } }] : []),
          { label: 'Open', primary: !invoice, onPress: () => open(r) },
          { label: 'Email again', onPress: () => void run('prep', async () => { const to = await partnerEmail(client, r.partnerId); setMode({ kind: 'email', row: r, to }); return { text: '' }; }) },
          ...(r.phone && textLink(r.phone, 'x') ? [{ label: 'Text', onPress: () => text(r) }] : []),
          ...(r.phone && callLink(r.phone) ? [{ label: 'Call', onPress: () => call(r) }] : []),
          ...(lost ? [{ label: 'Mark lost', onPress: () => setMode({ kind: 'lost', row: r }) }] : []),
        ],
      })) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, business.name],
  );
  if (error) return <PageError what="This list" error={error} />;

  const total = data && header ? header(data) : '';
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
      <RowList rows={rows} empty={empty} testID={testID} header={total ? <Note testID={`${testID}-total`}>{total}</Note> : undefined} />
    </View>
  );
}

/** "Total overdue $2,840 · 3 invoices" for the top of an invoice list. */
export const invoiceTotal = (rows: MoneyRow[]) => (rows.length ? `${formatMoney(rows.reduce((n, r) => n + r.cents, 0))} across ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}` : '');
