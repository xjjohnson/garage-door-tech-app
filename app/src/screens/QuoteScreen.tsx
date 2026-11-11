import { useMemo } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { formatJobDate, Job, jobName } from '../lib/jobs';
import { formatNumber } from '../lib/measure';
import { formatMoney, hasPrices, TIER_CYCLES, TIER_LABEL } from '../lib/prices';
import { buildQuote, QuoteOption, quoteText } from '../lib/quote';
import { formatLife } from '../lib/springNames';
import { useJobs } from '../lib/useJobs';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type } from '../theme';

/**
 * Good, better and best for one saved job, priced from the price sheet. The
 * tech can send it to the customer and record which option they picked.
 */
export function QuoteScreen({ job, onSetPrices }: { job: Job; onSetPrices: () => void }) {
  const { sheet } = usePriceSheet();
  const { setAccepted } = useJobs();
  const quote = useMemo(() => buildQuote(job, sheet), [job, sheet]);
  const priced = hasPrices(sheet);

  return (
    <View style={styles.stack} testID="quote">
      <Text style={styles.for}>
        {jobName(job)}
        {job.customer && job.address ? `, ${job.address}` : ''}
      </Text>
      <Text style={styles.meta}>{job.summaryTitle}</Text>

      {!priced ? (
        <View style={styles.notice} testID="quote-no-prices">
          <Text style={styles.noticeTitle}>Set your prices first</Text>
          <Text style={styles.noticeBody}>The options below show $0 until the price sheet has your prices.</Text>
          <Action label="Open the price sheet" primary onPress={onSetPrices} testID="quote-set-prices" />
        </View>
      ) : null}

      {quote.blocked ? (
        <View style={[styles.notice, styles.stop]} testID="quote-blocked">
          <Text style={[styles.noticeTitle, styles.onStop]}>No quote yet</Text>
          <Text style={[styles.noticeBody, styles.onStop]}>{quote.blocked}. Open the job in the calculator to fix it.</Text>
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
        <Text style={styles.meta} testID="quote-accepted-note">
          Customer picked {TIER_LABEL[job.accepted.tier]} at {formatMoney(job.accepted.total)} on {formatJobDate(job.accepted.at)}.
        </Text>
      ) : null}

      {quote.options.some((o) => o.available) ? (
        <>
          <Action
            label="Send to customer"
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
  const label = TIER_LABEL[option.tier];
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
      <Text style={styles.meta}>
        For {formatNumber(TIER_CYCLES[option.tier])}+ cycles · these springs are rated {option.spring ? formatLife(option.spring.life) : '?'}
      </Text>
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
});
