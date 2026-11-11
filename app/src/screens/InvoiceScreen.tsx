import { OdooInvoiceSync } from '../components/OdooSales';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipOption, ChipRow, MeasureField, SectionTitle } from '../components/controls';
import { QrCode } from '../components/QrCode';
import { SignatureSheet } from '../components/SignaturePad';
import { signatureFor } from '../lib/attachments';
import { invoiceHtml, pdfName } from '../lib/pdf';
import { useAttachments } from '../lib/useAttachments';
import { balance, Invoice, invoiceStatus, invoiceText, paid, PAY_LABEL, PAY_METHODS, payLinks, PayMethod, reviewLink, reviewRequestText, STATUS_LABEL } from '../lib/invoices';
import { formatJobDate } from '../lib/jobs';
import { cents, formatMoney, TIER_LABEL } from '../lib/prices';
import { textLink, warrantyFor } from '../lib/followups';
import { useCustomers } from '../lib/useCustomers';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { colors, touch, type } from '../theme';

const METHOD_OPTIONS: ChipOption<PayMethod>[] = PAY_METHODS.map((m) => ({ label: PAY_LABEL[m], value: m }));
const CONFIRM_MS = 4000;

/**
 * One invoice: what was done, what's been paid and what's still owed. The
 * customer can scan a QR code to pay by Cash App or Venmo with the amount
 * filled in; the tech records each payment by how it came in.
 */
