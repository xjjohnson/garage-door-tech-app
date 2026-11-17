import { OdooQuoteSend } from '../components/OdooSales';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { ChipRow, MeasureField } from '../components/controls';
import { PriceBookPicker } from '../components/PriceBookPicker';
import { usePriceBook } from '../lib/usePriceBook';
import { SignatureSheet } from '../components/SignaturePad';
import { photosFor, signatureFor } from '../lib/attachments';
import { acceptedLabel, formatJobDate, isAccepted, Job, jobName } from '../lib/jobs';
import { pdfName, quoteHtml } from '../lib/pdf';
import { useAttachments } from '../lib/useAttachments';
import { formatNumber } from '../lib/measure';
import { cents, formatMoney, TIER_CYCLES, TIER_LABEL } from '../lib/prices';
import { buildQuote, QuoteOption, quoteText, repairQuote } from '../lib/quote';
import { addEstimate } from '../lib/estimates';
import { addOption, newLineId, Ticket } from '../lib/ticket';
import { formatLife } from '../lib/springNames';
import { Repair, repairLines, withRepairs } from '../lib/inspection';
import { usesSprings } from '../lib/jobTypes';
import { springTemplateQuote, springTemplatesFor, templateQuote } from '../lib/odooTemplates';
import { useQuoteTemplates } from '../lib/useQuoteTemplates';
import type { TemplateSets } from '../lib/odooTemplates';
import type { PriceSheet } from '../lib/prices';
import { invoiceNo, invoiceStatus } from '../lib/invoices';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type } from '../theme';

/**
 * Good, better and best for one saved job, priced from Odoo's quotation
 * templates ("Springs · Good" and so on; the calculator picks each option's
 * spring). Spring jobs fall back to the old price sheet until those templates
 * exist. The tech can send it to the customer and record which option they picked.
 */
