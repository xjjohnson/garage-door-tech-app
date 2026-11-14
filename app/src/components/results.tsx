import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatInches, formatNumber } from '../lib/measure';
import { expectedLife, formatLife, springName } from '../lib/springNames';
import { useFollowUps } from '../lib/useFollowUps';
import { MeasureField } from './controls';
import { findWire, SpringSpec, Warning } from '../springCalc';
import { colors, type } from '../theme';

export const SAFETY_TEXT =
  "Torsion springs store enough energy to cause serious injury. Results are estimates from published charts and must be checked against the spring maker's data. Only trained technicians should wind or unwind springs. Use proper winding bars, never screwdrivers.";

export const EXTENSION_SAFETY_TEXT =
  "Extension springs under tension can snap and fly across the garage. Open the door fully and clamp the track before taking a spring off, and never run a door without a safety cable through every spring. Results are estimates from published charts; check them against the door maker's data. Only trained technicians should replace springs.";

/** Always shown above the results. It has no close button on purpose. */
export function SafetyBanner({ text = SAFETY_TEXT }: { text?: string }) {
  return (
    <View style={styles.safety} testID="safety-banner" accessibilityRole="alert">
      <Text style={styles.safetyTitle}>⚠ SAFETY</Text>
      <Text style={styles.safetyText}>{text}</Text>
    </View>
  );
}

const LEVEL = {
  stop: { label: 'STOP', box: { backgroundColor: colors.stop, borderColor: colors.stop }, text: { color: colors.onStop } },
  caution: { label: 'CHECK', box: { backgroundColor: colors.caution, borderColor: colors.border }, text: { color: colors.text } },
  info: { label: 'NOTE', box: { backgroundColor: colors.info, borderColor: colors.info }, text: { color: colors.text } },
} as const;

/** Every warning the math returned, worst first. None of them can be hidden. */
export function Warnings({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  const order = { stop: 0, caution: 1, info: 2 } as const;
  const sorted = [...warnings].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <View style={styles.stack}>
      {sorted.map((w, i) => {
        const l = LEVEL[w.level];
        return (
          <View key={i} style={[styles.warning, l.box]} testID={`warning-${w.level}`}>
            <Text style={[styles.warningLabel, l.text]}>{l.label}</Text>
            <Text style={[styles.warningText, l.text]}>{w.message}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return <Warnings warnings={[{ level: 'stop', message }]} />;
}

export function MissingCard({ missing }: { missing: string[] }) {
  return (
    <View style={styles.missing} testID="missing">
      <Text style={styles.missingTitle}>To see results, enter:</Text>
      {missing.map((m) => (
        <Text key={m} style={styles.missingItem}>
          • {m}
        </Text>
      ))}
    </View>
  );
}

export function Card({ title, children, testID }: { title?: string; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.card} testID={testID}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** Label on the left, value on the right, in large type. */
export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statRight}>
        <Text style={styles.statValue}>{value}</Text>
        {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

// Moved to lib so quotes can use them; kept exported here for the screens.
export { formatLife, springName };

export function wireColor(wireIn: number): string | undefined {
  return findWire(wireIn)?.color;
}

export function lbRange(r: { low: number; high: number }): string {
  return `${formatNumber(r.low)}–${formatNumber(r.high)} lb`;
}

/** How many times a day the door is used: sets the expected life shown under each spring's cycle rating. */
export function UsesPerDay() {
  const { settings, setSettings } = useFollowUps();
  return (
    <MeasureField
      label="Door uses a day"
      hint="About 4 is typical for a home. Sets each spring's expected life and the follow-ups."
      value={String(settings.cyclesPerDay)}
      onChange={(v) => {
        const n = Number.parseFloat(v);
        if (Number.isFinite(n) && n > 0) setSettings((s) => ({ ...s, cyclesPerDay: n }));
      }}
      unit="a day"
      allowFraction={false}
      testID="uses-per-day"
    />
  );
}

/** One spring: its name in big type, then rate, life, growth and weight. */
export function SpringDetails({ spec, children }: { spec: SpringSpec; children?: ReactNode }) {
  const color = wireColor(spec.wireIn);
  const uses = useFollowUps().settings.cyclesPerDay;
  return (
    <View style={styles.spring}>
      <Text style={styles.springName}>{springName(spec)}</Text>
      {color ? <Text style={styles.springColor}>Wire color code: {color}</Text> : null}
      <Stat label="Rate" value={`${spec.ippt.toFixed(1)} IPPT`} />
      <Stat
        label="Cycle rating"
        value={formatLife(spec.life)}
        sub={spec.makerChartLife.cycles > spec.life.cycles && !spec.life.belowMinimum ? `maker chart: ${formatLife(spec.makerChartLife)}` : undefined}
      />
      <Stat label="Expected life" value={expectedLife(spec.life, uses)} />
      <Stat label="Grows when wound" value={formatInches(spec.growthIn)} />
      <Stat label="Weight each" value={`${spec.weightLb.toFixed(1)} lb`} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  safety: { backgroundColor: colors.safety, borderWidth: 3, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 4 },
  safetyTitle: { fontSize: type.body, fontWeight: '900', color: colors.text },
  safetyText: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 24 },
  warning: { borderWidth: 2, borderRadius: 10, padding: 12, gap: 2 },
  warningLabel: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  warningText: { fontSize: type.body, fontWeight: '700', lineHeight: 25 },
  missing: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 10, padding: 12, gap: 4 },
  missingTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  missingItem: { fontSize: type.body, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 2, borderColor: colors.border, padding: 14, gap: 10 },
  cardTitle: { fontSize: type.value, fontWeight: '900', color: colors.text },
  stat: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  // The number never breaks across lines; the label wraps instead.
  statLabel: { fontSize: type.body, fontWeight: '600', color: colors.muted, flex: 1, paddingTop: 2 },
  statRight: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '62%' },
  statValue: { fontSize: type.value, fontWeight: '800', color: colors.text, textAlign: 'right' },
  statSub: { fontSize: 15, color: colors.muted, textAlign: 'right' },
  spring: { gap: 6, paddingTop: 4 },
  springName: { fontSize: type.big, fontWeight: '900', color: colors.text },
  springColor: { fontSize: 16, fontWeight: '700', color: colors.muted },
});