export function InvoiceScreen({ invoice }: { invoice: Invoice }) {
  const { business, addPayment, removePayment, setVoid } = useInvoices();
  const status = invoiceStatus(invoice);
  const warranty = warrantyFor(invoice, useFollowUps().settings);
  const phone = useCustomers().customers.find((c) => c.id === invoice.customerId)?.phone ?? '';
  const review = reviewLink(business) ? textLink(phone, reviewRequestText(invoice, business)) : undefined;
  const due = balance(invoice);
  const links = payLinks(business, due, `Invoice ${invoice.number}`);
  const scannable = links.filter((l) => l.url);
  const [qrFor, setQrFor] = useState<PayMethod | null>(null);
  const shownQr = scannable.find((l) => l.method === qrFor) ?? scannable[0];

  const attachments = useAttachments();
  const signature = signatureFor(attachments, 'invoice', invoice.id);
  const [signing, setSigning] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const warrantyNote =
    status !== 'void' && (warranty.partsUntil || warranty.laborUntil)
      ? `Warranty: ${warranty.partsUntil ? `springs until ${formatJobDate(warranty.partsUntil)}` : 'no spring warranty'}${warranty.laborUntil ? `, labor until ${formatJobDate(warranty.laborUntil)}` : ''}.`
      : undefined;
  const sendPdf = () => {
    if (!attachments.media) return;
    setPdfError(false);
    attachments.media.sharePdf(invoiceHtml(invoice, business, signature, { warranty: warrantyNote }), pdfName(`Invoice ${invoice.number}`, invoice.billTo)).catch(() => setPdfError(true));
  };

  const [method, setMethod] = useState<PayMethod>('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  useEffect(() => {
    // Default the amount to what's owed whenever that changes.
    setAmount(due > 0 ? (due / 100).toFixed(2).replace(/\.00$/, '') : '');
  }, [due]);
  const amountCents = cents(amount);

  return (
    <View style={styles.stack} testID="invoice">
      <View style={styles.top}>
        <Text style={styles.number}>Invoice {invoice.number}</Text>
        <Text style={[styles.badge, status === 'paid' && styles.badgePaid, status === 'void' && styles.badgeVoid]} testID="invoice-status">
          {STATUS_LABEL[status]}
        </Text>
      </View>
      <Text style={styles.detail}>
        {invoice.billTo || 'Customer'}
        {invoice.address ? `, ${invoice.address}` : ''}
      </Text>
      <Text style={styles.meta}>
        {formatJobDate(invoice.createdAt)} · {TIER_LABEL[invoice.tier]} option
      </Text>
      {status !== 'void' && (warranty.partsUntil || warranty.laborUntil) ? (
        <Text style={styles.meta} testID="invoice-warranty">
          Warranty: {warranty.partsUntil ? `springs until ${formatJobDate(warranty.partsUntil)}` : 'no spring warranty'}
          {warranty.laborUntil ? `, labor until ${formatJobDate(warranty.laborUntil)}` : ''}
          {(warranty.partsUntil ?? 0) > Date.now() || (warranty.laborUntil ?? 0) > Date.now() ? ' (covered now)' : ' (ended)'}
        </Text>
      ) : null}
      {invoice.customerId ? (
        <Action label="Customer history" onPress={() => router.push({ pathname: '/customer/[id]', params: { id: invoice.customerId! } })} testID="invoice-customer" />
      ) : null}

      <View style={styles.card}>
        {invoice.lines.map((l, i) => (
          <Line key={i} label={l.label} value={formatMoney(l.cents)} />
        ))}
        {invoice.tax > 0 ? <Line label="Tax on parts" value={formatMoney(invoice.tax)} /> : null}
        <Line label="Total" value={formatMoney(invoice.total)} bold />
        {paid(invoice) > 0 ? <Line label="Paid" value={formatMoney(paid(invoice))} /> : null}
        <Line label="Amount due" value={formatMoney(due)} bold testID="invoice-due" />
      </View>
      <OdooInvoiceSync invoice={invoice} />

      {invoice.payments.length > 0 ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          {invoice.payments.map((p) => (
            <View key={p.id} style={styles.payment} testID={`payment-${p.id}`}>
              <Text style={styles.detail}>
                {formatMoney(p.amount)} by {PAY_LABEL[p.method]}
                {p.reference ? ` (${p.method === 'check' ? '#' : ''}${p.reference})` : ''}
              </Text>
              <Text style={styles.meta}>{formatJobDate(p.at)}</Text>
              <ConfirmButton label="Remove payment" armedLabel="Tap again to remove" onPress={() => removePayment(invoice.id, p.id)} testID={`payment-remove-${p.id}`} />
            </View>
          ))}
        </>
      ) : null}

      {status !== 'void' && due > 0 ? (
        <>
          <SectionTitle>Scan to pay</SectionTitle>
          {shownQr ? (
            <View style={styles.qrBox} testID="invoice-qr">
              {scannable.length > 1 ? (
                <ChipRow
                  options={scannable.map((l) => ({ label: l.label, value: l.method }))}
                  value={shownQr.method}
                  onChange={setQrFor}
                  testID="invoice-qr-pick"
                />
              ) : null}
              <QrCode value={shownQr.url!} size={240} testID={`qr-${shownQr.method}`} />
              <Text style={styles.qrLabel}>
                {shownQr.label} {shownQr.handle}, {formatMoney(due)}
              </Text>
              <Text style={styles.meta}>The customer points their phone camera at this. {shownQr.label} opens with the amount filled in.</Text>
            </View>
          ) : null}
          {links
            .filter((l) => !l.url)
            .map((l) => (
              <Text key={l.method} style={styles.detail} testID={`pay-${l.method}`}>
                {l.label}: send to {l.handle}
              </Text>
            ))}
          {links.length === 0 ? (
            <View style={styles.notice} testID="invoice-no-handles">
              <Text style={styles.detail}>Add your Cash App, Venmo and Zelle to show QR codes the customer can scan.</Text>
              <Action label="Your business" onPress={() => router.push('/business')} testID="invoice-set-business" />
            </View>
          ) : null}

          <SectionTitle>Record a payment</SectionTitle>
          <ChipRow options={METHOD_OPTIONS} value={method} onChange={setMethod} scroll testID="payment-method" />
          <MeasureField label="Amount" value={amount} onChange={setAmount} unit="dollars" allowFraction={false} testID="payment-amount" />
          {method !== 'cash' ? (
            <TextInput
              value={reference}
              onChangeText={setReference}
              placeholder={method === 'check' ? 'Check number (optional)' : 'Note (optional)'}
              placeholderTextColor={colors.muted}
              keyboardType={method === 'check' ? 'number-pad' : 'default'}
              accessibilityLabel={method === 'check' ? 'Check number' : 'Payment note'}
              testID="payment-reference"
              style={styles.input}
            />
          ) : null}
          <Action
            label={amountCents > 0 ? `Record ${formatMoney(amountCents)} by ${PAY_LABEL[method]}` : 'Enter the amount'}
            primary
            disabled={amountCents <= 0}
            onPress={() => {
              if (amountCents <= 0) return;
              addPayment(invoice.id, { method, amount: amountCents, reference: method === 'cash' ? '' : reference });
              setReference('');
            }}
            testID="payment-record"
          />
        </>
      ) : null}

      {status === 'paid' && reviewLink(business) ? (
        <>
          <SectionTitle>Paid in full</SectionTitle>
          {review ? (
            <Action label="Ask for a review" primary onPress={() => Linking.openURL(review).catch(() => undefined)} testID="invoice-review" />
          ) : (
            <Action label="Ask for a review" onPress={() => Share.share({ message: reviewRequestText(invoice, business) }).catch(() => undefined)} testID="invoice-review-share" />
          )}
        </>
      ) : null}

      <SectionTitle>Signature</SectionTitle>
      {signature ? (
        <Text style={styles.detail} testID="invoice-signed">
          Signed by {signature.name || 'the customer'} on {formatJobDate(signature.at)}
        </Text>
      ) : (
        <Text style={styles.meta}>The customer signs that the work is done, on this phone. It goes on the PDF.</Text>
      )}
      <Action label={signature ? 'Sign again' : 'Customer signs'} onPress={() => setSigning(true)} testID="invoice-sign" />
      <SignatureSheet
        visible={signing}
        title={`Invoice ${invoice.number}`}
        agreement="Work completed to my satisfaction."
        initialName={invoice.billTo}
        onCancel={() => setSigning(false)}
        onSave={(s) => {
          attachments.sign({ for: 'invoice', refId: invoice.id, ...s });
          setSigning(false);
        }}
      />

      <SectionTitle>More</SectionTitle>
      {attachments.media ? <Action label="Send as PDF" primary onPress={sendPdf} testID="invoice-pdf" /> : null}
      {pdfError ? <Text style={styles.meta}>Couldn't make the PDF. Try again, or send it as text.</Text> : null}
      <Action label="Send as text" onPress={() => Share.share({ message: invoiceText(invoice, business) }).catch(() => undefined)} testID="invoice-share" />
      {status === 'void' ? (
        <Action label="Restore invoice" onPress={() => setVoid(invoice.id, false)} testID="invoice-unvoid" />
      ) : (
        <ConfirmButton label="Void invoice" armedLabel="Tap again to void" onPress={() => setVoid(invoice.id, true)} testID="invoice-void" />
      )}
    </View>
  );
}

