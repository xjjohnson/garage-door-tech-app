import { ReactNode, useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { colors, radius, touch, type, bw, fs, sp } from '../theme';

/** Small pieces the Warehouse and Purchasing screens share. */

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface Msg {
  text: string;
  bad?: boolean;
}

/** Runs one Odoo action at a time: `busy` names the one running, `msg` is what to tell the person after. */
export function useRun() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<string | Msg>) => {
    setBusy(key);
    setMsg(null);
    try {
      const m = await fn();
      setMsg(typeof m === 'string' ? { text: m } : m);
    } catch (e) {
      setMsg({ text: errText(e), bad: true });
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, msg, run, setMsg };
}

export function Message({ msg, testID }: { msg: Msg | null; testID?: string }) {
  if (!msg) return null;
  return (
    <Text style={[styles.msg, msg.bad && styles.bad]} testID={testID ?? 'dept-message'}>
      {msg.text}
    </Text>
  );
}

export type Tone = 'bad' | 'warn' | 'ok' | 'plain';

/** A white card. `edge` paints a colored strip down its left side (red: act now, amber: watch, green: fine) so a list reads at a glance. */
export function Card({ children, warn, edge, testID }: { children: ReactNode; warn?: boolean; edge?: Tone; testID?: string }) {
  return (
    <View style={[styles.card, warn && styles.warn, edge && edge !== 'plain' && { borderLeftWidth: bw(6), borderLeftColor: toneColor(edge) }]} testID={testID}>
      {children}
    </View>
  );
}

const toneColor = (t: Tone) => (t === 'bad' ? colors.stop : t === 'warn' ? colors.caution : t === 'ok' ? colors.ok : colors.border);

/** A short status label: Late 3 days, Draft, Counted. */
export function Pill({ text, tone = 'plain', testID }: { text: string; tone?: Tone; testID?: string }) {
  const bg = tone === 'bad' ? colors.stop : tone === 'warn' ? colors.warnBg : tone === 'ok' ? colors.info : colors.line;
  const fg = tone === 'bad' ? colors.onStop : tone === 'warn' ? colors.warn : tone === 'ok' ? colors.ok : colors.muted;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} testID={testID}>
      <Text style={[styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/** A title with a status pill on its right. */
export function TitleRow({ title, pill, tone, testID }: { title: string; pill?: string; tone?: Tone; testID?: string }) {
  return (
    <View style={styles.titleRow}>
      <Text style={[styles.title, styles.titleGrow]}>{title}</Text>
      {pill ? <Pill text={pill} tone={tone} testID={testID} /> : null}
    </View>
  );
}

/** Big numbers across the top: what needs a look. A number above zero in a red or amber tile reads as work to do. */
export function Tiles({ items, testID }: { items: { value: string | number; label: string; tone?: Tone; onPress?: () => void; testID?: string }[]; testID?: string }) {
  return (
    <View style={styles.tiles} testID={testID}>
      {items.map((t) => (
        <Pressable key={t.label} onPress={t.onPress} disabled={!t.onPress} accessibilityRole={t.onPress ? 'button' : undefined} accessibilityLabel={`${t.value} ${t.label}`} testID={t.testID} style={styles.tile}>
          <Text style={[styles.tileValue, { color: t.tone === 'bad' ? colors.stop : t.tone === 'warn' ? colors.warn : t.tone === 'ok' ? colors.ok : colors.text }]}>{String(t.value)}</Text>
          <Text style={styles.tileLabel}>{t.label.toUpperCase()}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const Title = ({ children }: { children: ReactNode }) => <Text style={styles.title}>{children}</Text>;
export const Meta = ({ children, bad }: { children: ReactNode; bad?: boolean }) => <Text style={[styles.meta, bad && styles.bad]}>{children}</Text>;
export const Note = ({ children, testID }: { children: ReactNode; testID?: string }) => (
  <Text style={styles.note} testID={testID}>
    {children}
  </Text>
);

/**
 * The parts on an order in one short line ("2 x Spring, 1 x Cable, +3 more"),
 * tap it to open the full list. Kept compact so a list of orders stays short.
 */
export function PartsSummary({ items, testID, children }: { items: { name: string; qty: number; extra?: string }[]; testID?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return <Meta>No parts on it yet</Meta>;
  const short = items.slice(0, 2).map((i) => `${i.qty} × ${i.name}`).join(', ') + (items.length > 2 ? `, +${items.length - 2} more` : '');
  return (
    <View style={{ gap: sp(4) }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={open ? 'Hide the parts' : 'Show all the parts'} testID={testID}>
        <Text style={styles.parts}>{open ? 'Parts (tap to close)' : `${short} ▾`}</Text>
      </Pressable>
      {open ? items.map((i, n) => <Meta key={n}>{`${i.qty} × ${i.name}${i.extra ? ` · ${i.extra}` : ''}`}</Meta>) : null}
      {open ? children : null}
    </View>
  );
}

/** A typed number (whole or with a decimal point). */
export function NumBox({ value, onChange, label, testID, width = 96 }: { value: string; onChange: (v: string) => void; label: string; testID?: string; width?: number }) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))}
      keyboardType="decimal-pad"
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={colors.muted}
      testID={testID}
      style={[styles.input, { width }]}
    />
  );
}

export function TextBox({ value, onChange, label, testID }: { value: string; onChange: (v: string) => void; label: string; testID?: string }) {
  return <TextInput value={value} onChangeText={onChange} accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.muted} testID={testID} style={[styles.input, styles.wide]} />;
}

/** "12.5" to a number, or null when empty or not a number. */
export const toNum = (s: string): number | null => {
  const n = parseFloat(s);
  return s.trim() === '' || Number.isNaN(n) ? null : n;
};

export const money = (c: number) => `$${(c / 100).toFixed(2)}`;
/** Dollars typed ("12.5") to cents, or null. */
export const toCents = (s: string): number | null => {
  const n = toNum(s);
  return n === null ? null : Math.round(n * 100);
};

export const dateText = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'never');

export const Row = ({ children }: { children: ReactNode }) => <View style={styles.row}>{children}</View>;

const styles = StyleSheet.create({
  msg: { fontSize: fs(16), fontWeight: '800', color: colors.text, lineHeight: fs(22) },
  bad: { color: colors.stop },
  card: { padding: sp(12), gap: sp(8), borderRadius: radius.card, backgroundColor: colors.card },
  warn: { borderWidth: bw(3), borderColor: colors.caution },
  title: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  parts: { fontSize: fs(16), fontWeight: '700', color: colors.text },
  note: { fontSize: fs(16), color: colors.text, lineHeight: fs(22) },
  input: { minHeight: touch.min - 8, borderRadius: radius.field, borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(12), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  wide: { alignSelf: 'stretch' },
  pill: { borderRadius: radius.card, paddingHorizontal: sp(8), paddingVertical: sp(2) },
  pillText: { fontSize: fs(12), fontWeight: '800' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(8), justifyContent: 'space-between' },
  titleGrow: { flex: 1 },
  tiles: { flexDirection: 'row', gap: sp(8) },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius.card, paddingVertical: sp(10), paddingHorizontal: sp(4), alignItems: 'center', gap: sp(2) },
  tileValue: { fontSize: fs(28), fontWeight: '800' },
  tileLabel: { fontSize: fs(11), fontWeight: '800', color: colors.muted, textAlign: 'center' },
  row: { flexDirection: 'row', gap: sp(8), alignItems: 'center', flexWrap: 'wrap' },
});
