import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionTitle } from '../components/controls';
import { createMissingSurveys, SurveyKind, surveyState, SurveyState } from '../lib/odooSurveys';
import { isOwner } from '../lib/scorecard';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

const NAME: Record<SurveyKind, string> = { door: 'Garage door inspection', opener: 'Opener inspection', gate: 'Gate inspection' };

/**
 * The inspection checklists as Odoo Surveys. Shows whether the Survey app is
 * installed and which of the three surveys exist; the owner can create any
 * that are missing from the app's built-in checklist.
 */
export function ChecklistsScreen() {
  const { client, status } = useOdoo();
  const signedIn = status === 'signedIn' && !!client;
  const [state, setState] = useState<SurveyState | null>(null);
  const [owner, setOwner] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setState(await surveyState(client));
      setMsg('');
    } catch (e) {
      setMsg(`Couldn't check Odoo: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [client]);

  useEffect(() => {
    if (!signedIn || !client) return;
    let alive = true;
    load();
    isOwner(client).then((ok) => alive && setOwner(ok));
    return () => {
      alive = false;
    };
  }, [signedIn, client, load]);

  const create = async () => {
    if (!client || busy) return;
    setBusy(true);
    try {
      const made = await createMissingSurveys(client);
      setMsg(made.length ? `Created in Odoo: ${made.map((k) => NAME[k]).join(', ')}.` : 'Nothing to create.');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn) return <Text style={styles.note} testID="checklists-signin">Sign in to Odoo to see the inspection checklists there.</Text>;
  return (
    <View style={styles.stack} testID="checklists">
      <Text style={styles.note}>The garage door and gate checklists are kept in Odoo as Surveys. Each signed inspection is saved there once this is set up; the PDF report still goes to the job.</Text>
      {!state ? (
        <Text style={styles.note}>{msg || 'Checking Odoo...'}</Text>
      ) : !state.installed ? (
        <Text style={styles.warn} testID="checklists-not-installed">The Survey app isn't installed in Odoo. Install it from Apps, then come back.</Text>
      ) : (
        <>
          <SectionTitle first>Surveys in Odoo</SectionTitle>
          {SURVEY_ORDER.map((k) => {
            const f = state.found.find((x) => x.kind === k);
            return (
              <View key={k} style={styles.card} testID={`checklist-${k}`}>
                <Text style={styles.title}>{NAME[k]}</Text>
                <Text style={styles.meta}>{f ? `Ready${f.questions ? `, ${f.questions} questions` : ''}` : 'Not made yet'}</Text>
              </View>
            );
          })}
          {state.missing.length && owner === true ? (
            <Pressable onPress={create} disabled={busy} accessibilityRole="button" style={styles.button} testID="checklists-create">
              <Text style={styles.buttonText}>{busy ? 'Creating...' : 'Create the missing surveys in Odoo'}</Text>
            </Pressable>
          ) : state.missing.length ? (
            <Text style={styles.note}>Ask the owner to create the missing surveys.</Text>
          ) : (
            <Text style={styles.note}>Change questions in Odoo, under Surveys.</Text>
          )}
        </>
      )}
      {msg && state ? (
        <Text style={styles.note} testID="checklists-msg" accessibilityLiveRegion="polite">{msg}</Text>
      ) : null}
    </View>
  );
}

const SURVEY_ORDER: SurveyKind[] = ['door', 'opener', 'gate'];

const styles = StyleSheet.create({
  stack: { gap: 10 },
  note: { fontSize: type.body, color: colors.muted },
  warn: { fontSize: type.body, fontWeight: '700', color: colors.stop },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 2 },
  title: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: type.body, color: colors.muted },
  button: { minHeight: touch.min, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: type.body, fontWeight: '700', color: colors.onSelected },
});
