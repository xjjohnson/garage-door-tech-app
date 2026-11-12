import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, NavRow } from '../components/Buttons';
import { SectionTitle, Segmented } from '../components/controls';
import { usePartner, useSalesOdoo } from '../components/OdooSales';
import { invoiceStatus } from '../lib/invoices';
import { Job, jobName } from '../lib/jobs';
import { OdooError } from '../lib/odoo';
import { cents, formatMoney, priceText, TIER_LABEL } from '../lib/prices';
import { addTyped, confirmTicket, currentTotals, EMPTY_TICKET, estimateTotals, LineKind, lineTotal, newLineId, removeLine, setPrice, setQty, syncTicket, Ticket, TicketLine, ticketOption } from '../lib/ticket';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type } from '../theme';

const message = (e: unknown) => (e instanceof OdooError || e instanceof Error ? e.message : "Couldn't reach Odoo. Try again.");

/** Wait this long after the last change before asking Odoo for totals. */
const SYNC_DELAY_MS = 1500;

/**
 * A job's ticket: the services and materials for the job, added from the
 * price book or typed, changed any time. Odoo works out tax and the total
 * from a draft quotation; offline the phone shows its own estimate. Make the
 * invoice turns the ticket into the job's invoice.
 */
export function TicketScreen({ job, now = Date.now }: { job: Job; now?: () => number }) {
  const { setTicket, setOdooOrder } = useJobs();
  const { invoices, create } = useInvoices();
  const { sheet } = usePriceSheet();
  const client = useSalesOdoo();
  const partner = usePartner();
  const ticket = job.ticket ?? EMPTY_TICKET;
  const odooTotals = currentTotals(ticket);
  const shown = odooTotals ?? estimateTotals(ticket, sheet.taxPercent);
  const invoice = invoices.find((i) => i.jobId === job.id && invoiceStatus(i) !== 'void');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const run = useRef(0);

  const sync = async (): Promise<Ticket | undefined> => {
    if (!client || ticket.lines.length === 0) return;
    const n = ++run.current;
    setSyncing(true);
    setError(null);
    try {
      const pid = await partner(client, job.customerId, { name: job.customer, phone: job.phone, address: job.address });
      const r = await syncTicket(client, pid, ticket, ['Job ticket', job.address.trim()].filter(Boolean).join(' · '), now());
      if (n === run.current) setTicket(job.id, (t) => ({ ...t, order: r.order, totals: r.totals }));
      return { ...ticket, order: r.order, totals: r.totals };
    } catch (e) {
      if (n === run.current) setError(message(e));
    } finally {
      if (n === run.current) setSyncing(false);
    }
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // Ask Odoo for totals a moment after the lines stop changing (not after the invoice is made).
  const stale = !!client && ticket.lines.length > 0 && !odooTotals && !invoice;
  const key = ticket.lines.map((l) => `${l.id}:${l.qty}:${l.unitCents}`).join('|');
  useEffect(() => {
    if (!stale) return;
    const t = setTimeout(() => syncRef.current(), SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [stale, key]);

  const makeInvoice = async () => {
    setMaking(true);
    setError(null);
    try {
      // Odoo's totals for the lines as they are now, if it can be reached.
      const t = (client && !odooTotals ? await sync() : undefined) ?? ticket;
      if (client && t.order) {
        await confirmTicket(client, t.order);
        if (!job.odooOrder) setOdooOrder(job.id, t.order);
      }
      const inv = create(job, ticketOption(t, sheet.taxPercent), 'ticket');
      router.push({ pathname: '/invoice/[id]', params: { id: inv.id } });
    } catch (e) {
      setError(message(e));
    } finally {
      setMaking(false);
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
        {job.customer && job.address ? `, ${job.address}` : ''}
      </Text>
      {invoice ? (
        <NavRow label={`Invoice ${invoice.number} made`} detail="Changes to the ticket now don't change the invoice" href={{ pathname: '/invoice/[id]', params: { id: invoice.id } }} testID="ticket-invoice" />
      ) : null}

      {section('service')}
      {section('material')}
      {!invoice ? <TypedLine onAdd={(l) => setTicket(job.id, (t) => addTyped(t, l, newLineId(now())))} /> : null}

      <View style={styles.card} testID="ticket-totals">
        <Row label="Subtotal" value={formatMoney(shown.untaxed)} />
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

      {!invoice ? <Action label={making ? 'Making the invoice...' : 'Make the invoice'} primary disabled={making || ticket.lines.length === 0 || syncing} onPress={makeInvoice} testID="ticket-make-invoice" /> : null}

      <SectionTitle>Optional</SectionTitle>
      <NavRow
        label="Estimate"
        detail={job.accepted ? `Good, better, best · ${TIER_LABEL[job.accepted.tier]} picked` : 'Good, better, best options, if you want them'}
        href={{ pathname: '/quote/[id]', params: { id: job.id } }}
        testID="ticket-estimate"
      />
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
