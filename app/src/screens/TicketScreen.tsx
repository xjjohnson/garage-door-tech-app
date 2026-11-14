import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, NavRow } from '../components/Buttons';
import { EstimatesPanel } from '../components/EstimatesPanel';
import { ChipOption, ChipRow, MeasureField, SectionTitle, Segmented } from '../components/controls';
import { useInvoiceOdoo, usePartner, useSalesOdoo } from '../components/OdooSales';
import { Business, invoiceLabel, invoiceStatus, newId, PAY_LABEL, PAY_METHODS, payLinks, PayMethod } from '../lib/invoices';
import { QrCode } from '../components/QrCode';
import { awaitingPick, cancelDeclined, EstimateSet, openEstimates, pickEstimate } from '../lib/estimates';
import { acceptedLabel, Job, jobName } from '../lib/jobs';
import { log } from '../lib/log';
import { OdooError } from '../lib/odoo';
import { cents, formatMoney, priceText } from '../lib/prices';
import { addTyped, confirmTicket, currentTotals, EMPTY_TICKET, estimateTotals, LineKind, linesKey, lineTotal, newLineId, removeLine, setPrice, setQty, syncTicket, Ticket, TicketLine, ticketOption, ticketParts, ticketRef, depositTotal, Deposit, depositsKey, unaccountedParts, setDiscount } from '../lib/ticket';
import { discountKey, discountText, presetsFor } from '../lib/discounts';
import { DiscountPanel } from '../components/DiscountPanel';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useStock } from '../lib/useStock';
import { EmailResult, emailedText, emailRecord, partnerEmail } from '../lib/odooReports';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type } from '../theme';

const message = (e: unknown) => (e instanceof OdooError || e instanceof Error ? e.message : "Couldn't reach Odoo. Try again.");

/** Wait this long after the last change before asking Odoo for totals. */
const SYNC_DELAY_MS = 1500;

/**
 * A job's ticket: the services and materials for the job, added from the
 * price book or typed, changed any time. Odoo works out tax and the total
 * from a draft quotation; offline the phone shows its own estimate. Finish
 * job marks the work done, makes the invoice from the ticket, posts it in
 * Odoo and opens it for the customer to sign.
 */
