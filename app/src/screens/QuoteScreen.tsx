import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { ChipRow } from '../components/controls';
import { Job, jobName } from '../lib/jobs';
import { formatMoney, PriceSheet } from '../lib/prices';
import { QuoteOption } from '../lib/quote';
import { addEstimate } from '../lib/estimates';
import { addOption, newLineId, Ticket } from '../lib/ticket';
import { templateQuote, TemplateSets } from '../lib/odooTemplates';
import { useQuoteTemplates } from '../lib/useQuoteTemplates';
import { useJobs } from '../lib/useJobs';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type, bw, fs, rad } from '../theme';

/**
 * The Templates screen: every Odoo quotation template in a list. Tick one or
 * several, see them laid out together, and add them to the estimate (as one
 * estimate, or each as its own).
 */
export function QuoteScreen({ job }: { job: Job }) {
  const { sheet } = usePriceSheet();
  const { setTicket, setEstimates } = useJobs();
  const templates = useQuoteTemplates();

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

  return (
    <View style={styles.stack} testID="quote">
      <Text style={styles.for}>
        {jobName(job)}
        {job.customer && job.address ? `, ${job.address}` : ''}
      </Text>
      <Text style={styles.meta}>{job.summaryTitle}</Text>
      <TemplateList templates={templates} sheet={sheet} onAdd={addTemplates} />
    </View>
  );
}

/** Every Odoo quotation template: tick one or several; the ticked ones are laid out together below, ready to add to the estimate. */
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
  if (all.length === 0) {
    return (
      <Text style={styles.meta} testID="quote-no-templates">
        No quotation templates found in Odoo yet.
      </Text>
    );
  }
  const shown = all.filter((t) => t.name.toLowerCase().includes(find.trim().toLowerCase()));
  // In the order they were ticked.
  const chosen = picked.flatMap((k) => all.filter((t) => t.key === k));
  const total = chosen.reduce((n, t) => n + t.option.total, 0);
  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  return (
    <View style={styles.stack} testID="quote-template-picker">
      <Text style={styles.tier}>Quotation templates</Text>
      <Text style={styles.meta}>Tap one or more. They show up below so you can see what is in them.</Text>
      {all.length > 6 ? <TextInput value={find} onChangeText={setFind} placeholder="Search templates" placeholderTextColor={colors.muted} accessibilityLabel="Search templates" testID="quote-template-search" style={styles.input} /> : null}
      {shown.map((t) => {
        const on = picked.includes(t.key);
        const count = t.option.lines.filter((l) => !l.display).length;
        return (
          <Pressable key={t.key} onPress={() => toggle(t.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={`quote-template-${t.key}`} style={({ pressed }) => [styles.pick, on && styles.cardOn, pressed && styles.pressed]}>
            <Text style={styles.lineLabel}>
              {on ? '☑' : '☐'} {t.name}
            </Text>
            <Text style={styles.meta}>
              {count} {count === 1 ? 'line' : 'lines'} · {formatMoney(t.option.total)}
            </Text>
          </Pressable>
        );
      })}
      {shown.length === 0 ? <Text style={styles.meta}>No template matches "{find}".</Text> : null}

      {chosen.length > 0 ? (
        <View style={styles.stack} testID="quote-selected">
          <Text style={styles.tier}>Selected ({chosen.length})</Text>
          {chosen.map((t) => (
            <View key={t.key} style={styles.sheet} testID={`quote-selected-${t.key}`}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{t.name}</Text>
                <Text style={styles.sheetTotal}>{formatMoney(t.option.total)}</Text>
              </View>
              <View style={styles.sheetBody}>
                {t.option.lines.map((l, i) =>
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
                )}
                {t.option.tax > 0 ? (
                  <View style={styles.line}>
                    <Text style={styles.meta}>Tax on parts</Text>
                    <Text style={styles.meta}>{formatMoney(t.option.tax)}</Text>
                  </View>
                ) : null}
              </View>
              <Pressable onPress={() => toggle(t.key)} accessibilityRole="button" accessibilityLabel={`Remove ${t.name}`} testID={`quote-selected-remove-${t.key}`} style={styles.sheetFoot}>
                <Text style={styles.customText}>Remove</Text>
              </Pressable>
            </View>
          ))}
          {chosen.length > 1 && !separate ? (
            <View style={styles.line} testID="quote-selected-total">
              <Text style={styles.tier}>All together</Text>
              <Text style={styles.total}>{formatMoney(total)}</Text>
            </View>
          ) : null}
          {chosen.length > 1 ? <ChipRow options={[{ label: 'One estimate', value: 'one' as const }, { label: 'Separate estimates', value: 'sep' as const }]} value={separate ? 'sep' : 'one'} onChange={(v) => setSeparate(v === 'sep')} testID="quote-template-mode" /> : null}
          <Action
            label={chosen.length > 1 && separate ? `Add ${chosen.length} separate estimates` : `Add ${chosen.length === 1 ? chosen[0].name : `${chosen.length} templates`} to the estimate · ${formatMoney(total)}`}
            primary
            onPress={() => {
              onAdd(chosen.map((t) => ({ name: t.name, option: t.option })), separate && chosen.length > 1);
              setPicked([]);
            }}
            testID="quote-template-add"
          />
        </View>
      ) : null}
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
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  notice: { padding: 12, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.warnBg, gap: 8 },
  stop: { backgroundColor: colors.stop, borderColor: colors.stop },
  onStop: { color: colors.onStop },
  noticeTitle: { fontSize: type.value, fontWeight: '800', color: colors.text },
  noticeBody: { fontSize: type.body, color: colors.text, lineHeight: 24 },
  card: { padding: 14, borderRadius: rad(12), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card, gap: 8 },
  cardOn: { borderWidth: bw(4), backgroundColor: colors.card },
  cardOff: { borderStyle: 'dashed' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  tier: { fontSize: type.value, fontWeight: '800', color: colors.text },
  total: { fontSize: type.big, fontWeight: '800', color: colors.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  pick: { padding: 14, borderRadius: rad(12), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card, gap: 4 },
  sheet: { borderRadius: rad(16), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.selected },
  sheetTitle: { flex: 1, fontSize: type.value, fontWeight: '800', color: colors.onSelected },
  sheetTotal: { fontSize: type.value, fontWeight: '800', color: colors.onSelected },
  sheetBody: { padding: 14, gap: 8 },
  sheetFoot: { minHeight: touch.min, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  heading: { fontSize: type.body, fontWeight: '800', color: colors.text, marginTop: 6 },
  customLink: { minHeight: touch.min, justifyContent: 'center', alignItems: 'center' },
  customText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  lineLabel: { flex: 1, fontSize: type.body, color: colors.text },
  lineValue: { fontSize: type.body, fontWeight: '800', color: colors.text },
  button: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.card },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
  input: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  thumbs: { flexDirection: 'row', gap: 8 },
  thumb: { width: 88, height: 88, borderRadius: rad(8), borderWidth: bw(1), borderColor: colors.border },
});
