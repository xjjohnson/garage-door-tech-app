import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { signatureFor } from '../lib/attachments';
import { Invoice, PAY_LABEL } from '../lib/invoices';
import { log } from '../lib/log';
import { emailCustomer, partnerEmail, PdfFile } from '../lib/odooReports';
import { escapeHtml, invoiceHtml, pdfName } from '../lib/pdf';
import { inspectionReportHtml } from '../lib/reportFiles';
import { useAttachments } from '../lib/useAttachments';
import { Job } from '../lib/jobs';
import { OdooClient, OdooError } from '../lib/odoo';
import { odooPaymentLabel, orderRef, readInvoice, sendInvoice, sendOrder, sendPayments } from '../lib/odooSales';
import { formatMoney, TIER_LABEL } from '../lib/prices';
import { QuoteOption } from '../lib/quote';
import { useCustomers } from '../lib/useCustomers';
import { useJobs } from '../lib/useJobs';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type } from '../theme';

const message = (e: unknown) => (e instanceof OdooError || e instanceof Error ? e.message : "Couldn't reach Odoo. Try again.");

/** The Odoo contact for a job's or invoice's customer, made in Odoo the first time. */
function usePartner() {
  const { customers, apply } = useCustomers();
  return async (client: OdooClient, customerId: string | undefined, fallback: { name: string; phone: string; address: string }): Promise<number> => {
    const c = customers.find((x) => x.id === customerId);
    if (c?.odooId) return c.odooId;
    const fields = c ?? { ...fallback, email: '', notes: '' };
    if (!fields.name.trim()) throw new Error('Give the customer a name first, so Odoo knows who it’s for.');
    const id = await client.createPartner(fields);
    if (c) apply((prev) => prev.map((x) => (x.id === c.id ? { ...x, odooId: id, syncedAt: x.updatedAt } : x)));
    return id;
  };
}

function useSalesOdoo() {
  const { status, client } = useOdoo();
  return status === 'signedIn' && client && client.session.apps.sales && client.session.apps.products ? client : null;
}

/** On a quote, once the customer picked an option: send it to Odoo as a confirmed sales order. */
export function OdooQuoteSend({ job, option }: { job: Job; option: QuoteOption }) {
  const client = useSalesOdoo();
  const partner = usePartner();
  const { sheet } = usePriceSheet();
  const { setOdooOrder } = useJobs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (job.odooOrder) {
    return (
      <Text style={styles.meta} testID="quote-odoo-order">
        In Odoo as sales order {job.odooOrder.name}.
      </Text>
    );
  }
  if (!client) return null;
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const pid = await partner(client, job.customerId, { name: job.customer, phone: job.phone, address: job.address });
      setOdooOrder(job.id, await sendOrder(client, pid, option.lines, sheet.odoo, orderRef(TIER_LABEL[option.tier], job.address)));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.stack}>
      <Button label={busy ? 'Sending...' : 'Send to Odoo as a sales order'} disabled={busy} onPress={send} testID="quote-odoo-send" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** On an invoice: send it to Odoo (posted, with the payments taken), then keep its paid status in step. */
