import { OdooSignInForm } from '../components/OdooSignInForm';
import { requestSyncNow } from '../lib/syncNow';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { ChipRow, SectionTitle } from '../components/controls';
import { phoneLink } from '../lib/jobs';
import { appsFound, OdooError, OdooTask, OdooUser } from '../lib/odoo';
import { dayLabel, formatTime, mapsLink } from '../lib/schedule';
import { useOdoo } from '../lib/useOdoo';
import { useSchedule } from '../lib/useSchedule';
import { useOpenOdooJob } from '../lib/useStartJob';
import { colors, touch, type } from '../theme';

/** At the top of Jobs. */
export function TeamButton() {
  const { status, client } = useOdoo();
  return (
    <Pressable onPress={() => router.push('/team')} accessibilityRole="button" testID="open-team" style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{status === 'signedIn' && client ? 'Team (Odoo)' : 'Team'}</Text>
    </Pressable>
  );
}

/**
 * Team jobs through the business's Odoo: sign in, see the jobs Odoo assigns
 * to you (they come onto the schedule on their own), and, for whoever dispatches, give
 * unassigned jobs to a tech.
 */
export function TeamScreen({ now = Date.now }: { now?: () => number }) {
  const odoo = useOdoo();
  if (odoo.status === 'loading') return <Text style={styles.note}>Checking your Odoo sign-in...</Text>;
  return odoo.status === 'signedIn' && odoo.client ? <SignedIn now={now} /> : <OdooSignInForm />;
}

