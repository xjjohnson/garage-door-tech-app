import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Action } from './Buttons';
import { Card, Meta, Note, Title } from './Dept';
import { colors, fs, radius, sp } from '../theme';

/** A row on one of the Office or Sales lists: who and what, a few lines, and the buttons that apply. */
export interface RowAction {
  label: string;
  primary?: boolean;
  onPress: () => void;
  disabled?: boolean;
}
export interface RowItem {
  key: string;
  title: string;
  sub?: string;
  lines?: string[];
  /** A line shown in red (how late). */
  bad?: string;
  /** Table rows: the dollar amount on the right, and the age line ("Quiet 6 days"). */
  amount?: string;
  age?: string;
  actions?: RowAction[];
}

export function RowList({ rows, empty, header, testID, table }: { rows: RowItem[] | null; empty: string; header?: ReactNode; testID?: string; table?: boolean }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (rows === null) return <Note>Reading Odoo…</Note>;
  if (table) {
    // The desk table: one tight line per row (who, dollars, age). Tapping a row opens its buttons.
    return (
      <View style={styles.stack} testID={testID}>
        {header}
        {rows.length === 0 ? <Note testID={testID ? `${testID}-empty` : undefined}>{empty}</Note> : null}
        {rows.length > 0 ? (
          <View style={styles.table}>
            {rows.map((r, i) => {
              const on = openKey === r.key;
              return (
                <View key={r.key} testID={`row-${r.key}`} style={[i > 0 && styles.tline, on && styles.tOpen]}>
                  <Pressable onPress={() => setOpenKey(on ? null : r.key)} accessibilityRole="button" accessibilityState={{ expanded: on }} accessibilityLabel={`${r.title}${r.amount ? `, ${r.amount}` : ''}`} testID={`row-${r.key}-toggle`} style={styles.trow}>
                    <View style={styles.tmain}>
                      <Text style={styles.tname} numberOfLines={1}>{r.title}</Text>
                      <Text style={[styles.tsub, r.bad ? styles.bad : null]} numberOfLines={1}>{[r.sub, r.bad ?? r.age ?? r.lines?.[0]].filter(Boolean).join(' · ')}</Text>
                    </View>
                    {r.amount ? <Text style={styles.tamt}>{r.amount}</Text> : null}
                  </Pressable>
                  {on ? (
                    <View style={styles.tdetail}>
                      {r.lines?.map((l, j) => (
                        <Text key={j} style={styles.line}>{l}</Text>
                      ))}
                      {r.actions?.length ? (
                        <View style={styles.actions}>
                          {r.actions.map((a) => (
                            <Action key={a.label} label={a.label} primary={a.primary} disabled={a.disabled} onPress={a.onPress} testID={`row-${r.key}-${a.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.stack} testID={testID}>
      {header}
      {rows.length === 0 ? <Note testID={testID ? `${testID}-empty` : undefined}>{empty}</Note> : null}
      {rows.map((r) => (
        <Card key={r.key} testID={`row-${r.key}`}>
          <Title>{r.title}</Title>
          {r.sub ? <Meta>{r.sub}</Meta> : null}
          {r.lines?.map((l, i) => (
            <Text key={i} style={styles.line}>
              {l}
            </Text>
          ))}
          {r.bad ? <Text style={styles.bad}>{r.bad}</Text> : null}
          {r.actions?.length ? (
            <View style={styles.actions}>
              {r.actions.map((a) => (
                <Action key={a.label} label={a.label} primary={a.primary} disabled={a.disabled} onPress={a.onPress} testID={`row-${r.key}-${a.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} />
              ))}
            </View>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

/** Reads a page from Odoo when it opens (and again on reload). `rows` is null while reading; an Odoo refusal is an `error` text, not a crash. */
export function usePageRows<T>(read: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const [tick, setTick] = useState(0);
  const fn = useRef(read);
  fn.current = read;
  useEffect(() => {
    let alive = true;
    fn.current().then(
      (data) => alive && setState({ data, error: null }),
      (e) => alive && setState({ data: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data: state.data, error: state.error, reload };
}

export const PageError = ({ what, error }: { what: string; error: string }) => (
  <Card warn testID="page-error">
    <Title>{what}</Title>
    <Note>Odoo wouldn't show this to your login, or it couldn't be reached: {error}</Note>
  </Card>
);

const styles = StyleSheet.create({
  stack: { gap: sp(10) },
  line: { fontSize: fs(16), color: colors.text, lineHeight: fs(22) },
  bad: { fontSize: fs(16), fontWeight: '800', color: colors.stop },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(8) },
  table: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  tline: { borderTopWidth: 1, borderTopColor: colors.line },
  tOpen: { backgroundColor: colors.info },
  trow: { flexDirection: 'row', alignItems: 'center', gap: sp(10), paddingHorizontal: sp(12), paddingVertical: sp(10), minHeight: 44 },
  tmain: { flex: 1, gap: sp(1) },
  tname: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  tsub: { fontSize: fs(13), color: colors.muted },
  tamt: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  tdetail: { paddingHorizontal: sp(12), paddingBottom: sp(10), gap: sp(8) },
});