export function OdooInvoiceSync({ invoice, warranty, now = Date.now }: { invoice: Invoice; warranty?: string; now?: () => number }) {
  const { status, client } = useOdoo();
  const partner = usePartner();
  const { sheet } = usePriceSheet();
  const { jobs } = useJobs();
  const { setOdoo } = useInvoices();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailed, setEmailed] = useState<string | null>(null);
  /** Asked before anything is sent: who it goes to. */
  const [confirm, setConfirm] = useState<{ pid: number; email: string } | null>(null);
  const attachments = useAttachments();
  const { business } = useInvoices();
  const online = status === 'signedIn' && client && client.session.apps.invoicing;
  const job = jobs.find((j) => j.id === invoice.jobId);
  const media = attachments.media;
  const o = invoice.odoo;
  if (!o && (!online || invoice.voidedAt)) return null;

  const run = async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      let state = o;
      if (!state) {
        const job = jobs.find((j) => j.id === invoice.jobId);
        const pid = await partner(client, invoice.customerId ?? job?.customerId, { name: invoice.billTo, phone: job?.phone ?? '', address: invoice.address });
        state = await sendInvoice(client, pid, invoice.lines, sheet.odoo, `Invoice ${invoice.number}`, job?.odooOrder);
        // Saved straight away, so a failure below never sends the invoice twice.
        setOdoo(invoice.id, state);
      }
      const unsent = invoice.payments.filter((p) => !state!.sentPayments.includes(p.id));
      const sent = [...state.sentPayments];
      try {
        sent.push(...(await sendPayments(client, state.id, unsent, (m) => PAY_LABEL[m])));
      } finally {
        setOdoo(invoice.id, await readInvoice(client, state.id, sent, now()).catch(() => ({ ...state!, sentPayments: sent })));
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const askEmail = async () => {
    if (!client || !o) return;
    setBusy(true);
    setError(null);
    setEmailed(null);
    try {
      const pid = await partner(client, invoice.customerId ?? job?.customerId, { name: invoice.billTo, phone: job?.phone ?? '', address: invoice.address });
      setConfirm({ pid, email: await partnerEmail(client, pid) });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const email = async () => {
    if (!client || !o || !media?.pdfBase64 || !confirm) return;
    const { pid } = confirm;
    setConfirm(null);
    setBusy(true);
    try {
      const files: PdfFile[] = [{ name: pdfName(`Invoice ${invoice.number}`, invoice.billTo), base64: await media.pdfBase64(invoiceHtml(invoice, business, signatureFor(attachments, 'invoice', invoice.id), { warranty })) }];
      if (job?.inspection) {
        const html = await inspectionReportHtml(job, attachments, media, business, { reference: o.name, inspector: client.session.name || business.name });
        files.push({ name: pdfName('Inspection', invoice.billTo), base64: await media.pdfBase64(html) });
      }
      const from = business.name.trim() || 'us';
      const body = `<p>Hi ${escapeHtml(invoice.billTo)},</p><p>Thank you for choosing ${escapeHtml(from)}. Your invoice ${escapeHtml(invoice.number)}${job?.inspection ? ' and the inspection report are' : ' is'} attached.</p>`;
      setEmailed(await emailCustomer(client, 'account.move', o.id, pid, files, body));
      log.info('odoo', `invoice ${invoice.number} emailed with ${files.length} file(s)`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const pending = o ? invoice.payments.filter((p) => !o.sentPayments.includes(p.id)).length : 0;
  return (
    <View style={styles.box} testID="invoice-odoo">
      {o ? (
        <Text style={styles.detail} testID="invoice-odoo-state">
          In Odoo as {o.name}: {odooPaymentLabel(o.paymentState)}
          {o.residual > 0 ? `, ${formatMoney(o.residual)} owed` : ''}. Odoo total {formatMoney(o.total)}.
          {pending ? ` ${pending} payment${pending === 1 ? '' : 's'} not in Odoo yet.` : ''}
        </Text>
      ) : (
        <Text style={styles.meta}>Odoo keeps the books: sending posts this invoice there with the payments taken so far.</Text>
      )}
      {o && o.total !== invoice.total ? <Text style={styles.meta}>Odoo’s total differs from this phone’s because Odoo adds its own taxes.</Text> : null}
      {invoice.voidedAt && o ? <Text style={styles.meta}>Voided on the phone; cancel it in Odoo with a credit note.</Text> : null}
      {online ? <Button label={busy ? 'Working...' : o ? 'Sync with Odoo' : 'Send to Odoo'} disabled={busy} onPress={run} testID="invoice-odoo-send" /> : null}
      {online && o && !invoice.voidedAt && media?.pdfBase64 ? (
        confirm ? (
          <View style={styles.stack} testID="invoice-odoo-email-confirm">
            <Text style={styles.detail}>
              Email {confirm.email} invoice {invoice.number} ({formatMoney(invoice.total)}){job?.inspection ? ' and the inspection report' : ''}?
            </Text>
            <Button label={`Send to ${confirm.email}`} disabled={busy} onPress={email} testID="invoice-odoo-email-send" />
            <Button label="Cancel" onPress={() => setConfirm(null)} testID="invoice-odoo-email-cancel" />
          </View>
        ) : (
          <Button label={job?.inspection ? 'Email the invoice and inspection report' : 'Email the invoice'} disabled={busy} onPress={askEmail} testID="invoice-odoo-email" />
        )
      ) : null}
      {emailed ? (
        <Text style={styles.detail} testID="invoice-odoo-emailed">
          Emailed to {emailed}.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Button({ label, onPress, disabled, testID }: { label: string; onPress: () => void; disabled?: boolean; testID: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} testID={testID} style={({ pressed }) => [styles.button, disabled && styles.off, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  box: { gap: 8, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.safety },
});
