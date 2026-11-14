import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppForeground } from '../lib/useAppForeground';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Invoice, invoiceNo, invoiceRef, PAY_LABEL } from '../lib/invoices';
import { log } from '../lib/log';
import { onSyncNow } from '../lib/syncNow';
import { EmailResult, emailedText, emailInvoice, partnerEmail, PdfFile } from '../lib/odooReports';
import { pdfName, signedPageHtml } from '../lib/pdf';
import { Signature, signatureFor } from '../lib/attachments';
import { formatJobDate } from '../lib/jobs';
import { beforeAfterReportHtml, inspectionReportHtml } from '../lib/reportFiles';
import { useAttachments } from '../lib/useAttachments';
import { Job } from '../lib/jobs';
import { OdooClient, OdooError } from '../lib/odoo';
import { confirmOrderFor, DELETED_IN_ODOO, InvoiceGone, OdooInvoiceState, odooPaymentLabel, OdooRef, orderRef, readInvoice, sendInvoice, sendOrder, sendOrderSignature, sendPayments, sendSignature, voidInvoice, voidNote } from '../lib/odooSales';
import { signaturePng } from '../lib/signaturePng';
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
export function usePartner() {
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

export function useSalesOdoo() {
  const { status, client } = useOdoo();
  return status === 'signedIn' && client && client.session.apps.sales && client.session.apps.products ? client : null;
}

/** On a quote, once the customer picked an option: send it to Odoo as a confirmed sales order. */
export function OdooQuoteSend({ job, option, signature }: { job: Job; option: QuoteOption; signature?: Signature }) {
  const client = useSalesOdoo();
  const partner = usePartner();
  const { sheet } = usePriceSheet();
  const { setOdooOrder, setQuoteSignatureSent } = useJobs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noField, setNoField] = useState(false);
  const order = job.odooOrder;
  // The customer's signature goes on the sales order in Odoo (its own signature fields), once per signature.
  const signPending = !!client && !!order && !!signature && job.quoteSignatureSent !== signature.id && !noField;
  useEffect(() => {
    if (!signPending || !client || !order || !signature) return;
    let live = true;
    sendOrderSignature(client, order.id, { name: signature.name, at: signature.at, png: signaturePng(signature) })
      .then((ok) => {
        if (!live) return;
        if (ok) setQuoteSignatureSent(job.id, signature.id);
        else setNoField(true);
      })
      .catch((e) => live && setError(`Couldn't save the signature in Odoo: ${message(e)}`));
    return () => {
      live = false;
    };
  }, [signPending, client, order, signature, job.id, setQuoteSignatureSent]);
  if (order) {
    return (
      <View style={styles.stack}>
        <Text style={styles.meta} testID="quote-odoo-order">
          In Odoo as sales order {order.name}.
          {signature && job.quoteSignatureSent === signature.id ? ' Signature saved on it.' : ''}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }
  if (!client) return null;
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const pid = await partner(client, job.customerId, { name: job.customer, phone: job.phone, address: job.address });
      setOdooOrder(job.id, await sendOrder(client, pid, option.lines, sheet.odoo, orderRef(option.title ?? TIER_LABEL[option.tier], job.ticket?.shipTo?.address || job.address), job.ticket?.shipTo?.id));
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

/**
 * Sending an invoice to Odoo: posts it the first time, registers payments
 * not sent yet, attaches the customer's signature page once, then reads back
 * what Odoo says is paid. Used by the invoice's Odoo box and by Finish job.
 */
/** Invoices being sent now, and what Odoo said once each was posted: shared by every screen. */
const inFlight = new Map<string, Promise<OdooInvoiceState>>();
const posted = new Map<string, OdooInvoiceState>();

export function useInvoiceOdoo(now: () => number = Date.now) {
  const { status, client } = useOdoo();
  const partner = usePartner();
  const { sheet } = usePriceSheet();
  const { jobs, setOdooOrder } = useJobs();
  const { setOdoo, setVoid, business } = useInvoices();
  const attachments = useAttachments();
  const online = status === 'signedIn' && client && client.session.apps.invoicing ? client : null;

  /** Attaches this signature (or the invoice's latest) to the invoice in Odoo, unless it's there already. */
  const attachSignature = async (c: OdooClient, invoice: Invoice, state: OdooInvoiceState, sig?: Signature): Promise<OdooInvoiceState> => {
    const s = sig ?? signatureFor(attachments, 'invoice', invoice.id);
    const media = attachments.media;
    if (!s || state.signatureSent === s.id || !media?.pdfBase64) return state;
    const pdf = await media.pdfBase64(signedPageHtml(invoice, state.name, business, s));
    await sendSignature(c, state.id, pdfName(`Signed ${state.name}`, invoice.billTo), pdf, `Signed by ${s.name || 'the customer'} on ${formatJobDate(s.at)}: work completed to their satisfaction.`);
    return { ...state, signatureSent: s.id };
  };

  /**
   * The sales order to tie the invoice to: the job's, or for a ticket
   * finished without one (offline, or Odoo refused a line), the ticket's
   * quotation given the invoice's lines and confirmed now.
   */
  const orderFor = async (c: OdooClient, invoice: Invoice, pid: number, job: Job | undefined, given?: OdooRef): Promise<OdooRef | undefined> => {
    if (given ?? job?.odooOrder) return given ?? job?.odooOrder;
    if (invoice.source !== 'ticket' || !job || !c.session.apps.sales) return undefined;
    try {
      const order = await confirmOrderFor(c, pid, invoice.lines, sheet.odoo, invoice.ref ?? '', job.ticket?.order, invoice.shipTo?.id);
      setOdooOrder(job.id, order);
      return order;
    } catch (e) {
      // The invoice still goes; it just isn't tied to an order.
      log.warn('odoo', `invoice ${invoice.number}: no sales order: ${message(e)}`);
      return undefined;
    }
  };

  const sendNow = async (c: OdooClient, invoice: Invoice, opts: { sig?: Signature; order?: OdooRef }): Promise<OdooInvoiceState> => {
    let state = invoice.odoo ?? posted.get(invoice.id);
    if (!state) {
      const job = jobs.find((j) => j.id === invoice.jobId);
      const pid = await partner(c, invoice.customerId ?? job?.customerId, { name: invoice.billTo, phone: job?.phone ?? '', address: invoice.address });
      const order = await orderFor(c, invoice, pid, job, opts.order);
      state = await sendInvoice(c, pid, invoice.lines, sheet.odoo, invoiceRef(invoice), order, invoice.shipTo?.id);
      // Kept straight away, so a failure below (or a second send from elsewhere) never posts it twice.
      posted.set(invoice.id, state);
      setOdoo(invoice.id, state);
    }
    if (invoice.voidedAt) {
      // Voided on the phone: undone in Odoo too (draft cancelled, or a credit note); nothing more is sent for it.
      if (state.voided) return state;
      const { voided, refund, refundPaid } = await voidInvoice(c, state.id, `Voided in the app (invoice ${invoiceRef(invoice)})`);
      const fresh = await readInvoice(c, state.id, state.sentPayments, now()).catch(() => state!);
      state = { ...fresh, ...(state.signatureSent ? { signatureSent: state.signatureSent } : {}), voided, ...(refund > 0 ? { refund } : {}), ...(refundPaid ? { refundPaid } : {}) };
      posted.set(invoice.id, state);
      setOdoo(invoice.id, state);
      return state;
    }
    const unsent = invoice.payments.filter((p) => !state!.sentPayments.includes(p.id));
    const sent = [...state.sentPayments];
    let signatureSent = state.signatureSent;
    try {
      sent.push(...(await sendPayments(c, state.id, unsent, (m) => PAY_LABEL[m])));
      signatureSent = (await attachSignature(c, invoice, state, opts.sig)).signatureSent;
    } finally {
      const fresh = await readInvoice(c, state.id, sent, now()).catch(() => ({ ...state!, sentPayments: sent }));
      state = { ...fresh, ...(signatureSent ? { signatureSent } : {}), ...(state.voided ? { voided: state.voided } : {}), ...(state.refund ? { refund: state.refund } : {}), ...(state.refundPaid ? { refundPaid: true } : {}) };
      posted.set(invoice.id, state);
      setOdoo(invoice.id, state);
    }
    return state;
  };

  /**
   * An invoice deleted in Odoo: the phone's copy is voided and marked as deleted there, so it
   * stops counting as owed and nothing more is sent or read for it.
   */
  const markGone = (invoice: Invoice): OdooInvoiceState | undefined => {
    const o = invoice.odoo ?? posted.get(invoice.id);
    if (!o) return undefined;
    if (!invoice.voidedAt) setVoid(invoice.id, true);
    const state = { ...o, voided: DELETED_IN_ODOO, checkedAt: now() };
    posted.set(invoice.id, state);
    setOdoo(invoice.id, state);
    log.warn('odoo', `invoice ${invoiceNo(invoice)} was deleted in Odoo, so it is voided on the phone`);
    return state;
  };

  const send = async (invoice: Invoice, opts: { sig?: Signature; order?: OdooRef } = {}): Promise<OdooInvoiceState | undefined> => {
    try {
      return await sendOnce(invoice, opts);
    } catch (e) {
      if (e instanceof InvoiceGone) return markGone(invoice) ?? Promise.reject(e);
      throw e;
    }
  };

  const sendOnce = async (invoice: Invoice, opts: { sig?: Signature; order?: OdooRef } = {}): Promise<OdooInvoiceState | undefined> => {
    if (!online) return undefined;
    // One send per invoice at a time: Finish job, the invoice screen and the background sync can all ask.
    const running = inFlight.get(invoice.id);
    if (running) {
      await running.catch(() => undefined);
      return sendNow(online, { ...invoice, odoo: posted.get(invoice.id) ?? invoice.odoo }, opts);
    }
    const p = sendNow(online, invoice, opts);
    inFlight.set(invoice.id, p);
    try {
      return await p;
    } finally {
      inFlight.delete(invoice.id);
    }
  };

  /** Reads what Odoo says about an invoice already there (paid, lines, totals), changing nothing in Odoo. */
  const refresh = async (invoice: Invoice): Promise<OdooInvoiceState | undefined> => {
    const o = invoice.odoo;
    if (!online || !o || inFlight.has(invoice.id)) return undefined;
    let fresh: OdooInvoiceState;
    try {
      fresh = await readInvoice(online, o.id, o.sentPayments, now());
    } catch (e) {
      if (e instanceof InvoiceGone) return markGone(invoice);
      throw e;
    }
    const state = { ...fresh, ...(o.signatureSent ? { signatureSent: o.signatureSent } : {}), ...(o.voided ? { voided: o.voided } : {}), ...(o.refund ? { refund: o.refund } : {}), ...(o.refundPaid ? { refundPaid: true } : {}) };
    posted.set(invoice.id, state);
    setOdoo(invoice.id, state);
    return state;
  };

  /** Whether this invoice still has something to send to Odoo. */
  const pending = (invoice: Invoice): boolean => {
    const o = invoice.odoo ?? posted.get(invoice.id);
    if (invoice.voidedAt) return !!o && !o.voided;
    if (!o) return true;
    const s = signatureFor(attachments, 'invoice', invoice.id);
    return invoice.payments.some((p) => !o.sentPayments.includes(p.id)) || (!!s && o.signatureSent !== s.id && !!attachments.media?.pdfBase64);
  };

  return { client: online, send, pending, refresh };
}

const WAITING = "Not in Odoo yet. It goes to Odoo on its own once the phone is signed in and has signal, and then Odoo's tax and total replace the phone's estimate.";

const SYNC_EVERY_MS = 3 * 60_000;
const SYNC_AFTER_CHANGE_MS = 4000;
/** An invoice Odoo refused isn't tried again for this long (the Send button still works). */
const SYNC_RETRY_MS = 10 * 60_000;
/** Invoices in Odoo are read again after this long, a few at a time, until paid. */
const REFRESH_MS = 10 * 60_000;
const REFRESH_BATCH = 10;
const DONE = ['paid', 'in_payment', 'reversed', 'invoicing_legacy'];

/**
 * Sends invoices made on the phone to Odoo in the background once there's
 * signal: an invoice made offline gets posted (tied to its sales order),
 * and payments and signatures taken offline follow. Only invoices made since
 * 0.5.17 go on their own; older ones keep their Send button. Renders nothing.
 */
export function OdooInvoicesSync({ now = Date.now }: { now?: () => number }) {
  const { invoices, loaded } = useInvoices();
  const jobsApi = useJobs();
  const { client, send, pending, refresh } = useInvoiceOdoo(now);
  const latest = useRef({ invoices, send, pending, refresh });
  latest.current = { invoices, send, pending, refresh };
  const running = useRef(false);
  const failed = useRef(new Map<string, number>());
  const online = !!client && loaded && jobsApi.loaded;

  const pass = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      // New invoices go on their own; so does a void of any invoice already in Odoo.
      const todo = latest.current.invoices.filter((i) => (i.autoSend || (i.voidedAt && i.odoo)) && latest.current.pending(i) && now() - (failed.current.get(i.id) ?? 0) > SYNC_RETRY_MS);
      for (const inv of todo) {
        // The newest copy: an earlier one in this pass may have changed it.
        const fresh = latest.current.invoices.find((i) => i.id === inv.id) ?? inv;
        try {
          await latest.current.send(fresh);
          log.info('odoo', `invoice ${fresh.number} synced`);
        } catch (e) {
          failed.current.set(inv.id, now());
          log.warn('odoo', `invoice ${fresh.number} not sent: ${message(e)}`);
        }
      }
      // What Odoo says now about invoices already there: paid in Odoo, changed lines.
      const t = now();
      const stale = latest.current.invoices
        .filter((i) => i.odoo && i.odoo.voided !== DELETED_IN_ODOO && !latest.current.pending(i) && (!DONE.includes(i.odoo.paymentState) || !i.odoo.lines) && t - i.odoo.checkedAt > REFRESH_MS)
        .slice(0, REFRESH_BATCH);
      for (const inv of stale) {
        try {
          await latest.current.refresh(inv);
        } catch (e) {
          log.warn('odoo', `invoice ${invoiceNo(inv)} not read: ${message(e)}`);
        }
      }
    } finally {
      running.current = false;
    }
  }, [now]);

  useEffect(() => {
    if (!online) return;
    pass();
    const t = setInterval(pass, SYNC_EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useEffect(() => {
    if (!online) return;
    const t = setTimeout(pass, SYNC_AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, pass, invoices]);

  useAppForeground(() => {
    if (online) pass();
  });

  // Sync now: send waiting invoices straight away, ones that failed lately too.
  useEffect(
    () =>
      online
        ? onSyncNow(() => {
            failed.current.clear();
            return pass();
          })
        : undefined,
    [online, pass],
  );

  return null;
}

/** On an invoice: send it to Odoo (posted, with the payments taken), then keep its paid status in step. */
export function OdooInvoiceSync({ invoice, now = Date.now }: { invoice: Invoice; warranty?: string; now?: () => number }) {
  const { status, client } = useOdoo();
  const { send: sendToOdoo } = useInvoiceOdoo(now);
  const partner = usePartner();
  const { jobs } = useJobs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailed, setEmailed] = useState<EmailResult | null>(null);
  /** Asked before anything is sent: who it goes to. */
  const [confirm, setConfirm] = useState<{ pid: number; email: string } | null>(null);
  const attachments = useAttachments();
  const { business } = useInvoices();
  const online = status === 'signedIn' && client && client.session.apps.invoicing;
  const job = jobs.find((j) => j.id === invoice.jobId);
  const media = attachments.media;
  const o = invoice.odoo;
  const hasPhotos = !!job && !!media?.pdfBase64 && attachments.photos.some((p) => p.jobId === job.id && (p.kind === 'before' || p.kind === 'after'));
  const withText = [job?.inspection && media?.pdfBase64 ? 'the inspection report' : '', hasPhotos ? 'the before and after photos' : ''].filter(Boolean).join(' and ');
  if (!o && invoice.voidedAt) return null;
  if (!o && !online) {
    return invoice.autoSend ? (
      <Text style={styles.meta} testID="invoice-odoo-waiting">
        {WAITING}
      </Text>
    ) : null;
  }

  const run = async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await sendToOdoo(invoice);
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
    if (!client || !o || !confirm) return;
    const { pid } = confirm;
    setConfirm(null);
    setBusy(true);
    try {
      // Odoo makes and attaches its own invoice PDF; the inspection report goes with it.
      const files: PdfFile[] = [];
      if (job?.inspection && media?.pdfBase64) {
        const html = await inspectionReportHtml(job, attachments, media, business, { reference: o.name, inspector: client.session.name || business.name });
        files.push({ name: pdfName('Inspection', invoice.billTo), base64: await media.pdfBase64(html) });
      }
      // Before and after photos from the job, when the phone has any.
      if (job && media?.pdfBase64) {
        const html = await beforeAfterReportHtml(job, attachments, media, business, { reference: o.name });
        if (html) files.push({ name: pdfName('Before and after photos', invoice.billTo), base64: await media.pdfBase64(html) });
      }
      const r = await emailInvoice(client, o.id, pid, files);
      setEmailed(r);
      log.info('odoo', `invoice ${o.name} email: ${r.state}${r.reason ? ` (${r.reason})` : ''}, ${files.length} extra file(s)`);
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
        <Text style={styles.meta} testID={invoice.autoSend ? 'invoice-odoo-waiting' : undefined}>
          {invoice.autoSend ? WAITING : 'Odoo keeps the books: sending posts this invoice there with the payments taken so far.'}
        </Text>
      )}
      {o && o.untaxed === undefined && o.total !== invoice.total ? <Text style={styles.meta}>Odoo’s total differs from this phone’s because Odoo adds its own taxes.</Text> : null}
      {invoice.voidedAt && o ? (
        <Text style={styles.meta} testID="invoice-odoo-void">
          {voidNote(o)}
        </Text>
      ) : null}
      {online && !o?.voided ? <Button label={busy ? 'Working...' : invoice.voidedAt ? 'Void it in Odoo now' : o ? 'Sync with Odoo' : 'Send to Odoo now'} disabled={busy} onPress={run} testID="invoice-odoo-send" /> : null}
      {online && o && !invoice.voidedAt ? (
        confirm ? (
          <View style={styles.stack} testID="invoice-odoo-email-confirm">
            <Text style={styles.detail}>
              Email {confirm.email} Odoo's invoice {o.name} ({formatMoney(o.total)}){withText ? `, with ${withText} attached` : ''}?
            </Text>
            <Button label={`Send to ${confirm.email}`} disabled={busy} onPress={email} testID="invoice-odoo-email-send" />
            <Button label="Cancel" onPress={() => setConfirm(null)} testID="invoice-odoo-email-cancel" />
          </View>
        ) : (
          <Button label={job?.inspection && media?.pdfBase64 ? `Email Odoo's invoice ${o.name} and the inspection report` : `Email Odoo's invoice ${o.name}`} disabled={busy} onPress={askEmail} testID="invoice-odoo-email" />
        )
      ) : null}
      {emailed ? (
        <Text style={emailed.state === 'failed' ? styles.error : styles.detail} testID="invoice-odoo-emailed">
          {emailedText(emailed)}
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
