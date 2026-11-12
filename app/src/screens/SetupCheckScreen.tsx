import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Action } from '../components/Buttons';
import { CheckResult, runSetupCheck, setupSummary } from '../lib/setupCheck';
import { useOdoo } from '../lib/useOdoo';
import { colors, type } from '../theme';

const MARK: Record<CheckResult['state'], string> = { ok: '✓', missing: '✗', warn: '!' };

/** Checks what this version needs in Odoo and says how to fix what's missing. Read-only. */
export function SetupCheckScreen() {
  const { client, status } = useOdoo();
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  const check = useCallback(async () => {
    const n = ++run.current;
    setBusy(true);
    const r = await runSetupCheck(client).catch((): CheckResult[] => [{ id: 'error', label: 'Odoo', state: 'missing', detail: "Couldn't reach Odoo.", fix: 'Check the signal and try again.' }]);
    if (n !== run.current) return;
    setResults(r);
    setBusy(false);
  }, [client]);

  useEffect(() => {
    if (status !== 'loading' && status !== 'signingIn') check();
  }, [status, check]);

  return (
    <View style={styles.stack} testID="setup-check">
      <Text style={styles.note}>What this version of the app needs in Odoo. Nothing in Odoo is changed here.</Text>
      {results ? (
        <Text style={styles.summary} testID="setup-summary">
          {setupSummary(results)}
        </Text>
      ) : null}
      {(results ?? []).map((r) => (
        <View key={r.id} style={styles.row} testID={`setup-${r.id}`}>
          <Text style={[styles.mark, r.state === 'ok' ? styles.ok : r.state === 'missing' ? styles.bad : styles.warn]} testID={`setup-${r.id}-${r.state}`}>
            {MARK[r.state]}
          </Text>
          <View style={styles.body}>
            <Text style={styles.label}>{r.label}</Text>
            <Text style={styles.detail}>{r.detail}</Text>
            {r.fix ? <Text style={styles.fix}>{r.fix}</Text> : null}
          </View>
        </View>
      ))}
      <Action label={busy ? 'Checking...' : 'Check again'} disabled={busy} onPress={check} testID="setup-recheck" />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  note: { fontSize: type.body, color: colors.muted, fontWeight: '600' },
  summary: { fontSize: type.value, fontWeight: '900', color: colors.text },
  row: { flexDirection: 'row', gap: 12, borderWidth: 2, borderColor: colors.border, borderRadius: 14, padding: 12 },
  mark: { width: 32, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  ok: { color: colors.ok },
  bad: { color: colors.stop },
  warn: { color: colors.text },
  body: { flex: 1, gap: 2 },
  label: { fontSize: type.label, fontWeight: '900', color: colors.text },
  detail: { fontSize: 16, fontWeight: '700', color: colors.muted },
  fix: { fontSize: 16, fontWeight: '600', color: colors.text },
});
