import { ReactNode, useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { colors, radius, touch, type, bw, fs } from '../theme';

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

export function Card({ children, warn, testID }: { children: ReactNode; warn?: boolean; testID?: string }) {
  return (
    <View style={[styles.card, warn && styles.warn]} testID={testID}>
      {children}
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
    <View style={{ gap: 4 }}>
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
  msg: { fontSize: fs(16), fontWeight: '800', color: colors.text, lineHeight: 22 },
  bad: { color: colors.stop },
  card: { padding: 12, gap: 8, borderRadius: radius.card, backgroundColor: colors.card },
  warn: { borderWidth: bw(3), borderColor: colors.caution },
  title: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  parts: { fontSize: fs(16), fontWeight: '700', color: colors.text },
  note: { fontSize: fs(16), color: colors.text, lineHeight: 22 },
  input: { minHeight: touch.min - 8, borderRadius: radius.field, borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: 12, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  wide: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
});
