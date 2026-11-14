import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SectionTitle } from '../components/controls';
import { REPORT_SYNC_SINCE_KEY } from '../components/OdooReportSync';
import { surveysToSend } from '../lib/odooSurveyAnswers';
import { getChecklistStatus, subscribeChecklistStatus, getSurveyStatus, loadSurveyStatus, subscribeSurveyStatus } from '../lib/surveyStatus';
import { requestSyncNow } from '../lib/syncNow';
import { useAttachments } from '../lib/useAttachments';
import { useJobs } from '../lib/useJobs';
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
  const { jobs } = useJobs();
  const { signatures } = useAttachments();
  const last = useSyncExternalStore(subscribeSurveyStatus, getSurveyStatus);
  const listLast = useSyncExternalStore(subscribeChecklistStatus, getChecklistStatus);
  const [since, setSince] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    loadSurveyStatus();
    AsyncStorage.getItem(REPORT_SYNC_SINCE_KEY).then((v) => setSince(v && Number.isFinite(Number(v)) ? Number(v) : null)).catch(() => undefined);
  }, []);
  const waiting = since === null ? 0 : surveysToSend(jobs, signatures, since).length;
  const sendNow = async () => {
    setSending(true);
    await requestSyncNow();
    setSending(false);
  };

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
      {state?.installed && !state.missing.length ? (
        <>
          <SectionTitle>Inspection answers</SectionTitle>
          <View style={styles.card} testID="checklists-answers">
            <Text style={styles.title}>{waiting ? `${waiting} signed inspection${waiting === 1 ? '' : 's'} waiting to be saved in Odoo` : 'Nothing waiting'}</Text>
            <Text style={styles.meta} testID="checklists-read">{listLast ? `Checklist, ${new Date(listLast.at).toLocaleTimeString()}: ${listLast.text}` : 'Checklist: not read from Odoo yet on this phone.'}</Text>
            <Text style={styles.meta}>{last ? `${new Date(last.at).toLocaleTimeString()}: ${last.text}` : 'No try yet on this phone. Only inspections signed after the app started sending reports go; sign a new one to test.'}</Text>
          </View>
          <Pressable onPress={sendNow} disabled={sending} accessibilityRole="button" style={styles.button} testID="checklists-send">
            <Text style={styles.buttonText}>{sending ? 'Sending...' : 'Send now'}</Text>
          </Pressable>
        </>
      ) : null}
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
  button: { minHeight: touch.min, borderRadius: 10, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: type.body, fontWeight: '700', color: colors.onSelected },
});
