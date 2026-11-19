import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Action } from '../components/Buttons';
import { Card, dateText, Message, Meta, Note, TextBox, Title, useRun } from '../components/Dept';
import { PageError, RowItem, RowList, usePageRows } from '../components/DeptRows';
import type { DeptLimits } from '../lib/deptLimits';
import { invoiceLabel, PAY_LABEL } from '../lib/invoices';
import type { OdooClient } from '../lib/odoo';
import { closedWithoutOrder, readTerms, saveTerms, Terms } from '../lib/odooOffice';
import { formatMoney } from '../lib/prices';
import { usePendingItems } from '../lib/usePending';
import { sp } from '../theme';

/**
 * Payments taken on this phone that Odoo has not recorded yet. They go to Odoo on their own
 * once the phone has signal; this page only shows them, and opens the invoice, where Send is.
 * Another person's phone is not listed here: a payment is on the phone it was taken on.
 */
export function PaymentsToRecord() {
  const items = usePendingItems();
  const rows: RowItem[] = items.payments.map(({ invoice: i }) => {
    const unsent = i.payments.filter((p) => !(i.odoo?.sentPayments ?? []).includes(p.id));
    return {
      key: `pay-${i.id}`,
      title: i.billTo,
      sub: `${invoiceLabel(i)} · ${formatMoney(unsent.reduce((n, p) => n + p.amount, 0))}`,
      lines: unsent.map((p) => `${PAY_LABEL[p.method]} ${formatMoney(p.amount)}`),
      actions: [{ label: 'Open invoice', primary: true, onPress: () => router.push({ pathname: '/invoice/[id]', params: { id: i.id } }) }],
    };
  });
  return (
    <View style={{ gap: sp(10) }}>
      <Note>Cash and checks taken on this phone that are not in Odoo yet. They go on their own when the phone has signal. Payments taken on another phone show on that phone.</Note>
      <RowList rows={rows} empty="Every payment taken on this phone is in Odoo." testID="payments" />
    </View>
  );
}

/** Jobs closed with no sales order at all: something to check that they were billed. */
export function ClosedNoOrder({ client, limits, now = Date.now }: { client: OdooClient; limits: DeptLimits; now?: () => number }) {
  const { data, error } = usePageRows(() => closedWithoutOrder(client, limits, now()), [client]);
  if (error) return <PageError what="Closed jobs" error={error} />;
  const rows: RowItem[] | null = data?.map((j) => ({ key: `noorder-${j.id}`, title: j.place || j.name, sub: j.name, lines: [`Closed ${j.at ? dateText(j.at) : ''}${j.tech ? ` · ${j.tech}` : ''}`.trim(), 'No sales order in Odoo for this job.'] })) ?? null;
  return (
    <View style={{ gap: sp(10) }}>
      <Note>Jobs closed in the last {limits.invoiceLookbackDays} days with no sales order in Odoo. Some may have been billed another way; this is a list to check, not a count.</Note>
      <RowList rows={rows} empty="Every closed job has an order." testID="noorder" />
    </View>
  );
}

/** The wording at the bottom of a quote: plain text saved on the Odoo company. */
export function TermsPage({ client }: { client: OdooClient }) {
  const [terms, setTerms] = useState<Terms | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const { busy, msg, run } = useRun();
  useEffect(() => {
    let alive = true;
    readTerms(client).then(
      (t) => {
        if (!alive) return;
        setTerms(t);
        setText(t.text);
      },
      (e) => alive && setErr(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [client]);
  if (err) return <PageError what="Terms and Conditions" error={err} />;
  if (!terms) return <Note>Reading from Odoo...</Note>;
  if (terms.type === 'html') {
    return (
      <Card testID="terms-html">
        <Title>Your terms are a web page</Title>
        <Meta>Odoo is set to show a link to your website's terms page, so quotes carry that link. Change the page in Odoo's Website app; there is no text to edit here.</Meta>
      </Card>
    );
  }
  return (
    <View style={{ gap: sp(10) }} testID="terms">
      <Note>This is added to a quote when the Terms switch on the ticket is on. Saved to the company in Odoo; every phone uses it.</Note>
      <Message msg={msg} />
      <TextBox value={text} onChange={setText} label="Terms and Conditions" testID="terms-text" />
      <Action
        label="Save to Odoo"
        primary
        disabled={busy !== null || text === terms.text}
        testID="terms-save"
        onPress={() =>
          run('terms', async () => {
            await saveTerms(client, text);
            setTerms({ ...terms, text: text.trim() });
            return 'Saved. Odoo has the new terms.';
          })
        }
      />
    </View>
  );
}