export function QuoteScreen({ job }: { job: Job }) {
  const { sheet } = usePriceSheet();
  const { setAccepted, setInspection, setQuoteLines, setTicket, setEstimates } = useJobs();
  const templates = useQuoteTemplates();
  const typed = useMemo(() => job.quoteLines ?? [], [job.quoteLines]);
  const springJob = usesSprings(job.what);
  const springQuote = useMemo(() => buildQuote(job, sheet), [job, sheet]);
  // Spring jobs with springs picked: Odoo's spring templates price them.
  const springSet = springJob && !springQuote.blocked ? springTemplatesFor(templates, job.what) : undefined;
  // No spring answer and no templates: the service call plus the inspection's repairs and lines typed here.
  // Always so for a job that isn't about springs; for a spring job, once there is something to quote.
  const repairOnly = !!springQuote.blocked && (!springJob || [...(job.inspection?.repairs ?? []), ...typed].some((r) => r.label.trim()));
  const quote = useMemo(
    () =>
      springSet
        ? springTemplateQuote(springQuote, springSet, sheet, repairLines(job.inspection, typed))
        : repairOnly
          ? repairQuote(repairLines(job.inspection, typed), sheet)
          : withRepairs(springQuote, job.inspection, sheet, typed),
    [springSet, repairOnly, springQuote, job.inspection, typed, sheet],
  );
  /** Puts the picked templates on the estimate: together as sections of this one, or each as its own estimate. */
  const addTemplates = (picked: { name: string; option: QuoteOption }[], separate: boolean) => {
    const t = Date.now();
    if (separate) {
      setEstimates(job.id, (s) =>
        picked.reduce((acc, p, i) => {
          let n = 0;
          const lines = addOption({ lines: [] }, p.option, sheet.odoo, () => newLineId(t + i * 1000 + n++)).lines;
          return addEstimate(acc, { lines, title: p.name }, () => newLineId(t + 500 + i));
        }, s),
      );
    } else {
      let n = 0;
      const id = () => newLineId(t + n++);
      setTicket(job.id, (prev) =>
        picked.reduce((acc, p) => {
          // With several templates each gets its name as a heading, so they stay apart.
          const named: Ticket = picked.length > 1 ? { ...acc, lines: [...acc.lines, { id: id(), name: p.name, qty: 1, unitCents: 0, kind: 'section' }] } : acc;
          return addOption(named, p.option, sheet.odoo, id);
        }, prev),
      );
    }
    router.push({ pathname: '/ticket/[id]', params: { id: job.id } });
  };

  const addOns = job.inspection?.repairs.filter((r) => r.label.trim()) ?? [];
  const toggleAddOn = (r: Repair) => {
    if (!job.inspection) return;
    setInspection(job.id, { ...job.inspection, repairs: job.inspection.repairs.map((x) => (x.id === r.id ? { ...x, declined: !x.declined || undefined } : x)) });
  };
  const repairs = repairLines(job.inspection);
  const { invoices, create, business } = useInvoices();
  const attachments = useAttachments();
  const signature = signatureFor(attachments, 'quote', job.id);
  const jobPhotos = photosFor(attachments, job.id);
  const photoCount = jobPhotos.length;
  const [signing, setSigning] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const invoice = invoices.find((i) => i.jobId === job.id && invoiceStatus(i) !== 'void');
  const picked = job.accepted ? quote.options.find((o) => isAccepted(job.accepted, o) && o.available) : undefined;

  return (
    <View style={styles.stack} testID="quote">
      <Text style={styles.for}>
        {jobName(job)}
        {job.customer && job.address ? `, ${job.address}` : ''}
      </Text>
      <Text style={styles.meta}>{job.summaryTitle}</Text>

      {springJob && !springQuote.blocked && !springSet ? (
        <View style={styles.notice} testID="quote-no-spring-templates">
          <Text style={styles.noticeTitle}>No Springs templates in Odoo</Text>
          <Text style={styles.noticeBody}>
            Make quotation templates in Odoo named "Springs · Good", "Springs · Better" and "Springs · Best" with the spring product, labor and extras for each. The calculator picks the spring; the template sets the price. Until then the phone's fallback prices are used, which may be missing.
          </Text>
        </View>
      ) : null}

      <TemplateList templates={templates} sheet={sheet} onAdd={addTemplates} />

      {repairOnly && springJob ? (
        <Text style={styles.meta} testID="quote-repairs-only">
          No spring measurements, so this quote is the service call, the repairs from the inspection, and any lines you add below.
        </Text>
      ) : null}

      {quote.blocked ? (
        <View style={[styles.notice, styles.stop]} testID="quote-blocked">
          <Text style={[styles.noticeTitle, styles.onStop]}>No quote yet</Text>
          <Text style={[styles.noticeBody, styles.onStop]}>{quote.blocked}. Open the job in the calculator to fix it, or quote it by hand: add a line below.</Text>
        </View>
      ) : null}

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

      <TypedLines lines={typed} onChange={(lines) => setQuoteLines(job.id, lines)} />

      {quote.options.map((o) => (
        <OptionCard
          key={o.key ?? o.tier}
          option={o}
          accepted={isAccepted(job.accepted, o)}
          onAccept={() => setAccepted(job.id, isAccepted(job.accepted, o) ? undefined : { tier: o.tier, ...(o.key ? { key: o.key, title: o.title } : {}), total: o.total, at: Date.now() })}
        />
      ))}

      {!invoice && quote.options.filter((o) => o.available).length > 1 ? (
        <Action
          label="Make each option its own estimate"
          onPress={() => {
            const t = Date.now();
            setEstimates(job.id, (s) =>
              quote.options
                .filter((o) => o.available)
                .reduce((acc, o, i) => {
                  let n = 0;
                  const lines = addOption({ lines: [] }, o, sheet.odoo, () => newLineId(t + i * 1000 + n++)).lines;
                  return addEstimate(acc, { lines, title: o.title ?? TIER_LABEL[o.tier] }, () => newLineId(t + 500 + i));
                }, s),
            );
            router.push({ pathname: '/ticket/[id]', params: { id: job.id } });
          }}
          testID="quote-to-estimates"
        />
      ) : null}

      {job.accepted ? (
        <>
          <Text style={styles.meta} testID="quote-accepted-note">
            Customer picked {picked?.title ?? acceptedLabel(job.accepted)} at {formatMoney(job.accepted.total)} on {formatJobDate(job.accepted.at)}.
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
            agreement={`I approve the ${picked?.title ?? acceptedLabel(job.accepted)} option for ${formatMoney(job.accepted.total)}.`}
            initialName={job.customer}
            onCancel={() => setSigning(false)}
            onSave={(s) => {
              attachments.sign({ for: 'quote', refId: job.id, ...s });
              setSigning(false);
            }}
          />
          {picked ? <OdooQuoteSend job={job} option={picked} signature={signature} /> : null}
        </>
      ) : null}

      {invoice ? (
        <Action
          label={`Open invoice ${invoiceNo(invoice)}`}
          primary
          onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: invoice.id } })}
          testID="quote-open-invoice"
        />
      ) : picked ? (
        <>
          {picked.total !== job.accepted!.total ? (
            <Text style={styles.meta} testID="quote-price-changed">
              Prices have changed since the customer picked {picked.title ?? TIER_LABEL[picked.tier]}: the invoice will be {formatMoney(picked.total)}, not {formatMoney(job.accepted!.total)}.
            </Text>
          ) : null}
          <Action
            label={`Put ${picked.title ?? TIER_LABEL[picked.tier]} on the job ticket`}
            primary
            onPress={() => {
              let n = 0;
              const t = Date.now();
              setTicket(job.id, (prev) => addOption(prev, picked, sheet.odoo, () => newLineId(t + n++)));
              router.push({ pathname: '/ticket/[id]', params: { id: job.id } });
            }}
            testID="quote-to-ticket"
          />
          <Action
            label={`Make invoice for ${formatMoney(picked.total)}`}
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
        </>
      ) : null}
    </View>
  );
}