function SignedIn({ now }: { now: () => number }) {
  const { client, signOut } = useOdoo();
  const { appointments, restore } = useSchedule();
  const s = client!.session;
  const [mine, setMine] = useState<OdooTask[] | null>(null);
  const [open, setOpen] = useState<OdooTask[] | null>(null);
  const [techs, setTechs] = useState<OdooUser[]>([]);
  const [tech, setTech] = useState<number>(s.me);
  const [theirs, setTheirs] = useState<OdooTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => setError(e instanceof OdooError ? e.message : "Couldn't talk to Odoo. Try again.");

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [m, u, t] = await Promise.all([client!.myTasks(), client!.unassignedTasks(), client!.techs()]);
      setMine(m);
      setOpen(u);
      setTechs(t);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    if (s.kind !== 'none') load();
  }, [load, s.kind]);

  useEffect(() => {
    if (tech === s.me || s.kind === 'none') {
      setTheirs(null);
      return;
    }
    let alive = true;
    client!
      .myTasks(tech)
      .then((t) => alive && setTheirs(t))
      .catch((e) => alive && fail(e));
    return () => {
      alive = false;
    };
  }, [tech, client, s.me, s.kind]);

  const scheduled = (t: OdooTask) => appointments.find((a) => a.id === `odoo-${t.id}`);
  const openJob = useOpenOdooJob();

  const assign = async (t: OdooTask, userId: number) => {
    setError(null);
    try {
      await client!.assign(t.id, userId);
      await load();
      if (tech !== s.me) setTheirs(await client!.myTasks(tech));
    } catch (e) {
      fail(e);
    }
  };
  const done = async (t: OdooTask) => {
    setError(null);
    try {
      await client!.markDone(t.id);
      const a = scheduled(t);
      if (a) restore([{ ...a, status: 'done', updatedAt: now() }]);
      await load();
    } catch (e) {
      fail(e);
    }
  };

  if (s.kind === 'none') {
    return (
      <View style={styles.stack} testID="team">
        <Text style={styles.detail} testID="team-who">
          Signed in as {s.name} · {s.url.replace(/^https?:\/\//, '')}
        </Text>
        <AppsFound />
        <Text style={styles.note} testID="team-no-tasks">
          Your Odoo doesn’t have a jobs app yet. In Odoo, open Apps and install Field Service (or Project if your plan doesn’t include Field Service). Then sign out (Developer screen, tap the version in Settings 7 times) and sign in again.
        </Text>
        <Action label="Sign out" onPress={signOut} testID="team-signout" />
      </View>
    );
  }

  return (
    <View style={styles.stack} testID="team">
      <Text style={styles.detail} testID="team-who">
        Signed in as {s.name} · {s.url.replace(/^https?:\/\//, '')}
      </Text>
      <AppsFound />
      <Text style={styles.meta}>{s.kind === 'oca' ? (s.me ? 'Jobs are Field Service orders.' : 'Jobs are Field Service orders. You aren’t a Field Service worker in Odoo, so nothing is assigned to you; add yourself under Field Service > Workers.') : s.fsm ? 'Jobs are Odoo Field Service tasks.' : 'Field Service isn’t installed, so jobs are Odoo Project tasks.'}</Text>
      <View style={styles.row}>
        <Action label={busy ? 'Loading...' : 'Refresh'} grow disabled={busy} onPress={() => { requestSyncNow().catch(() => undefined); load(); }} testID="team-refresh" />
      </View>
      {error ? (
        <Text style={styles.error} testID="team-error">
          {error}
        </Text>
      ) : null}

      <SectionTitle>My jobs</SectionTitle>
      {mine && mine.length === 0 ? <Text style={styles.note}>Nothing assigned to you in Odoo.</Text> : null}
      {mine && mine.length > 0 ? <Text style={styles.note}>Jobs with a time are on your schedule on their own. Set or change the time in Odoo or on the job's Visit row.</Text> : null}
      {(mine ?? []).map((t) => (
        <Task key={t.id} t={t} now={now()}>
          {scheduled(t) ? <Text style={styles.meta} testID={`team-schedule-${t.id}`}>On your schedule ✓</Text> : null}
          <View style={styles.row}>
            <Action label="Open job" grow onPress={() => openJob(t)} testID={`team-open-${t.id}`} />
            {client!.canMarkDone ? <Action label="Mark done" grow onPress={() => done(t)} testID={`team-done-${t.id}`} /> : null}
          </View>
        </Task>
      ))}
    </View>
  );
}

/** Which Odoo apps the phone found, so it's clear what can sync. */
function AppsFound() {
  const { client } = useOdoo();
  const found = client ? appsFound(client.session) : [];
  return (
    <Text style={styles.meta} testID="team-apps">
      {found.length ? `Found in your Odoo: ${found.join(', ')}.` : 'No Field Service, Sales, Invoicing or products found in your Odoo for this account.'}
      {client?.session.apps.products ? ' Import your Odoo prices on the Price sheet.' : ''}
    </Text>
  );
}

/** A job's notes without the app's own marker line ("App job ..."). */
const shownNotes = (notes: string) => notes.split('\n').filter((l) => !l.trim().startsWith('App job ')).join('\n').trim();

function Task({ t, now, children }: { t: OdooTask; now: number; children?: React.ReactNode }) {
  const when = t.start ?? t.deadline;
  const maps = mapsLink(t.address);
  const tel = phoneLink(t.phone);
  return (
    <View style={styles.item} testID={`task-${t.id}`}>
      <Text style={styles.name}>{t.name}</Text>
      {t.customer ? <Text style={styles.detail}>{t.customer}</Text> : null}
      {t.address ? <Text style={styles.detail}>{t.address}</Text> : null}
      <Text style={styles.meta}>
        {when ? `${dayLabel(when, now)} ${t.start ? formatTime(t.start) : '(due)'}` : 'No date'}
        {t.stage ? ` · ${t.stage}` : ''}
      </Text>
      {shownNotes(t.notes) ? <Text style={styles.meta} numberOfLines={4}>{shownNotes(t.notes)}</Text> : null}
      {maps || tel ? (
        <View style={styles.row}>
          {maps ? <Action label="Directions" grow onPress={() => Linking.openURL(maps).catch(() => undefined)} /> : null}
          {tel ? <Action label="Call" grow onPress={() => Linking.openURL(tel).catch(() => undefined)} /> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function Action({ label, onPress, primary, grow, disabled, testID }: { label: string; onPress: () => void; primary?: boolean; grow?: boolean; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.button, grow && styles.grow, primary && styles.primary, disabled && styles.off, pressed && styles.pressed]}
    >
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grow: { flex: 1 },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  name: { fontSize: type.body, fontWeight: '800', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  item: { padding: 12, gap: 6, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border },
  input: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  button: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.card },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
});
