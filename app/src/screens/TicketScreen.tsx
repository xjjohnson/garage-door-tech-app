import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Action, NavRow } from '../components/Buttons';
import { EstimatesPanel } from '../components/EstimatesPanel';
import { ChipOption, ChipRow, MeasureField, SectionTitle, Segmented } from '../components/controls';
import { useInvoiceOdoo, usePartner, useSalesOdoo } from '../components/OdooSales';
import { Business, invoiceLabel, invoiceNo, invoiceStatus, newId, PAY_LABEL, PAY_METHODS, payLinks, PayMethod } from '../lib/invoices';
import { QrCode } from '../components/QrCode';
import { awaitingPick, cancelDeclined, EstimateSet, markSignatureSent, openEstimates, pickEstimate, signEstimate } from '../lib/estimates';
import { sendOrderSignature } from '../lib/odooSales';
import { signaturePng } from '../lib/signaturePng';
import { useAttachments } from '../lib/useAttachments';
import { acceptedLabel, Job, jobName } from '../lib/jobs';
import { log } from '../lib/log';
import { OdooError } from '../lib/odoo';
import { cents, formatMoney, priceText } from '../lib/prices';
import { addText, addTyped, hasPriced, isText, confirmTicket, currentTotals, EMPTY_TICKET, estimateTotals, LineKind, linesKey, lineTotal, newLineId, removeLine, setPrice, setQty, syncTicket, Ticket, TicketLine, ticketOption, ticketParts, ticketRef, depositTotal, Deposit, depositsKey, unaccountedParts, setDiscount, setTerms, signaturePending, signedNow, setPlan, planKey, planDone } from '../lib/ticket';
import { activePlanFor, PlanProgress, PlanSetupError, setUpPlan } from '../lib/planSetup';
import { useMaintenancePlans } from '../lib/useMaintenancePlans';
import { NO_VENDOR_MESSAGE, orderPartForJob } from '../lib/odooPurchasing';
import { useCustomerType } from '../lib/useCustomerType';
import { plansForType } from '../lib/maintenancePlans';
import { PlanRow } from '../components/PlanRow';
import { useJobCustomer } from './JobAddressScreen';
import { discountKey, discountText, presetsFor } from '../lib/discounts';
import type { ActivePlan } from '../lib/planSetup';
import { DiscountPanel } from '../components/DiscountPanel';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useStock } from '../lib/useStock';
import { EmailResult, emailedText, emailRecord, partnerEmail } from '../lib/odooReports';
import { usePriceSheet } from '../lib/usePriceSheet';
import { canMove, groupIntoLaborAndParts, hasSections, headings, moveLine, moveToSection, orderLines, renameLine, sectionTotals } from '../lib/ticketSections';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

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
  const styles = useStyles();
  const { setTicket, setEstimates, setOdooOrder, setStep } = useJobs();
  const invoiceOdoo = useInvoiceOdoo(now);
  const { invoices, create, business } = useInvoices();
  const autoHeadings = { plan: business.planHeading, payments: business.paymentsHeading };
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
  // A linked order that has been approved (confirmed) in Odoo: items can't be added, changed or removed
  // until it is put back to draft. Unknown (offline) counts as open, since nothing says it is approved.
  const [orderState, setOrderState] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const stock = useStock();
  // Every ticket part has to be accounted for in Parts used before the invoice (Justin, 0.5.33).
  const missingParts = unaccountedParts(ticket, stock.items, job.id, stock.purchases);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState<{ pid: number; email: string } | null>(null);
  const [emailed, setEmailed] = useState<EmailResult | null>(null);
  const [emailing, setEmailing] = useState(false);
  const run = useRef(0);
  const attachments = useAttachments();
  const [noSignField, setNoSignField] = useState(false);

  // The customer's signature goes on the estimate's quotation in Odoo, once per signature and quotation.
  // Every estimate is checked (not just the one open), so a signature made on one that has since been
  // switched away from, or whose quotation was only just created, still lands on its own quotation.
  const [signError, setSignError] = useState<string | null>(null);
  const pendingSigs = client && !noSignField ? [ticket, ...others].filter((t) => !t.declinedAt && signaturePending(t) && attachments.signatures.some((x) => x.id === t.signed!.id)) : [];
  const signKey = pendingSigs.map((t) => `${t.id ?? ''}:${t.signed!.id}:${t.order!.id}`).join('#');
  const [signRetry, setSignRetry] = useState(0);
  useEffect(() => {
    if (!client || pendingSigs.length === 0) return;
    let live = true;
    (async () => {
      for (const t of pendingSigs) {
        const sig = attachments.signatures.find((x) => x.id === t.signed!.id)!;
        const orderId = t.order!.id;
        const estId = t.id;
        try {
          const ok = await sendOrderSignature(client, orderId, { name: sig.name, at: sig.at, png: signaturePng(sig) });
          if (!live) return;
          if (!ok) {
            setNoSignField(true);
            return;
          }
          setSignError(null);
          const done = (x: Ticket) => (x.id === estId && x.order?.id === orderId ? markSignatureSent(x, sig.id, orderId) : x);
          setEstimates(job.id, (set) => ({ ticket: done(set.ticket), others: set.others.map(done) }));
        } catch (e) {
          log.warn('ticket', `${job.id}: couldn't save the estimate signature in Odoo: ${message(e)}`);
          if (live) setSignError(message(e));
          return;
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signKey, client, attachments.signatures.length, signRetry]);

  // Maintenance plans: the list to choose from, and the plan this customer is already on.
  const allPlans = useMaintenancePlans();
  const jobCustomer = useJobCustomer(job);
  // Plans for this customer's type (Homeowner, Commercial...); every plan while the type isn't known.
  const { type: customerType } = useCustomerType(jobCustomer?.odooId);
  const plans = plansForType(allPlans, customerType);
  const [active, setActive] = useState<ActivePlan | undefined>();
  const planNames = allPlans.map((p) => p.name).join('|');
  useEffect(() => {
    if (!client || !jobCustomer?.odooId || !planNames) return setActive(undefined);
    let live = true;
    activePlanFor(client, jobCustomer.odooId, planNames.split('|'), new Date(now()).toISOString().slice(0, 10))
      .then((a) => live && setActive(a))
      .catch(() => live && setActive(undefined));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, jobCustomer?.odooId, planNames]);

  // An accepted plan is made in Odoo: when the customer signs the estimate, or the invoice is made from it.
  // Each estimate is checked, so a plan on one that was signed and switched away from still gets made.
  const acceptedPlans = client ? [ticket, ...others].filter((t) => !t.declinedAt && t.plan && !planDone(t) && !t.plan.setUpError && (signedNow(t) || (!!invoice && t === ticket))) : [];
  const planKeyNow = acceptedPlans.map((t) => `${t.id ?? ''}:${t.plan!.id}:${t.plan!.setUp?.repeatId ?? ''}`).join('#');
  useEffect(() => {
    if (!client || acceptedPlans.length === 0) return;
    let live = true;
    (async () => {
      for (const t of acceptedPlans) {
        const plan = t.plan!;
        const estId = t.id;
        const mark = (x: Ticket, patch: Partial<NonNullable<Ticket['plan']>>) => (x.id === estId && x.plan && x.plan.id === plan.id ? { ...x, plan: { ...x.plan, ...patch } } : x);
        try {
          const pid = await partner(client, job.customerId, { name: job.customer, phone: job.phone, address: job.address });
          const made = await setUpPlan(client, pid, { customer: job.customer, address: t.shipTo?.address || job.address }, plan, now(), { orderId: t.order?.id, prior: plan.setUp });
          if (live) setEstimates(job.id, (set) => ({ ticket: mark(set.ticket, { setUp: { ...made, at: now() }, setUpError: undefined }), others: set.others.map((o) => mark(o, { setUp: { ...made, at: now() }, setUpError: undefined })) }));
        } catch (e) {
          log.warn('ticket', `${job.id}: couldn't set up plan ${plan.name}: ${message(e)}`);
          const progress: PlanProgress = e instanceof PlanSetupError ? e.progress : {};
          if (live) setEstimates(job.id, (set) => ({ ticket: mark(set.ticket, { setUpError: message(e), ...(progress.repeatId || progress.agreementId ? { setUp: { ...progress, at: 0 } } : {}) }), others: set.others.map((o) => mark(o, { setUpError: message(e), ...(progress.repeatId || progress.agreementId ? { setUp: { ...progress, at: 0 } } : {}) })) }));
          return;
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, planKeyNow]);

  const sync = async (): Promise<Ticket | undefined> => {
    if (!client || (ticket.lines.length === 0 && !ticket.deposits?.length && !ticket.order)) return;
    const n = ++run.current;
    // The estimate being synced: its result is dropped if another estimate was opened meanwhile.
    const estId = ticket.id;
    setSyncing(true);
    setError(null);
    try {
      const pid = await partner(client, job.customerId, { name: job.customer, phone: job.phone, address: job.address });
      const r = await syncTicket(client, pid, ticket, ticketRef(ticket), now(), `${job.id}:${ticket.id ?? ''}`, autoHeadings);
      if (n === run.current) setTicket(job.id, (t) => (t.id === estId || (!estId && !t.order) ? { ...t, order: r.order, totals: r.totals, depositsSaved: r.depositsSaved, planSaved: r.planSaved } : t));
      return { ...ticket, order: r.order, totals: r.totals, depositsSaved: r.depositsSaved, planSaved: r.planSaved };
    } catch (e) {
      if (n === run.current) setError(message(e));
    } finally {
      if (n === run.current) setSyncing(false);
    }
  };
  // A part not on the truck can be ordered for this job: a draft purchase order in Odoo, linked to the job's order.
  const [ordering, setOrdering] = useState<string | null>(null);
  const [orderMsg, setOrderMsg] = useState('');
  const [needVendor, setNeedVendor] = useState<string | null>(null);
  const vendorChoices = stock.suppliers.filter((x) => x.odooId).sort((a, b) => a.name.localeCompare(b.name));
  const orderForJob = async (p: { lineId: string; qty: number; name: string }, vendorId?: number) => {
    const line = ticket.lines.find((l) => l.id === p.lineId);
    if (!client || !ticket.order || !line?.productId) return;
    setOrdering(p.lineId);
    setOrderMsg('');
    try {
      const po = await orderPartForJob(client, { productId: line.productId, name: line.name, qty: p.qty }, ticket.order, vendorId);
      setNeedVendor(null);
      setOrderMsg(`${po.reused ? 'Added to' : 'Made'} draft purchase order ${po.name} in Odoo. It isn't sent until you confirm it.`);
    } catch (e) {
      if (message(e) === NO_VENDOR_MESSAGE && vendorChoices.length > 0) {
        setNeedVendor(p.lineId);
        setOrderMsg('');
      } else setOrderMsg(message(e));
    } finally {
      setOrdering(null);
    }
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // The job's other open estimates are quotations in Odoo too: each is saved once it has lines.
  const staleOthers = client && !invoice ? openEstimates(others).filter((t) => t.id && t.lines.length > 0 && !currentTotals(t)) : [];
  const staleKey = staleOthers.map((t) => `${t.id}:${linesKey(t.lines, t.discount, t.terms)}`).join('#');
  useEffect(() => {
    if (!client || staleOthers.length === 0) return;
    let live = true;
    (async () => {
      for (const t of staleOthers) {
        try {
          const pid = await partner(client, job.customerId, { name: job.customer, phone: job.phone, address: job.address });
          const r = await syncTicket(client, pid, t, ticketRef(t), now(), `${job.id}:${t.id ?? ''}`, autoHeadings);
          if (live) setEstimates(job.id, (s) => ({ ...s, others: s.others.map((o) => (o.id === t.id && linesKey(o.lines, o.discount, o.terms) === linesKey(t.lines, t.discount, t.terms) ? { ...o, order: r.order, totals: r.totals, depositsSaved: r.depositsSaved, planSaved: r.planSaved } : o)) }));
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
  // A plan chosen or changed is written to the quotation as a note, so it's saved again too.
  const planUnsaved = (ticket.planSaved ?? '') !== planKey(ticket) && (ticket.lines.length > 0 || !!ticket.order);
  const stale = !!client && !invoice && ((ticket.lines.length > 0 && !odooTotals) || depositsUnsaved || planUnsaved);
  const key = `${ticket.lines.map((l) => `${l.id}:${l.qty}:${l.unitCents}:${isText(l) ? l.name : ''}`).join('|')}#${depositsKey(ticket)}#${discountKey(ticket.discount)}#${planKey(ticket)}`;
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
      const inv = create(job, ticketOption(t, sheet.taxPercent, autoHeadings), 'ticket', ticketRef(t), t.shipTo, t.deposits);
      if (!job.steps?.workDoneAt) setStep(job.id, 'workDoneAt', now());
      // Parts used filter down from the ticket: what's on it from the truck comes off the truck now.
      for (const p of ticketParts(t, stock.items, stock.used ?? [], job.id, stock.purchases)) stock.takeParts(p.itemId, p.qty, job.id);
      // Post it in Odoo now, so the customer signs Odoo's invoice; if that fails, the invoice screen can send it later.
      if (invoiceOdoo.client) {
        try {
          await invoiceOdoo.send(inv, { order: tied ? order : undefined });
        } catch (e) {
          log.warn('ticket', `${job.id}: invoice ${invoiceNo(inv)} not sent to Odoo yet: ${message(e)}`);
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

  const linkedId = ticket.linked ? ticket.order?.id : undefined;
  useEffect(() => {
    setOrderState(null);
    if (!client || !linkedId) return;
    let live = true;
    client
      .call('sale.order', 'read', [[linkedId]], { fields: ['state'] })
      .then((r) => live && setOrderState(((r as { state?: string }[])[0]?.state as string) ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, linkedId]);
  const approved = !invoice && !!linkedId && (orderState === 'sale' || orderState === 'done');
  /** Items can't change: the invoice is made, or the linked order is approved. */
  const frozen = !!invoice || approved;

  const backToDraft = async () => {
    if (!client || !linkedId) return;
    setReopening(true);
    setError(null);
    try {
      // Odoo: a confirmed order is cancelled, then set back to a quotation.
      await client.call('sale.order', 'action_cancel', [[linkedId]]);
      await client.call('sale.order', 'action_draft', [[linkedId]]);
      setOrderState('draft');
    } catch (e) {
      setError(message(e));
    } finally {
      setReopening(false);
    }
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

      {signError ? <Action label="Signature not saved in Odoo yet. Tap to retry" onPress={() => setSignRetry((n) => n + 1)} testID="sign-retry" /> : null}
      <EstimatesPanel set={estimateSet} taxPercent={sheet.taxPercent} locked={!!invoice} onChange={(fn) => setEstimates(job.id, fn)} now={now} customer={job.customer} onSign={(id, s) => {
        const saved = attachments.sign({ for: 'quote', refId: `${job.id}#${id ?? 'estimate'}`, ...s });
        setEstimates(job.id, (set) => signEstimate(set, id, { id: saved.id, by: saved.name, at: saved.at }));
      }} />

      {approved ? (
        <View style={styles.refBox} testID="ticket-approved">
          <Text style={styles.label}>Order {ticket.order?.name} is approved in Odoo, so its items are locked.</Text>
          <Text style={styles.meta}>To add or change items, put it back to a quotation. It is confirmed again when you create the invoice.</Text>
          <Action label={reopening ? 'Working...' : 'Put back to draft'} disabled={reopening} onPress={backToDraft} testID="ticket-back-to-draft" />
        </View>
      ) : null}
      <TicketList
        ticket={ticket}
        frozen={frozen}
        jobId={job.id}
        now={now}
        onChange={(fn) => setTicket(job.id, fn)}
      />
      <PlanRow
        plan={ticket.plan}
        plans={plans}
        locked={frozen}
        active={active}
        done={planDone(ticket)}
        error={ticket.plan?.setUpError}
        onChange={(p) => setTicket(job.id, (t) => setPlan(t, p))}
        onRetry={() => setTicket(job.id, (t) => (t.plan ? { ...t, plan: { ...t.plan, setUpError: undefined } } : t))}
      />

      {!frozen && ticket.lines.length > 0 ? <DiscountPanel discount={ticket.discount} presets={presetsFor(business.discounts)} onChange={(d) => setTicket(job.id, (t) => setDiscount(t, d))} /> : null}

      {!frozen && ticket.lines.length > 0 ? (
        <View style={styles.card} testID="ticket-terms">
          <Text style={styles.termsTitle}>Terms &amp; Conditions</Text>
          <Text style={styles.meta}>Off keeps the terms area empty on the quote and invoice. On adds your company terms.</Text>
          <ChipRow options={TERMS_OPTIONS} value={ticket.terms ? 'on' : 'off'} onChange={(v) => setTicket(job.id, (t) => setTerms(t, v === 'on'))} testID="ticket-terms-chips" />
        </View>
      ) : null}

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
          <Action label={ticket.estimateAt ? 'Save the estimate again' : 'Save as estimate'} disabled={making || syncing || !hasPriced(ticket)} onPress={saveEstimate} testID="ticket-save-estimate" />
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
 {p.why === 'not-on-truck' && client && ticket.order && ticket.lines.find((l) => l.id === p.lineId)?.productId ? (
                <Action
                  label={ordering === p.lineId ? 'Ordering...' : 'Order it for this job'}
                  disabled={ordering !== null}
                  onPress={() => orderForJob(p)}
                  testID={`ticket-part-order-${p.lineId}`}
                />
              ) : null}
              {needVendor === p.lineId ? (
                <>
                  <Text style={styles.meta}>This part has no vendor in Odoo yet. Pick the vendor to order it from</Text>
                  <ChipRow
                    options={vendorChoices.map((v) => ({ label: v.name, value: String(v.odooId) }))}
                    value=""
                    onChange={(v: string) => orderForJob(p, Number(v))}
                    scroll
                    testID={`ticket-part-vendor-${p.lineId}`}
                  />
                </>
              ) : null}
              {p.why === 'not-on-truck' ? (
                <Action label="Bought it for this job" onPress={() => setTicket(job.id, (t) => ({ ...t, bought: [...(t.bought ?? []), p.lineId] }))} testID={`ticket-part-bought-${p.lineId}`} />
              ) : null}
            </View>
          ))}
          {orderMsg ? <Text style={styles.meta} testID="ticket-part-order-msg">{orderMsg}</Text> : null}
          <Action label="Parts used on the job" onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} testID="ticket-parts-open-job" />
        </View>
      ) : null}
      {!invoice ? <Action label={making ? 'Creating the invoice...' : 'Create invoice'} primary disabled={making || !hasPriced(ticket) || syncing || missingParts.length > 0} onPress={makeInvoice} testID="ticket-make-invoice" /> : null}

      <SectionTitle>Optional</SectionTitle>
      <NavRow
        label="Templates"
        detail={job.accepted ? `${acceptedLabel(job.accepted)} picked` : 'Options from your Odoo quotation templates, if you want them'}
        href={{ pathname: '/quote/[id]', params: { id: job.id } }}
        testID="ticket-estimate"
      />
    </View>
  );
}

const TERMS_OPTIONS: ChipOption<'on' | 'off'>[] = [
  { label: 'Off', value: 'off' },
  { label: 'On', value: 'on' },
];
const METHOD_OPTIONS: ChipOption<PayMethod>[] = PAY_METHODS.map((m) => ({ label: PAY_LABEL[m], value: m }));

/**
 * Deposits (optional, any job): the amount is typed each time. They stay on
 * the ticket until Create invoice, which records them as the invoice's first
 * payments, so Odoo gets them with the invoice.
 */
function Deposits({ business, note, saved, deposits, total, onAdd, onRemove }: { business: Business; note: string; saved: string; deposits: Deposit[]; total: number; onAdd: (d: Omit<Deposit, 'id' | 'at'>) => void; onRemove: (id: string) => void }) {
  const styles = useStyles();
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
  const styles = useStyles();
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

function LineRow({ line, locked, onQty, onPrice, onRemove, onMenu }: { line: TicketLine; locked: boolean; onQty: (q: number) => void; onPrice: (c: number) => void; onRemove: () => void; onMenu?: () => void }) {
  const styles = useStyles();
  const [price, setPriceText] = useState(priceText(line.unitCents));
  useEffect(() => setPriceText(priceText(line.unitCents)), [line.unitCents]);
  return (
    <View style={styles.line} testID={`ticket-line-${line.id}`}>
      <View style={styles.lineTop}>
        <Text style={styles.name}>{line.name}</Text>
        <Text style={styles.chip} testID={`ticket-kind-${line.id}`}>{line.kind === 'material' ? 'Part' : 'Labor'}</Text>
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
          {onMenu ? <Small label="⋮" onPress={onMenu} testID={`ticket-more-menu-${line.id}`} hint="Move this line" /> : null}
        </View>
      )}
    </View>
  );
}

/**
 * The ticket's lines as one ordered list, the way the quotation in Odoo reads: section heading bands with their
 * lines under them, notes among the lines. Lines move with buttons (up, down, to a section), not by dragging.
 */
function TicketList({ ticket, frozen, jobId, now, onChange }: { ticket: Ticket; frozen: boolean; jobId: string; now: () => number; onChange: (fn: (t: Ticket) => Ticket) => void }) {
  const styles = useStyles();
  const lines = orderLines(ticket.lines);
  const [menu, setMenu] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ kind: 'note' | 'section'; at?: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [text, setText] = useState('');
  const totals = sectionTotals(lines);
  const sections = hasSections(lines);
  const heads = headings(lines);
  const done = () => {
    setMenu(null);
    setPicking(null);
  };
  const go = (fn: (t: Ticket) => Ticket) => {
    onChange(fn);
    done();
  };
  const addPicked = (kind: LineKind, at?: string) => {
    done();
    router.push({ pathname: '/ticket-add', params: { id: jobId, kind, ...(at ? { section: at } : {}) } });
  };
  const moveMenu = (l: TicketLine) => (
    <View style={styles.menu} testID={`ticket-menu-${l.id}`}>
      <Small label="Move up" onPress={() => go((t) => moveLine(t, l.id, -1))} testID={`ticket-up-${l.id}`} disabled={!canMove(ticket, l.id, -1)} />
      <Small label="Move down" onPress={() => go((t) => moveLine(t, l.id, 1))} testID={`ticket-down-${l.id}`} disabled={!canMove(ticket, l.id, 1)} />
      {l.kind !== 'section' && sections ? <Small label="Move to section..." onPress={() => setPicking(picking === l.id ? null : l.id)} testID={`ticket-to-${l.id}`} /> : null}
      {picking === l.id ? (
        <View style={styles.menu}>
          <Small label="No section" onPress={() => go((t) => moveToSection(t, l.id, null))} testID={`ticket-to-none-${l.id}`} />
          {heads.map((h) => (
            <Small key={h.id} label={h.name} onPress={() => go((t) => moveToSection(t, l.id, h.id))} testID={`ticket-to-${l.id}-${h.id}`} />
          ))}
        </View>
      ) : null}
      {l.kind === 'section' ? (
        <>
          <Small label="Rename" onPress={() => { setRenaming({ id: l.id, text: l.name }); done(); }} testID={`ticket-rename-${l.id}`} />
          <Small label="Delete heading" onPress={() => go((t) => ({ ...t, lines: t.lines.filter((x) => x.id !== l.id) }))} testID={`ticket-text-remove-${l.id}`} hint="Keeps its lines, which fall into the section above" />
        </>
      ) : l.kind === 'note' ? (
        <Small label="Remove" onPress={() => go((t) => removeLine(t, l.id))} testID={`ticket-text-remove-${l.id}`} />
      ) : null}
    </View>
  );
  const addForm = (at?: string) =>
    adding && adding.at === at ? (
      <View style={styles.card} testID="ticket-text-form">
        <TextInput value={text} onChangeText={setText} placeholder={adding.kind === 'note' ? 'Note for the customer' : 'Section heading'} placeholderTextColor={colors.muted} multiline={adding.kind === 'note'} accessibilityLabel={adding.kind === 'note' ? 'Note' : 'Section heading'} testID="ticket-text-input" style={styles.input} />
        <Action
          label={adding.kind === 'note' ? 'Add note' : 'Add section'}
          primary
          disabled={!text.trim()}
          onPress={() => {
            const kind = adding.kind;
            const id = newLineId(now());
            onChange((t) => addText(t, kind, text, id, at));
            setText('');
            setAdding(null);
          }}
          testID="ticket-text-add"
        />
        <Action label="Cancel" onPress={() => { setText(''); setAdding(null); }} testID="ticket-text-cancel" />
      </View>
    ) : null;
  const priced = lines.some((l) => !isText(l) && !l.planFee);
  return (
    <>
      <SectionTitle>Ticket</SectionTitle>
      {lines.map((l) =>
        l.kind === 'section' ? (
          <View key={l.id} style={styles.band} testID={`ticket-text-${l.id}`}>
            {renaming?.id === l.id ? (
              <>
                <TextInput value={renaming.text} onChangeText={(v) => setRenaming({ id: l.id, text: v })} accessibilityLabel="Section heading" testID={`ticket-rename-input-${l.id}`} style={styles.input} />
                <View style={styles.controls}>
                  <Small label="Save" onPress={() => { const r = renaming; setRenaming(null); onChange((t) => renameLine(t, r.id, r.text)); }} testID={`ticket-rename-save-${l.id}`} />
                  <Small label="Cancel" onPress={() => setRenaming(null)} testID={`ticket-rename-cancel-${l.id}`} />
                </View>
              </>
            ) : (
              <View style={styles.lineTop}>
                <Text style={styles.bandName}>{l.name}</Text>
                <Text style={styles.amount} testID={`ticket-section-total-${l.id}`}>{formatMoney(totals.get(l.id) ?? 0)}</Text>
              </View>
            )}
            {!frozen && renaming?.id !== l.id ? (
              <View style={styles.controls}>
                <Small label="+ Add here" onPress={() => setPicking(picking === `add:${l.id}` ? null : `add:${l.id}`)} testID={`ticket-add-here-${l.id}`} />
                <Small label="⋮" onPress={() => setMenu(menu === l.id ? null : l.id)} testID={`ticket-more-menu-${l.id}`} hint="Rename, move or delete this heading" />
              </View>
            ) : null}
            {picking === `add:${l.id}` ? (
              <View style={styles.menu}>
                <Small label="Service" onPress={() => addPicked('service', l.id)} testID={`ticket-here-service-${l.id}`} />
                <Small label="Material" onPress={() => addPicked('material', l.id)} testID={`ticket-here-material-${l.id}`} />
                <Small label="Note" onPress={() => { done(); setAdding({ kind: 'note', at: l.id }); }} testID={`ticket-here-note-${l.id}`} />
                <TypedLine prefix={`ticket-here-typed-${l.id}`} onAdd={(x) => go((t) => addTyped(t, x, newLineId(now()), l.id))} />
              </View>
            ) : null}
            {menu === l.id ? moveMenu(l) : null}
            {addForm(l.id)}
          </View>
        ) : l.kind === 'note' ? (
          <View key={l.id} style={styles.line} testID={`ticket-text-${l.id}`}>
            <Text style={styles.meta}>{`Note: ${l.name}`}</Text>
            {!frozen ? <Small label="⋮" onPress={() => setMenu(menu === l.id ? null : l.id)} testID={`ticket-more-menu-${l.id}`} hint="Move or remove this note" /> : null}
            {menu === l.id ? moveMenu(l) : null}
          </View>
        ) : (
          <View key={l.id}>
            <LineRow line={l} locked={frozen || !!l.planFee} onQty={(q) => onChange((t) => setQty(t, l.id, q))} onPrice={(c) => onChange((t) => setPrice(t, l.id, c))} onRemove={() => onChange((t) => removeLine(t, l.id))} onMenu={frozen || l.planFee ? undefined : () => setMenu(menu === l.id ? null : l.id)} />
            {menu === l.id ? moveMenu(l) : null}
          </View>
        ),
      )}
      {addForm(undefined)}
      {!frozen ? (
        <>
          <Action label="+ Add a service" onPress={() => addPicked('service')} testID="ticket-add-service" />
          <Action label="+ Add a material" onPress={() => addPicked('material')} testID="ticket-add-material" />
          {!adding ? (
            <>
              <Action label="+ Add a note" onPress={() => setAdding({ kind: 'note' })} testID="ticket-add-note" />
              <Action label="+ Add a section" onPress={() => setAdding({ kind: 'section' })} testID="ticket-add-section" />
            </>
          ) : null}
          {!sections && priced ? <Action label="Group into Labor and Parts" onPress={() => onChange((t) => groupIntoLaborAndParts(t, () => newLineId(now(), Math.random)))} testID="ticket-group" /> : null}
          <TypedLine onAdd={(l) => onChange((t) => addTyped(t, l, newLineId(now())))} />
        </>
      ) : null}
    </>
  );
}

function TypedLine({ onAdd, prefix = 'ticket-typed' }: { onAdd: (l: { name: string; unitCents: number; kind: LineKind }) => void; prefix?: string }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPriceText] = useState('');
  const [kind, setKind] = useState<LineKind>('service');
  if (!open) return <Action label="Type a line by hand" onPress={() => setOpen(true)} testID={`${prefix}-open`} />;
  return (
    <View style={styles.card} testID={prefix}>
      <Segmented
        options={[
          { value: 'service', label: 'Service' },
          { value: 'material', label: 'Material' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <TextInput value={name} onChangeText={setName} placeholder="What it is" placeholderTextColor={colors.muted} accessibilityLabel="Line name" testID={`${prefix}-name`} style={styles.input} />
      <TextInput value={price} onChangeText={setPriceText} placeholder="Price $" placeholderTextColor={colors.muted} keyboardType="decimal-pad" accessibilityLabel="Line price" testID={`${prefix}-price`} style={styles.input} />
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
        testID={`${prefix}-add`}
      />
    </View>
  );
}

function Row({ label, value, big, testID }: { label: string; value: string; big?: boolean; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, big && styles.big]}>{label}</Text>
      <Text style={[styles.totalValue, big && styles.big]} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function Small({ label, onPress, testID, hint, disabled }: { label: string; onPress: () => void; testID: string; hint?: string; disabled?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} accessibilityHint={hint} testID={testID} style={({ pressed }) => [styles.small, pressed && styles.pressed, disabled && styles.off]}>
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  termsTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  for: { fontSize: fs(22), fontWeight: '800', color: colors.text },
  meta: { fontSize: fs(15), fontWeight: '600', color: colors.muted },
  refBox: { gap: sp(6) },
  qrBox: { alignItems: 'center', gap: sp(10), padding: sp(12), borderRadius: rad(12), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card },
  qrLabel: { fontSize: type.value, fontWeight: '800', color: colors.text, textAlign: 'center' },
  label: { fontSize: type.body, fontWeight: '800', color: colors.text },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  card: { backgroundColor: colors.card, borderRadius: rad(12), padding: sp(12), gap: sp(8) },
  line: { gap: sp(6), paddingVertical: sp(8), borderBottomWidth: 1, borderBottomColor: colors.line },
  lineTop: { flexDirection: 'row', gap: sp(8), alignItems: 'flex-start' },
  name: { flex: 1, fontSize: type.body, fontWeight: '800', color: colors.text },
  amount: { fontSize: type.body, fontWeight: '800', color: colors.text },
  controls: { flexDirection: 'row', alignItems: 'center', gap: sp(6), flexWrap: 'wrap' },
  qty: { minWidth: 28, textAlign: 'center', fontSize: type.value, fontWeight: '800', color: colors.text },
  each: { fontSize: type.body, fontWeight: '800', color: colors.text },
  price: { minWidth: 90, minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(10), fontSize: type.body, fontWeight: '800', color: colors.text, backgroundColor: colors.card },
  input: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  small: { minWidth: touch.min, minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(10), backgroundColor: colors.card },
  smallText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  pressed: { backgroundColor: colors.info },
  off: { opacity: 0.4 },
  menu: { gap: sp(6), paddingVertical: sp(6) },
  band: { gap: sp(6), paddingVertical: sp(10), paddingHorizontal: sp(12), borderRadius: rad(12), backgroundColor: colors.card, borderWidth: bw(1.5), borderColor: colors.border },
  bandName: { flex: 1, fontSize: type.value, fontWeight: '800', color: colors.text },
  chip: { fontSize: fs(13), fontWeight: '800', color: colors.muted },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: type.body, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: type.body, fontWeight: '800', color: colors.text },
  big: { fontSize: type.value, fontWeight: '800' },
}));