/** Every Odoo quotation template as a card: tick one or several, see each one's lines and prices, add them to the estimate. */
function TemplateList({ templates, sheet, onAdd }: { templates: TemplateSets; sheet: Pick<PriceSheet, 'taxPercent'>; onAdd: (picked: { name: string; option: QuoteOption }[], separate: boolean) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [find, setFind] = useState('');
  const [separate, setSeparate] = useState(false);
  const all = useMemo(
    () =>
      Object.entries(templates)
        .filter(([, t]) => t.plain)
        .sort((a, b) => a[1].type.localeCompare(b[1].type))
        .map(([key, t]) => ({ key, name: t.type, option: templateQuote(t, sheet).options[0] })),
    [templates, sheet],
  );
  if (all.length === 0) return null;
  const shown = all.filter((t) => t.name.toLowerCase().includes(find.trim().toLowerCase()));
  // In the order they were ticked.
  const chosen = picked.flatMap((k) => all.filter((t) => t.key === k));
  const total = chosen.reduce((n, t) => n + t.option.total, 0);
  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  return (
    <View style={styles.stack} testID="quote-template-picker">
      <Text style={styles.tier}>Quotation templates</Text>
      <Text style={styles.meta}>Tap one or more to see what is in them, then add them to the estimate.</Text>
      {all.length > 6 ? <TextInput value={find} onChangeText={setFind} placeholder="Search templates" placeholderTextColor={colors.muted} accessibilityLabel="Search templates" testID="quote-template-search" style={styles.input} /> : null}
      {shown.map((t) => {
        const on = picked.includes(t.key);
        const real = t.option.lines.filter((l) => !l.display);
        return (
          <Pressable key={t.key} onPress={() => toggle(t.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={`quote-template-${t.key}`} style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && styles.pressed]}>
            <View style={styles.top}>
              <Text style={styles.lineLabel}>
                {on ? '☑' : '☐'} {t.name}
              </Text>
              <Text style={styles.total}>{formatMoney(t.option.total)}</Text>
            </View>
            <Text style={styles.meta}>
              {real.length} {real.length === 1 ? 'line' : 'lines'}
            </Text>
            {on
              ? t.option.lines.map((l, i) =>
                  l.display === 'section' ? (
                    <Text key={i} style={styles.heading}>
                      {l.label}
                    </Text>
                  ) : l.display === 'note' ? (
                    <Text key={i} style={styles.meta}>
                      {l.label}
                    </Text>
                  ) : (
                    <View key={i} style={styles.line}>
                      <Text style={styles.lineLabel}>
                        {l.label}
                        {l.taxable ? ' · taxed' : ''}
                      </Text>
                      <Text style={styles.lineValue}>{formatMoney(l.cents)}</Text>
                    </View>
                  ),
                )
              : null}
            {on && t.option.tax > 0 ? (
              <View style={styles.line}>
                <Text style={styles.meta}>Tax on parts</Text>
                <Text style={styles.meta}>{formatMoney(t.option.tax)}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {shown.length === 0 ? <Text style={styles.meta}>No template matches "{find}".</Text> : null}
      {chosen.length > 1 ? <ChipRow options={[{ label: 'One estimate', value: 'one' as const }, { label: 'Separate estimates', value: 'sep' as const }]} value={separate ? 'sep' : 'one'} onChange={(v) => setSeparate(v === 'sep')} testID="quote-template-mode" /> : null}
      {chosen.length > 0 ? (
        <Action
          label={`Add ${chosen.length === 1 ? chosen[0].name : `${chosen.length} templates`} to the estimate · ${formatMoney(total)}`}
          primary
          onPress={() => {
            onAdd(chosen.map((t) => ({ name: t.name, option: t.option })), separate && chosen.length > 1);
            setPicked([]);
          }}
          testID="quote-template-add"
        />
      ) : null}
    </View>
  );
}

const TAX_OPTIONS = [
  { label: 'Taxed (parts)', value: 'yes' as const },
  { label: 'No tax (labor)', value: 'no' as const },
];

/** Lines added to the quote from the price book (Odoo's products); they go on every option, so a job is never stuck without a quote. */
function TypedLines({ lines, onChange }: { lines: Repair[]; onChange: (lines: Repair[]) => void }) {
  const { book } = usePriceBook();
  const [picking, setPicking] = useState(false);
  const set = (id: string, patch: Partial<Repair>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  return (
    <View style={styles.stack} testID="quote-lines">
      {lines.length > 0 ? <Text style={styles.tier}>Lines from the price book</Text> : null}
      {lines.map((l) => (
        <View key={l.id} style={styles.card} testID={`quote-line-${l.id}`}>
          {l.productId ? (
            <Text style={styles.lineLabel} testID={`quote-line-name-${l.id}`}>
              {l.label}
              {l.taxable ? ' · taxed (part)' : ''}
            </Text>
          ) : (
            <>
              <TextInput value={l.label} onChangeText={(label) => set(l.id, { label })} placeholder="Custom line (not in Odoo)" placeholderTextColor={colors.muted} accessibilityLabel="Line name" testID={`quote-line-name-${l.id}`} style={styles.input} />
              <ChipRow options={TAX_OPTIONS} value={l.taxable ? 'yes' : 'no'} onChange={(v) => set(l.id, { taxable: v === 'yes' })} testID={`quote-line-tax-${l.id}`} />
            </>
          )}
          <MeasureField label="Price" value={l.price} onChange={(price) => set(l.id, { price })} unit="dollars" allowFraction={false} placeholder="Tap to set" testID={`quote-line-price-${l.id}`} />
          <Action label="Remove" onPress={() => onChange(lines.filter((x) => x.id !== l.id))} testID={`quote-line-remove-${l.id}`} />
        </View>
      ))}
      <Action label="Add from the price book" onPress={() => setPicking(true)} testID="quote-line-add" />
      <Pressable onPress={() => onChange([...lines, { id: `q-${Date.now().toString(36)}-${lines.length}`, label: '', price: '', taxable: false }])} accessibilityRole="button" testID="quote-line-custom" style={styles.customLink}>
        <Text style={styles.customText}>Or type a custom line</Text>
      </Pressable>
      <PriceBookPicker
        visible={picking}
        items={book.items}
        onClose={() => setPicking(false)}
        onPick={(i) => {
          setPicking(false);
          onChange([...lines, { id: `q-${Date.now().toString(36)}-${lines.length}`, label: i.name, price: (i.cents / 100).toFixed(2).replace(/\.00$/, ''), taxable: i.kind === 'material', productId: i.id }]);
        }}
      />
    </View>
  );
}

function OptionCard({ option, accepted, onAccept }: { option: QuoteOption; accepted: boolean; onAccept: () => void }) {
  const label = option.title ?? TIER_LABEL[option.tier];
  if (!option.available) {
    return (
      <View style={[styles.card, styles.cardOff]} testID={`quote-${option.key ?? option.tier}`}>
        <Text style={styles.tier}>{label}</Text>
        <Text style={styles.meta}>{option.reason}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.card, accepted && styles.cardOn]} testID={`quote-${option.key ?? option.tier}`}>
      <View style={styles.top}>
        <Text style={styles.tier}>{label}</Text>
        <Text style={styles.total} testID={`quote-total-${option.key ?? option.tier}`}>
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
          <Text style={[styles.lineLabel, l.display === 'section' && { fontWeight: '800' }]}>{l.label}</Text>
          {l.display ? null : <Text style={styles.lineValue}>{l.cents > 0 ? formatMoney(l.cents) : '—'}</Text>}
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
        testID={`quote-accept-${option.key ?? option.tier}`}
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
  for: { fontSize: type.value, fontWeight: '800', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  notice: { padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.warnBg, gap: 8 },
  stop: { backgroundColor: colors.stop, borderColor: colors.stop },
  onStop: { color: colors.onStop },
  noticeTitle: { fontSize: type.value, fontWeight: '800', color: colors.text },
  noticeBody: { fontSize: type.body, color: colors.text, lineHeight: 24 },
  card: { padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, gap: 8 },
  cardOn: { borderWidth: 4, backgroundColor: colors.card },
  cardOff: { borderStyle: 'dashed' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  tier: { fontSize: type.value, fontWeight: '800', color: colors.text },
  total: { fontSize: type.big, fontWeight: '800', color: colors.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  heading: { fontSize: type.body, fontWeight: '800', color: colors.text, marginTop: 6 },
  customLink: { minHeight: touch.min, justifyContent: 'center', alignItems: 'center' },
  customText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  lineLabel: { flex: 1, fontSize: type.body, color: colors.text },
  lineValue: { fontSize: type.body, fontWeight: '800', color: colors.text },
  button: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.card },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
  input: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  thumbs: { flexDirection: 'row', gap: 8 },
  thumb: { width: 88, height: 88, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
});