export function TicketScreen({ job, now = Date.now }: { job: Job; now?: () => number }) {
  const { setTicket, setEstimates, setOdooOrder, setStep } = useJobs();
  const invoiceOdoo = useInvoiceOdoo(now);
  const { invoices, create, business } = useInvoices();
  const { sheet } = usePriceSheet();
  const client = useSalesOdoo();
  const partner = usePartner();
  const ticket = job.ticket ?? EMPTY_TICKET;
  const others = job.estimates ?? [];
  const estimateSet: EstimateSet = { ticket, others };
  const odooTotals = currentTotals(ticket);
  const shown = odooTotals ?? estimateTotals(ticket, sheet.taxPercent);
  const invoice = invoices.find((i) => i.jobId === job.id && invoiceStatus(i) !== 'void');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const stock = useStock();
  // Every ticket part has to be accounted for in Parts used before the invoice (Justin, 0.5.33).
  const missingParts = unaccountedParts(ticket, stock.items, job.id, stock.purchases);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState<{ pid: number; email: string } | null>(null);
  const [emailed, setEmailed] = useState<EmailResult | null>(null);
  const [emailing, setEmailing] = useState(false);
  const run = useRef(0);

  const sync = async (): Promise<Ticket | undefined> => {
    if (!client || (ticket.lines.length === 0 && !ticket.deposits?.length && !ticket.order)) return;
    const n = ++run.current;
    // The estimate being synced: its result is dropped if another estimate was opened meanwhile.
    const estId = ticket.id;
    setSyncing(true);
    setError(null);
    try {
      const pid = await partner(client, job.customerId, { name: job.customer, phone: job.phone, address: job.address });
      const r = await syncTicket(client, pid, ticket, ticketRef(ticket), now());
      if (n === run.current) setTicket(job.id, (t) => (t.id === estId ? { ...t, order: r.order, totals: r.totals, depositsSaved: r.depositsSaved } : t));
      return { ...ticket, order: r.order, totals: r.totals, depositsSaved: r.depositsSaved };
    } catch (e) {
      if (n === run.current) setError(message(e));
    } finally {
      if (n === run.current) setSyncing(false);
    }
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // The job's other open estimates are quotations in Odoo too: each is saved once it has lines.
  const staleOthers = client && !invoice ? openEstimates(others).filter((t) => t.id && t.lines.length > 0 && !currentTotals(t)) : [];
  const staleKey = staleOthers.map((t) => `${t.id}:${linesKey(t.lines, t.discount)}`).join('#');
  useEffect(() => {
    if (!client || staleOthers.length === 0) return;
    let live = true;
    (async () => {
      for (const t of staleOthers) {
        try {
          const pid = await partner(client, job.customerId, { name: job.customer, phone: job.phone, address: job.address });
          const r = await syncTicket(client, pid, t, ticketRef(t), now());
          if (live) setEstimates(job.id, (s) => ({ ...s, others: s.others.map((o) => (o.id === t.id && linesKey(o.lines, o.discount) === linesKey(t.lines, t.discount) ? { ...o, order: r.order, totals: r.totals, depositsSaved: r.depositsSaved } : o)) }));
        } catch (e) {
          log.warn('ticket', `${job.id}: couldn't save estimate ${t.title ?? t.id}: ${message(e)}`);
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, staleKey]);

  // Declined estimates are cancelled in Odoo (now, or the next time Odoo can be reached).
  const cancelKey = others.filter((t) => t.cancelPending && t.order).map((t) => t.id).join('#');
  useEffect(() => {
    if (!client || !cancelKey) return;
    let live = true;
    cancelDeclined(client, others)
      .then((done) => {
        if (live) setEstimates(job.id, (s) => ({ ...s, others: s.others.map((o) => (o.cancelPending && done.find((d) => d.id === o.id && !d.cancelPending) ? { ...o, cancelPending: undefined } : o)) }));
      })
      .catch((e) => log.warn('ticket', `${job.id}: couldn't cancel declined estimates: ${message(e)}`));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, cancelKey]);

  // Ask Odoo for totals a moment after the lines stop changing (not after the invoice is made).
  // Deposits are written to the quotation too, so they're kept in Odoo and not only on the phone.
  const depositsUnsaved = (ticket.depositsSaved ?? '') !== depositsKey(ticket);
  const stale = !!client && !invoice && ((ticket.lines.length > 0 && !odooTotals) || depositsUnsaved);
  const key = `${ticket.lines.map((l) => `${l.id}:${l.qty}:${l.unitCents}`).join('|')}#${depositsKey(ticket)}#${discountKey(ticket.discount)}`;
  useEffect(() => {
    if (!stale) return;
    const t = setTimeout(() => syncRef.current(), SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [stale, key]);

  const makeInvoice = async () => {
    setMaking(true);
    setError(null);
    try {
      // Making the invoice from the open estimate is the customer's pick: the others are declined.
      if (awaitingPick(estimateSet)) setEstimates(job.id, (s) => pickEstimate(s, undefined, now()));
      // Odoo's totals for the lines as they are now, if it can be reached.
      const synced = client && !odooTotals ? await sync() : undefined;
      const t = synced ?? ticket;
      // Only a quotation Odoo priced with exactly these lines is confirmed and tied to the invoice.
      // Otherwise (Odoo unreachable, or it refused a line) the invoice is made from the phone's lines alone.
      let tied = false;
      let order = job.odooOrder;
      if (client && t.order && currentTotals(t)) {
        try {
          await confirmTicket(client, t.order, ticketRef(t));
          if (!job.odooOrder) setOdooOrder(job.id, t.order);
          order = order ?? t.order;
          tied = true;
        } catch (e) {
          log.warn('ticket', `${job.id}: couldn't confirm ${t.order.name}: ${message(e)}`);
        }
      }
      if (t.order && !tied) setError(`Made the invoice from the phone's lines and estimate. Quotation ${t.order.name} in Odoo was left as it is.`);
      // Deposits taken on the ticket become the invoice's first payments.
      const inv = create(job, ticketOption(t, sheet.taxPercent), 'ticket', ticketRef(t), t.shipTo, t.deposits);
      if (!job.steps?.workDoneAt) setStep(job.id, 'workDoneAt', now());
      // Parts used filter down from the ticket: what's on it from the truck comes off the truck now.
      for (const p of ticketParts(t, stock.items, stock.used ?? [], job.id, stock.purchases)) stock.takeParts(p.itemId, p.qty, job.id);
      // Post it in Odoo now, so the customer signs Odoo's invoice; if that fails, the invoice screen can send it later.
      if (invoiceOdoo.client) {
        try {
          await invoiceOdoo.send(inv, { order: tied ? order : undefined });
        } catch (e) {
          log.warn('ticket', `${job.id}: invoice ${inv.number} not sent to Odoo yet: ${message(e)}`);
        }
      }
      router.push({ pathname: '/invoice/[id]', params: { id: inv.id } });
    } catch (e) {
      setError(message(e));
    } finally {
      setMaking(false);
    }
  };

  /** Saves the ticket as the customer's estimate: its quotation in Odoo, ready to email. */
  const saveEstimate = async () => {
    setTicket(job.id, (t) => ({ ...t, estimateAt: now() }));
    setEmailed(null);
    if (!client) {
      setEstimateNote('Estimate saved on the phone. Sign in to Odoo to make it a quotation there.');
      return;
    }
    const t = odooTotals ? ticket : await sync();
    setEstimateNote(t?.order ? `Estimate saved in Odoo as quotation ${t.order.name}, ${formatMoney(currentTotals(t)?.total ?? 0)}. Create invoice makes it the invoice.` : 'Estimate saved on the phone. It goes to Odoo as a quotation when Odoo can be reached.');
  };

  const askEmail = async () => {
    if (!client) return;
    setEmailing(true);
    setError(null);
    try {
      const pid = await partner(client, job.customerId, { name: job.customer, phone: job.phone, address: job.address });
      setEmailTo({ pid, email: await partnerEmail(client, pid) });
    } catch (e) {
      setError(message(e));
    } finally {
      setEmailing(false);
    }
  };

  const sendEmail = async () => {
    if (!client || !emailTo || !ticket.order) return;
    const { pid } = emailTo;
    setEmailTo(null);
    setEmailing(true);
    try {
      // Lines edited since the last sync go to Odoo first, so the customer gets the current quotation.
      const t = odooTotals ? ticket : await sync();
      const order = t?.order ?? ticket.order;
      setEmailed(await emailRecord(client, 'sale.order', order.id, pid));
    } catch (e) {
      setError(message(e));
    } finally {
      setEmailing(false);
    }
  };

  const section = (kind: LineKind) => {
    const lines = ticket.lines.filter((l) => l.kind === kind);
    return (
      <>
        <SectionTitle>{kind === 'service' ? 'Services' : 'Materials'}</SectionTitle>
        {lines.map((l) => (
          <LineRow key={l.id} line={l} locked={!!invoice} onQty={(q) => setTicket(job.id, (t) => setQty(t, l.id, q))} onPrice={(c) => setTicket(job.id, (t) => setPrice(t, l.id, c))} onRemove={() => setTicket(job.id, (t) => removeLine(t, l.id))} />
        ))}
        {!invoice ? (
          <Action
            label={kind === 'service' ? '+ Add a service' : '+ Add a material'}
            onPress={() => router.push({ pathname: '/ticket-add', params: { id: job.id, kind } })}
            testID={`ticket-add-${kind}`}
          />
        ) : null}
      </>
    );
  };

  return (
    <View style={styles.stack} testID="ticket">
      <Text style={styles.for}>
        {jobName(job)}
        {job.customer && (ticket.shipTo?.address || job.address) ? `, ${ticket.shipTo?.address || job.address}` : ''}
      </Text>
      {invoice ? (
        <NavRow label={`${invoiceLabel(invoice)} made`} detail="Changes to the ticket now don't change the invoice" href={{ pathname: '/invoice/[id]', params: { id: invoice.id } }} testID="ticket-invoice" />
      ) : null}

      <EstimatesPanel set={estimateSet} taxPercent={sheet.taxPercent} locked={!!invoice} onChange={(fn) => setEstimates(job.id, fn)} now={now} />

      {section('service')}
      {section('material')}
      {!invoice ? <TypedLine onAdd={(l) => setTicket(job.id, (t) => addTyped(t, l, newLineId(now())))} /> : null}

      {!invoice && ticket.lines.length > 0 ? <DiscountPanel discount={ticket.discount} presets={presetsFor(business.discounts)} onChange={(d) => setTicket(job.id, (t) => setDiscount(t, d))} /> : null}

      <View style={styles.card} testID="ticket-totals">
        <Row label={ticket.discount ? 'Subtotal (after discount)' : 'Subtotal'} value={formatMoney(shown.untaxed)} />
        {ticket.discount ? <Row label="Discount" value={discountText(ticket.discount)} testID="ticket-discount-row" /> : null}
        <Row label={odooTotals ? 'Tax (Odoo)' : 'Tax (estimate, parts only)'} value={formatMoney(shown.tax)} />
        <Row label="Total" value={formatMoney(shown.total)} big testID="ticket-total" />
        <Text style={styles.meta} testID="ticket-totals-source">
          {ticket.lines.length === 0
            ? 'Add what you did and used. Odoo works out the tax.'
            : odooTotals
              ? `Odoo's numbers, from quotation ${ticket.order?.name ?? ''}. Tax and discounts are set in Odoo.`
              : syncing
                ? 'Asking Odoo for the tax and total...'
                : client
                  ? "Not checked with Odoo yet."
                  : 'Estimate on the phone. Sign in to Odoo for its tax and total.'}
        </Text>
      </View>
      {error ? (
        <>
          <Text style={styles.error} testID="ticket-error">
            {error}
          </Text>
          <Action label="Try Odoo again" onPress={() => sync()} testID="ticket-sync-retry" />
        </>
      ) : null}

      {!invoice ? <CustomerRef value={ticket.ref ?? ''} placeholder="Optional" onChange={(ref) => setTicket(job.id, (t) => ({ ...t, ref }))} /> : null}

      {!invoice ? (
        <Deposits
          business={business}
          note={`Deposit, ${jobName(job)}`}
          saved={
            !depositsUnsaved && ticket.order
              ? `Saved on quotation ${ticket.order.name} in Odoo; it becomes a payment on the invoice.`
              : client
                ? 'Saving it on the quotation in Odoo...'
                : 'Kept on the phone until you sign in to Odoo; it becomes a payment on the invoice.'
          }
          deposits={ticket.deposits ?? []}
          total={shown.total}
          onAdd={(d) => setTicket(job.id, (t) => ({ ...t, deposits: [...(t.deposits ?? []), { ...d, id: newId('d', now()), at: now() }] }))}
          onRemove={(id) => setTicket(job.id, (t) => ({ ...t, deposits: (t.deposits ?? []).filter((d) => d.id !== id) }))}
        />
      ) : null}

      {!invoice ? (
        <View style={styles.refBox} testID="ticket-estimate-box">
          <Action label={ticket.estimateAt ? 'Save the estimate again' : 'Save as estimate'} disabled={making || syncing || ticket.lines.length === 0} onPress={saveEstimate} testID="ticket-save-estimate" />
          {estimateNote ? (
            <Text style={styles.meta} testID="ticket-estimate-note">
              {estimateNote}
            </Text>
          ) : ticket.estimateAt ? (
            <Text style={styles.meta} testID="ticket-estimate-note">
              Saved as an estimate{ticket.order ? ` (quotation ${ticket.order.name} in Odoo)` : ''}. Create invoice makes it the invoice.
            </Text>
          ) : null}
          {ticket.estimateAt && ticket.order && client ? (
            emailTo ? (
              <>
                <Text style={styles.meta}>
                  Email {emailTo.email} Odoo's quotation {ticket.order.name}?
                </Text>
                <Action label={`Send to ${emailTo.email}`} primary onPress={sendEmail} testID="ticket-estimate-email-send" />
                <Action label="Cancel" onPress={() => setEmailTo(null)} testID="ticket-estimate-email-cancel" />
              </>
            ) : (
              <Action label={emailing ? 'Working...' : 'Email the estimate'} disabled={emailing} onPress={askEmail} testID="ticket-estimate-email" />
            )
          ) : null}
          {emailed ? (
            <Text style={emailed.state === 'failed' ? styles.error : styles.meta} testID="ticket-estimate-emailed">
              {emailedText(emailed)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!invoice && missingParts.length > 0 ? (
        <View style={styles.refBox} testID="ticket-parts-missing">
          <Text style={styles.error}>
            Before the invoice, account for {missingParts.length === 1 ? 'this part' : 'these parts'} in Parts used:
          </Text>
          {missingParts.map((p) => (
            <View key={p.lineId} style={styles.refBox}>
              <Text style={styles.label}>
                {p.qty} x {p.name}: {p.why === 'ordered' ? "ordered, not in yet. Tap Got it on the order when it's in." : 'not on the truck.'}
              </Text>
              {p.why === 'not-on-truck' ? (
                <Action label="Bought it for this job" onPress={() => setTicket(job.id, (t) => ({ ...t, bought: [...(t.bought ?? []), p.lineId] }))} testID={`ticket-part-bought-${p.lineId}`} />
              ) : null}
            </View>
          ))}
          <Action label="Parts used on the job" onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} testID="ticket-parts-open-job" />
        </View>
      ) : null}
      {!invoice ? <Action label={making ? 'Creating the invoice...' : 'Create invoice'} primary disabled={making || ticket.lines.length === 0 || syncing || missingParts.length > 0} onPress={makeInvoice} testID="ticket-make-invoice" /> : null}

      <SectionTitle>Optional</SectionTitle>
      <NavRow
        label="Good, better, best"
        detail={job.accepted ? `${acceptedLabel(job.accepted)} picked` : 'Options from your Odoo quotation templates, if you want them'}
        href={{ pathname: '/quote/[id]', params: { id: job.id } }}
        testID="ticket-estimate"
      />
    </View>
  );
}

const METHOD_OPTIONS: ChipOption<PayMethod>[] = PAY_METHODS.map((m) => ({ label: PAY_LABEL[m], value: m }));

/**
 * Deposits (optional, any job): the amount is typed each time. They stay on
 * the ticket until Create invoice, which records them as the invoice's first
 * payments, so Odoo gets them with the invoice.
 */
function Deposits({ business, note, saved, deposits, total, onAdd, onRemove }: { business: Business; note: string; saved: string; deposits: Deposit[]; total: number; onAdd: (d: Omit<Deposit, 'id' | 'at'>) => void; onRemove: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const taken = depositTotal({ deposits });
  const amountCents = cents(amount);
  // Cash App, Venmo and Zelle: the same QR codes and handles as the invoice's Scan to pay.
  const link = method === 'cash' || method === 'check' ? undefined : payLinks(business, amountCents, note).find((l) => l.method === method);
  return (
    <View style={styles.refBox} testID="ticket-deposits">
      {deposits.map((d) => (
        <View key={d.id} style={styles.totalRow} testID={`ticket-deposit-${d.id}`}>
          <Text style={styles.totalLabel}>
            Deposit, {PAY_LABEL[d.method]}
            {d.reference ? ` (${d.method === 'check' ? '#' : ''}${d.reference})` : ''}
          </Text>
          <View style={styles.controls}>
            <Text style={styles.totalValue}>{formatMoney(d.amount)}</Text>
            <Pressable onPress={() => onRemove(d.id)} accessibilityRole="button" accessibilityLabel="Remove deposit" testID={`ticket-deposit-remove-${d.id}`} style={({ pressed }) => [styles.small, pressed && styles.pressed]}>
              <Text style={styles.smallText}>✕</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {taken > 0 ? (
        <Text style={styles.meta} testID="ticket-deposit-due">
          {formatMoney(taken)} taken as a deposit. {formatMoney(Math.max(0, total - taken))} due when the work is done. {saved}
        </Text>
      ) : null}
      {open ? (
        <>
          <ChipRow options={METHOD_OPTIONS} value={method} onChange={setMethod} scroll testID="ticket-deposit-method" />
          <MeasureField label="Deposit" value={amount} onChange={setAmount} unit="dollars" allowFraction={false} testID="ticket-deposit-amount" />
          {method !== 'cash' && method !== 'check' ? (
            link?.url ? (
              <View style={styles.qrBox} testID="ticket-deposit-qr">
                <QrCode value={link.url} size={240} testID={`ticket-deposit-qr-${link.method}`} />
                <Text style={styles.qrLabel}>
                  {link.label} {link.handle}
                  {amountCents > 0 ? `, ${formatMoney(amountCents)}` : ''}
                </Text>
                <Text style={styles.meta}>{amountCents > 0 ? `The customer points their phone camera at this. ${link.label} opens with the amount filled in.` : `Enter the deposit to put the amount in the code.`}</Text>
              </View>
            ) : link ? (
              <Text style={styles.qrLabel} testID={`ticket-deposit-pay-${link.method}`}>
                {link.label}: send to {link.handle}
              </Text>
            ) : (
              <View style={styles.refBox} testID="ticket-deposit-no-handle">
                <Text style={styles.meta}>Add your {PAY_LABEL[method]} under Your business to show it here.</Text>
                <Action label="Your business" onPress={() => router.push('/business')} testID="ticket-deposit-set-business" />
              </View>
            )
          ) : null}
          {method !== 'cash' ? (
            <TextInput
              value={reference}
              onChangeText={setReference}
              placeholder={method === 'check' ? 'Check number (optional)' : 'Note (optional)'}
              placeholderTextColor={colors.muted}
              keyboardType={method === 'check' ? 'number-pad' : 'default'}
              accessibilityLabel={method === 'check' ? 'Check number' : 'Deposit note'}
              testID="ticket-deposit-reference"
              style={styles.input}
            />
          ) : null}
          {total > 0 && amountCents + taken > total ? (
            <Text style={styles.error} testID="ticket-deposit-over">
              That's more than the ticket's {formatMoney(total)} total. Odoo would show the extra as an overpayment.
            </Text>
          ) : null}
          <Action
            label={amountCents > 0 ? `Take ${formatMoney(amountCents)} by ${PAY_LABEL[method]}` : 'Enter the deposit'}
            primary
            disabled={amountCents <= 0}
            onPress={() => {
              if (amountCents <= 0) return;
              onAdd({ method, amount: amountCents, reference: method === 'cash' ? '' : reference });
              setAmount('');
              setReference('');
              setOpen(false);
            }}
            testID="ticket-deposit-save"
          />
          <Action label="Cancel" onPress={() => setOpen(false)} testID="ticket-deposit-cancel" />
        </>
      ) : (
        <Action label={taken > 0 ? 'Take another deposit' : 'Take a deposit'} onPress={() => setOpen(true)} testID="ticket-deposit" />
      )}
    </View>
  );
}

/** The customer reference Odoo shows on the sales order and the invoice. */
function CustomerRef({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.refBox}>
      <Text style={styles.label}>Customer reference</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        accessibilityLabel="Customer reference"
        testID="ticket-ref"
        style={styles.input}
      />
      <Text style={styles.meta}>On the sales order and the invoice in Odoo. Optional.</Text>
    </View>
  );
}

function LineRow({ line, locked, onQty, onPrice, onRemove }: { line: TicketLine; locked: boolean; onQty: (q: number) => void; onPrice: (c: number) => void; onRemove: () => void }) {
  const [price, setPriceText] = useState(priceText(line.unitCents));
  useEffect(() => setPriceText(priceText(line.unitCents)), [line.unitCents]);
  return (
    <View style={styles.line} testID={`ticket-line-${line.id}`}>
      <View style={styles.lineTop}>
        <Text style={styles.name}>{line.name}</Text>
        <Text style={styles.amount}>{formatMoney(lineTotal(line))}</Text>
      </View>
      {locked ? (
        <Text style={styles.meta}>
          {line.qty} × {formatMoney(line.unitCents)}
        </Text>
      ) : (
        <View style={styles.controls}>
          <Small label="−" onPress={() => onQty(line.qty - 1)} testID={`ticket-less-${line.id}`} hint={line.qty <= 1 ? 'Takes it off' : 'One fewer'} />
          <Text style={styles.qty} testID={`ticket-qty-${line.id}`}>
            {line.qty}
          </Text>
          <Small label="+" onPress={() => onQty(line.qty + 1)} testID={`ticket-more-${line.id}`} hint="One more" />
          <Text style={styles.each}>× $</Text>
          <TextInput
            value={price}
            onChangeText={setPriceText}
            onEndEditing={() => onPrice(cents(price))}
            onSubmitEditing={() => onPrice(cents(price))}
            keyboardType="decimal-pad"
            accessibilityLabel={`Price each for ${line.name}`}
            testID={`ticket-price-${line.id}`}
            style={styles.price}
          />
          <Small label="Remove" onPress={onRemove} testID={`ticket-remove-${line.id}`} />
        </View>
      )}
    </View>
  );
}

function TypedLine({ onAdd }: { onAdd: (l: { name: string; unitCents: number; kind: LineKind }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPriceText] = useState('');
  const [kind, setKind] = useState<LineKind>('service');
  if (!open) return <Action label="Type a line by hand" onPress={() => setOpen(true)} testID="ticket-typed-open" />;
  return (
    <View style={styles.card} testID="ticket-typed">
      <Segmented
        options={[
          { value: 'service', label: 'Service' },
          { value: 'material', label: 'Material' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <TextInput value={name} onChangeText={setName} placeholder="What it is" placeholderTextColor={colors.muted} accessibilityLabel="Line name" testID="ticket-typed-name" style={styles.input} />
      <TextInput value={price} onChangeText={setPriceText} placeholder="Price $" placeholderTextColor={colors.muted} keyboardType="decimal-pad" accessibilityLabel="Line price" testID="ticket-typed-price" style={styles.input} />
      <Action
        label="Add line"
        primary
        disabled={!name.trim()}
        onPress={() => {
          onAdd({ name, unitCents: cents(price), kind });
          setName('');
          setPriceText('');
          setOpen(false);
        }}
        testID="ticket-typed-add"
      />
    </View>
  );
}

function Row({ label, value, big, testID }: { label: string; value: string; big?: boolean; testID?: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, big && styles.big]}>{label}</Text>
      <Text style={[styles.totalValue, big && styles.big]} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function Small({ label, onPress, testID, hint }: { label: string; onPress: () => void; testID: string; hint?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint={hint} testID={testID} style={({ pressed }) => [styles.small, pressed && styles.pressed]}>
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  for: { fontSize: 22, fontWeight: '900', color: colors.text },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
  refBox: { gap: 6 },
  qrBox: { alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  qrLabel: { fontSize: type.value, fontWeight: '900', color: colors.text, textAlign: 'center' },
  label: { fontSize: type.body, fontWeight: '800', color: colors.text },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 8 },
  line: { gap: 6, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: colors.info },
  lineTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  name: { flex: 1, fontSize: type.body, fontWeight: '800', color: colors.text },
  amount: { fontSize: type.body, fontWeight: '900', color: colors.text },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  qty: { minWidth: 28, textAlign: 'center', fontSize: type.value, fontWeight: '900', color: colors.text },
  each: { fontSize: type.body, fontWeight: '800', color: colors.text },
  price: { minWidth: 90, minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, paddingHorizontal: 10, fontSize: type.body, fontWeight: '800', color: colors.text, backgroundColor: colors.bg },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  small: { minWidth: touch.min, minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: colors.bg },
  smallText: { fontSize: type.body, fontWeight: '900', color: colors.text },
  pressed: { backgroundColor: colors.safety },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: type.body, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: type.body, fontWeight: '800', color: colors.text },
  big: { fontSize: type.value, fontWeight: '900' },
});
