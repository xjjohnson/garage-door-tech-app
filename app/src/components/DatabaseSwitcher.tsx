import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text, TextInput } from './AppText';
import { Action } from './Buttons';
import { deviceSnapshots } from '../lib/dbSnapshots';
import { dbId, dbLabel, hasSavedSecret, isNotLive, KnownDb, knownDatabases, liveId, secretFor, setLive, switchDatabase, switchWarning } from '../lib/dbSwitch';
import { Fetch, OdooClient, OdooError, cleanUrl, guessDb } from '../lib/odoo';
import { deviceSecrets } from '../lib/secrets';
import type { SecretStore } from '../lib/secrets';
import type { SnapshotStore } from '../lib/dbSwitch';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

interface Props {
  /** What is waiting to send, in words ("2 invoices"), or empty. */
  pendingText: string;
  restart: () => Promise<unknown>;
  fetchFn?: Fetch;
  secrets?: SecretStore;
  snapshots?: SnapshotStore;
}

/**
 * Developer > Database: shows which Odoo database the phone is attached to and
 * moves it to another one (a test copy, or back to live). The phone's own data
 * is kept apart per database; see src/lib/dbSwitch.ts.
 */
export function DatabaseSwitcher({ pendingText, restart, fetchFn, secrets: givenSecrets, snapshots: givenSnaps }: Props) {
  const styles = useStyles();
  const { saved } = useOdoo();
  const secrets = useMemo(() => givenSecrets ?? deviceSecrets(), [givenSecrets]);
  const snapshots = useMemo(() => givenSnaps ?? deviceSnapshots(), [givenSnaps]);
  const doFetch = useMemo<Fetch>(() => fetchFn ?? ((url, init) => fetch(url, init)), [fetchFn]);
  const [known, setKnown] = useState<KnownDb[]>([]);
  const [live, setLiveId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [db, setDb] = useState('');
  const [login, setLogin] = useState('');
  const [secret, setSecret] = useState('');
  const [usesSaved, setUsesSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The checked sign-in, waiting for the "Yes, switch" tap. */
  const [ready, setReady] = useState<{ url: string; db: string; login: string; secret: string } | null>(null);

  const reload = async () => {
    setKnown(await knownDatabases(AsyncStorage));
    setLiveId(await liveId(AsyncStorage));
  };
  useEffect(() => {
    reload();
  }, [saved?.db, saved?.url]);

  // Start the form on the database the phone is attached to now.
  useEffect(() => {
    if (!saved) return;
    setUrl((v) => v || saved.url);
    setDb((v) => v || saved.db);
    setLogin((v) => v || saved.login);
  }, [saved?.db, saved?.url, saved?.login]);

  const here = saved ? dbLabel(saved) : 'Not signed in';
  const notLive = isNotLive(live, saved);
  const current = saved ? dbId(saved) : null;
  const others = saved && !known.some((k) => k.id === current) ? [{ ...saved, id: current as string, lastUsed: 0 }, ...known] : known;

  const pick = async (k: KnownDb) => {
    setUrl(k.url);
    setDb(k.db);
    setLogin(k.login);
    setSecret('');
    setReady(null);
    setError(null);
    setUsesSaved(await hasSavedSecret(secrets, k));
  };

  const check = async () => {
    setError(null);
    const target = { url: cleanUrl(url), db: db.trim(), login: login.trim() };
    if (!target.url || !target.db || !target.login) return setError('Fill in the address, database and email.');
    if (saved && dbId(saved) === dbId(target)) return setError('The phone is already attached to that database.');
    const key = secret || (usesSaved ? ((await secrets.get(secretFor(dbId(target)))) ?? '') : '');
    if (!key) return setError('Type the API key for that database.');
    setBusy(true);
    try {
      // Sign in first. A wrong name or key stops here and changes nothing on the phone.
      await OdooClient.signIn(doFetch, target, key);
      setReady({ ...target, secret: key });
    } catch (e) {
      setError(e instanceof OdooError ? e.message : "Couldn't sign in to that database. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const doSwitch = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await switchDatabase({ storage: AsyncStorage, snapshots, secrets }, saved, ready, ready.secret);
      await restart();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't switch. Nothing was sent anywhere.");
      setBusy(false);
    }
  };

  return (
    <View style={styles.stack} testID="dev-database">
      <View style={[styles.card, notLive && styles.cardWarn]} testID="dev-db-current">
        <Text style={styles.label}>Attached to</Text>
        <Text style={styles.big} testID="dev-db-name">
          {here}
        </Text>
        <Text style={[styles.tag, notLive && styles.tagWarn]} testID="dev-db-tag">
          {notLive ? 'NOT THE LIVE DATABASE. Anything you save goes to this copy only.' : live ? '' : 'No live database marked yet. Switching marks the one you leave as live.'}
        </Text>
      </View>
      {saved && (!live || notLive) ? <Action label="Mark this one as the live database" onPress={() => setLive(AsyncStorage, saved).then(reload)} testID="dev-db-mark-live" /> : null}
      {others.length ? (
        <View style={styles.stack}>
          <Text style={styles.label}>Databases this phone has used</Text>
          {others.map((k) => (
            <Action key={k.id} label={`${dbLabel(k)}${live === k.id ? ' (live)' : ''}${current === k.id ? ' (this phone now)' : ''}`} onPress={() => pick(k)} testID={`dev-db-known-${k.db}`} />
          ))}
        </View>
      ) : null}
      <Text style={styles.label}>Switch to another database</Text>
      <Field label="Odoo address" value={url} onChange={(v) => { setUrl(v); setReady(null); if (!db) setDb(guessDb(v)); }} placeholder="yourcompany.odoo.com" testID="dev-db-url" />
      <Field label="Database" value={db} onChange={(v) => { setDb(v); setReady(null); }} placeholder="yourcompany-test" testID="dev-db-db" />
      <Field label="Email" value={login} onChange={(v) => { setLogin(v); setReady(null); }} placeholder="you@yourcompany.com" testID="dev-db-login" />
      <Field label={usesSaved ? 'API key (saved, leave empty to use it)' : 'API key (or password)'} value={secret} onChange={(v) => { setSecret(v); setReady(null); }} placeholder="API key" secure testID="dev-db-secret" />
      {error ? (
        <Text style={styles.error} testID="dev-db-error">
          {error}
        </Text>
      ) : null}
      {ready ? (
        <View style={[styles.card, styles.cardWarn]} testID="dev-db-confirm">
          <Text style={styles.body}>{`Signed in to ${dbLabel(ready)}. ${switchWarning(pendingText, saved, ready)} The app restarts to switch.`}</Text>
          <Action label={busy ? 'Switching...' : `Yes, switch to ${ready.db}`} primary disabled={busy} onPress={doSwitch} testID="dev-db-go" />
          <Action label="Cancel" onPress={() => setReady(null)} testID="dev-db-cancel" />
        </View>
      ) : (
        <Action label={busy ? 'Checking...' : 'Check and switch'} primary disabled={busy} onPress={check} testID="dev-db-check" />
      )}
      <Text style={styles.meta}>Each database keeps its own copy of the phone's data (jobs, customers, invoices, anything not sent yet). Nothing from one is ever sent to another.</Text>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, secure, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; secure?: boolean; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} secureTextEntry={secure} accessibilityLabel={label} testID={testID} style={styles.input} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  field: { gap: sp(4) },
  card: { borderRadius: rad(16), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card, padding: sp(14), gap: sp(8) },
  cardWarn: { borderColor: colors.warn, backgroundColor: colors.warnBg },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  big: { fontSize: type.value, fontWeight: '800', color: colors.text },
  tag: { fontSize: fs(16), fontWeight: '700', color: colors.muted },
  tagWarn: { color: colors.warn },
  body: { fontSize: fs(16), color: colors.text, lineHeight: fs(22) },
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  input: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
}));
