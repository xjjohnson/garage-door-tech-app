import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Action } from './Buttons';
import { Card, Meta, Note, Title } from './Dept';
import { colors } from '../theme';

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
  actions?: RowAction[];
}

export function RowList({ rows, empty, header, testID }: { rows: RowItem[] | null; empty: string; header?: ReactNode; testID?: string }) {
  if (rows === null) return <Note>Reading Odoo…</Note>;
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
  stack: { gap: 10 },
  line: { fontSize: 16, color: colors.text, lineHeight: 22 },
  bad: { fontSize: 16, fontWeight: '800', color: colors.stop },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