function Line({ label, value, bold, testID }: { label: string; value: string; bold?: boolean; testID?: string }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.lineValue, bold && styles.bold]} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function Action({ label, onPress, primary, disabled, testID }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.button, primary && styles.primary, disabled && styles.disabled, pressed && styles.pressed]}
    >
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

/** Acts only on a second tap within a few seconds, so a gloved bump can't undo money. */
function ConfirmButton({ label, armedLabel, onPress, testID }: { label: string; armedLabel: string; onPress: () => void; testID?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Pressable
      onPress={() => (armed ? onPress() : setArmed(true))}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [styles.button, armed && styles.armed, pressed && styles.pressed]}
    >
      {({ pressed }) => <Text style={[styles.buttonText, armed && !pressed && styles.primaryText]}>{armed ? armedLabel : label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  number: { flex: 1, fontSize: type.big, fontWeight: '900', color: colors.text },
  badge: { fontSize: 16, fontWeight: '900', color: colors.text, backgroundColor: colors.safety, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, overflow: 'hidden', letterSpacing: 1 },
  badgePaid: { color: colors.onSelected, backgroundColor: colors.selected },
  badgeVoid: { color: colors.onStop, backgroundColor: colors.stop },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  card: { padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, gap: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, fontSize: type.body, color: colors.text },
  lineValue: { fontSize: type.body, fontWeight: '800', color: colors.text },
  bold: { fontWeight: '900', fontSize: type.value },
  payment: { padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border, gap: 6 },
  qrBox: { alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  qrLabel: { fontSize: type.value, fontWeight: '900', color: colors.text, textAlign: 'center' },
  notice: { padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.safety, gap: 8 },
  input: {
    minHeight: touch.min,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  disabled: { opacity: 0.4 },
  armed: { backgroundColor: colors.stop, borderColor: colors.stop },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
});
