import { OdooQuoteSend } from '../components/OdooSales';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SignatureSheet } from '../components/SignaturePad';
import { photosFor, signatureFor } from '../lib/attachments';
import { formatJobDate, Job, jobName } from '../lib/jobs';
import { pdfName, quoteHtml } from '../lib/pdf';
import { useAttachments } from '../lib/useAttachments';
import { formatNumber } from '../lib/measure';
import { cents, formatMoney, hasPrices, TIER_CYCLES, TIER_LABEL } from '../lib/prices';
import { buildQuote, QuoteOption, quoteText, repairQuote } from '../lib/quote';
import { formatLife } from '../lib/springNames';
import { Repair, repairLines, withRepairs } from '../lib/inspection';
import { templateQuote, templatesFor } from '../lib/odooTemplates';
import { useQuoteTemplates } from '../lib/useQuoteTemplates';
import { invoiceStatus } from '../lib/invoices';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type } from '../theme';

/**
 * Good, better and best for one saved job, priced from the price sheet. The
 * tech can send it to the customer and record which option they picked.
 */
export function QuoteScreen({ job, onSetPrices }: { job: Job; onSetPrices: () => void }) {
  const { sheet } = usePriceSheet();
  const { setAccepted, setInspection } = useJobs();
  const templates = useQuoteTemplates();
  const set = templatesFor(templates, job.what);
  const springQuote = useMemo(() => buildQuote(job, sheet), [job, sheet]);
  // Jobs the spring calculator can't price (openers, tune-ups) use the job type's Odoo templates.
  const fromTemplates = !!set && !!springQuote.blocked;
  // No spring answer and no templates, but the inspection found repairs: quote those on their own.
  const repairOnly = !fromTemplates && !!springQuote.blocked && (job.inspection?.repairs.some((r) => r.label.trim()) ?? false);
  const quote = useMemo(
    () =>
      fromTemplates && set
        ? templateQuote(set, sheet, repairLines(job.inspection))
        : repairOnly
          ? repairQuote(repairLines(job.inspection), sheet)
          : withRepairs(springQuote, job.inspection, sheet),
    [fromTemplates, repairOnly, set, springQuote, job.inspection, sheet],
  );
  const addOns = job.inspection?.repairs.filter((r) => r.label.trim()) ?? [];
  const toggleAddOn = (r: Repair) => {
    if (!job.inspection) return;
    setInspection(job.id, { ...job.inspection, repairs: job.inspection.repairs.map((x) => (x.id === r.id ? { ...x, declined: !x.declined || undefined } : x)) });
  };
  const repairs = repairLines(job.inspection);
  const priced = hasPrices(sheet);
  const { invoices, create, business } = useInvoices();
  const attachments = useAttachments();
  const signature = signatureFor(attachments, 'quote', job.id);
  const jobPhotos = photosFor(attachments, job.id);
  const photoCount = jobPhotos.length;
  const [signing, setSigning] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const invoice = invoices.find((i) => i.jobId === job.id && invoiceStatus(i) !== 'void');
  const picked = job.accepted ? quote.options.find((o) => o.tier === job.accepted!.tier && o.available) : undefined;

  return (
    <View style={styles.stack} testID="quote">
      <Text style={styles.for}>
        {jobName(job)}
        {job.customer && job.address ? `, ${job.address}` : ''}
      </Text>
      <Text style={styles.meta}>{job.summaryTitle}</Text>

      {!priced && !fromTemplates ? (
        <View style={styles.notice} testID="quote-no-prices">
          <Text style={styles.noticeTitle}>Set your prices first</Text>
          <Text style={styles.noticeBody}>The options below show $0 until the price sheet has your prices.</Text>
          <Action label="Open the price sheet" primary onPress={onSetPrices} testID="quote-set-prices" />
        </View>
      ) : null}

      {fromTemplates && set ? (
        <Text style={styles.meta} testID="quote-from-templates">
          From your Odoo quotation templates for {set.type}.
        </Text>
      ) : null}

      {repairOnly ? (
        <Text style={styles.meta} testID="quote-repairs-only">
          No spring measurements, so this quote is the service call and the repairs from the inspection.
        </Text>
      ) : null}

      {quote.blocked ? (
        <View style={[styles.notice, styles.stop]} testID="quote-blocked">
          <Text style={[styles.noticeTitle, styles.onStop]}>No quote yet</Text>
          <Text style={[styles.noticeBody, styles.onStop]}>{quote.blocked}. Open the job in the calculator to fix it.</Text>
        </View>
      ) : null}

      <Action
        label={job.inspection ? 'Inspection' + (repairs.length > 0 ? ` (${repairs.length} repair${repairs.length === 1 ? '' : 's'} added)` : '') : 'Do an inspection'}
        onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: job.id } })}
        testID="quote-inspection"
      />
      <Action label={photoCount > 0 ? `Photos (${photoCount})` : 'Take photos'} onPress={() => router.push({ pathname: '/photos/[id]', params: { id: job.id } })} testID="quote-photos" />

      {addOns.length > 0 ? (
        <View style={styles.stack} testID="quote-addons">
          <Text style={styles.tier}>Add-ons from the inspection</Text>
          <Text style={styles.meta}>Each one the customer wants goes on every option. Tap to take one off.</Text>
          {addOns.map((r) => {
            const shots = r.item ? jobPhotos.filter((p) => p.item === r.item).slice(0, 3) : [];
            const priceless = cents(r.price) <= 0;
            return (
              <Pressable
                key={r.id}
                onPress={() => toggleAddOn(r)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !r.declined }}
                testID={`quote-addon-${r.id}`}
                style={({ pressed }) => [styles.card, !r.declined && styles.cardOn, r.declined && styles.cardOff, pressed && styles.pressed]}
              >
                <View style={styles.top}>
                  <Text style={styles.lineLabel}>
                    {r.declined ? '☐' : '☑'} {r.label}
                  </Text>
                  <Text style={styles.lineValue}>{priceless ? 'No price yet' : formatMoney(cents(r.price))}</Text>
                </View>
                {shots.length > 0 ? (
                  <View style={styles.thumbs}>
                    {shots.map((p) => (
                      <Image key={p.id} source={{ uri: p.uri }} style={styles.thumb} accessibilityLabel={`Photo for ${r.label}`} />
                    ))}
                  </View>
                ) : null}
                {r.declined ? <Text style={styles.meta}>Customer said no</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {quote.options.map((o) => (
        <OptionCard
          key={o.tier}
          option={o}
          accepted={job.accepted?.tier === o.tier}
          onAccept={() => setAccepted(job.id, job.accepted?.tier === o.tier ? undefined : { tier: o.tier, total: o.total, at: Date.now() })}
        />
      ))}

      {job.accepted ? (
        <>
          <Text style={styles.meta} testID="quote-accepted-note">
            Customer picked {picked?.title ?? TIER_LABEL[job.accepted.tier]} at {formatMoney(job.accepted.total)} on {formatJobDate(job.accepted.at)}.
          </Text>
          {signature ? (
            <Text style={styles.meta} testID="quote-signed">
              Signed by {signature.name || 'the customer'} on {formatJobDate(signature.at)}.
            </Text>
          ) : null}
          <Action label={signature ? 'Sign again' : 'Customer signs to approve'} onPress={() => setSigning(true)} testID="quote-sign" />
          <SignatureSheet
            visible={signing}
            title="Approve the quote"
            agreement={`I approve the ${picked?.title ?? TIER_LABEL[job.accepted.tier]} option for ${formatMoney(job.accepted.total)}.`}
            initialName={job.customer}
            onCancel={() => setSigning(false)}
            onSave={(s) => {
              attachments.sign({ for: 'quote', refId: job.id, ...s });
              setSigning(false);
            }}
          />
          {picked ? <OdooQuoteSend job={job} option={picked} /> : null}
        </>
      ) : null}

      {invoice ? (
        <Action
          label={`Open invoice ${invoice.number}`}
          primary
          onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: invoice.id } })}
          testID="quote-open-invoice"
        />
      ) : picked ? (
        <>
          {picked.total !== job.accepted!.total ? (
            <Text style={styles.meta} testID="quote-price-changed">
              Prices have changed since the customer picked {TIER_LABEL[picked.tier]}: the invoice will be {formatMoney(picked.total)}, not {formatMoney(job.accepted!.total)}.
            </Text>
          ) : null}
          <Action
            label={`Make invoice for ${formatMoney(picked.total)}`}
            primary
            onPress={() => {
              const inv = create(job, picked);
              router.push({ pathname: '/invoice/[id]', params: { id: inv.id } });
            }}
            testID="quote-make-invoice"
          />
        </>
      ) : null}

      {quote.options.some((o) => o.available) ? (
        <>
          {attachments.media ? (
            <Action
              label="Send as PDF"
              onPress={() => {
                setPdfError(false);
                attachments.media!.sharePdf(quoteHtml(job, quote, business, signature), pdfName('Quote', job.customer)).catch(() => setPdfError(true));
              }}
              testID="quote-pdf"
            />
          ) : null}
          {pdfError ? <Text style={styles.meta}>Couldn't make the PDF. Try again, or send it as text.</Text> : null}
          <Action
            label="Send as text"
            onPress={() => Share.share({ message: quoteText(quote, job.customer) }).catch(() => undefined)}
            testID="quote-share"
          />
          <Action label="Price sheet" onPress={onSetPrices} testID="quote-prices" />
        </>
      ) : null}
    </View>
  );
}

function OptionCard({ option, accepted, onAccept }: { option: QuoteOption; accepted: boolean; onAccept: () => void }) {
  const label = option.title ?? TIER_LABEL[option.tier];
  if (!option.available) {
    return (
      <View style={[styles.card, styles.cardOff]} testID={`quote-${option.tier}`}>
        <Text style={styles.tier}>{label}</Text>
        <Text style={styles.meta}>{option.reason}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.card, accepted && styles.cardOn]} testID={`quote-${option.tier}`}>
      <View style={styles.top}>
        <Text style={styles.tier}>{label}</Text>
        <Text style={styles.total} testID={`quote-total-${option.tier}`}>
          {formatMoney(option.total)}
        </Text>
      </View>
      {option.extension ? (
        <Text style={styles.meta}>Extension springs, the same size on every option</Text>
      ) : option.springCount === 0 ? null : (
        <Text style={styles.meta}>
          For {formatNumber(TIER_CYCLES[option.tier])}+ cycles · these springs are rated {option.spring ? formatLife(option.spring.life) : '?'}
        </Text>
      )}
      {option.lines.map((l, i) => (
        <View key={i} style={styles.line}>
          <Text style={styles.lineLabel}>{l.label}</Text>
          <Text style={styles.lineValue}>{l.cents > 0 ? formatMoney(l.cents) : '—'}</Text>
        </View>
      ))}
      {option.tax > 0 ? (
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Tax on parts</Text>
          <Text style={styles.lineValue}>{formatMoney(option.tax)}</Text>
        </View>
      ) : null}
      <Action
        label={accepted ? `✓ Customer picked ${label}` : `Customer picked ${label}`}
        primary={accepted}
        onPress={onAccept}
        testID={`quote-accept-${option.tier}`}
      />
    </View>
  );
}

function Action({ label, onPress, primary, testID }: { label: string; onPress: () => void; primary?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, primary && styles.primary, pressed && styles.pressed]}>
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  for: { fontSize: type.value, fontWeight: '900', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  notice: { padding: 12, borderRadius: 10, borderWidth: 3, borderColor: colors.border, backgroundColor: colors.safety, gap: 8 },
  stop: { backgroundColor: colors.stop, borderColor: colors.stop },
  onStop: { color: colors.onStop },
  noticeTitle: { fontSize: type.value, fontWeight: '900', color: colors.text },
  noticeBody: { fontSize: type.body, color: colors.text, lineHeight: 24 },
  card: { padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, gap: 8 },
  cardOn: { borderWidth: 4, backgroundColor: colors.bg },
  cardOff: { borderStyle: 'dashed' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  tier: { fontSize: type.value, fontWeight: '900', color: colors.text },
  total: { fontSize: type.big, fontWeight: '900', color: colors.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, fontSize: type.body, color: colors.text },
  lineValue: { fontSize: type.body, fontWeight: '800', color: colors.text },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
  thumbs: { flexDirection: 'row', gap: 8 },
  thumb: { width: 88, height: 88, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
});
