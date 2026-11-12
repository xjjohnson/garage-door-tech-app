import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipRow, SectionTitle } from '../components/controls';
import { phoneLink } from '../lib/jobs';
import { appsFound, cleanUrl, guessDb, OdooError, OdooTask, OdooUser, taskToAppointment } from '../lib/odoo';
import { dayLabel, formatTime, mapsLink } from '../lib/schedule';
import { useOdoo } from '../lib/useOdoo';
import { useSchedule } from '../lib/useSchedule';
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
 * to you and put them on the schedule, and, for whoever dispatches, give
 * unassigned jobs to a tech.
 */
export function TeamScreen({ now = Date.now }: { now?: () => number }) {
  const odoo = useOdoo();
  if (odoo.status === 'loading') return <Text style={styles.note}>Checking your Odoo sign-in...</Text>;
  return odoo.status === 'signedIn' && odoo.client ? <SignedIn now={now} /> : <SignInForm />;
}

function SignInForm() {
  const { saved, signIn, status, error } = useOdoo();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [db, setDb] = useState(saved?.db ?? '');
  const [login, setLogin] = useState(saved?.login ?? '');
  const [secret, setSecret] = useState('');
  const busy = status === 'signingIn';
  return (
    <View style={styles.stack} testID="team-signin">
      <Text style={styles.note}>
        Sign in with your Odoo account to get the jobs assigned to you, and to give jobs to your techs. Each tech signs in with their own Odoo user.
      </Text>
      <Field label="Odoo address" value={url} onChange={(v) => {
        setUrl(v);
        if (!db) setDb(guessDb(v));
      }} placeholder="yourcompany.odoo.com" keyboard="url" testID="team-url" />
      <Field label="Database" hint="For yourcompany.odoo.com it's usually yourcompany. To test against a copy, put the copy's database name here." value={db} onChange={setDb} placeholder="yourcompany" testID="team-db" />
      <Field label="Email" value={login} onChange={setLogin} placeholder="you@yourcompany.com" keyboard="email-address" testID="team-login" />
      <Field
        label="API key (or password)"
        hint="Use an API key: in Odoo, your name > My Preferences > Account Security > New API Key. It's kept in the phone's keystore."
        value={secret}
        onChange={setSecret}
        placeholder="API key"
        secure
        testID="team-secret"
      />
      {error ? (
        <Text style={styles.error} testID="team-error">
          {error}
        </Text>
      ) : null}
      <Action label={busy ? 'Signing in...' : 'Sign in to Odoo'} primary disabled={busy} onPress={() => signIn({ url: cleanUrl(url), db, login }, secret)} testID="team-signin-go" />
    </View>
  );
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
  const addToSchedule = (list: OdooTask[]) => restore(list.map((t) => taskToAppointment(t, now(), scheduled(t))));

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
          Your Odoo doesn’t have a jobs app yet. In Odoo, open Apps and install Field Service (or Project if your plan doesn’t include Field Service). Then sign out here and sign in again.
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
        <Action label={busy ? 'Loading...' : 'Refresh'} grow disabled={busy} onPress={load} testID="team-refresh" />
        <Action label="Sign out" grow onPress={signOut} testID="team-signout" />
      </View>
      {error ? (
        <Text style={styles.error} testID="team-error">
          {error}
        </Text>
      ) : null}

      <SectionTitle>My jobs</SectionTitle>
      {mine && mine.length === 0 ? <Text style={styles.note}>Nothing assigned to you in Odoo.</Text> : null}
      {mine && mine.length > 0 ? <Action label="Put all on my schedule" primary onPress={() => addToSchedule(mine)} testID="team-schedule-all" /> : null}
      {(mine ?? []).map((t) => (
        <Task key={t.id} t={t} now={now()}>
          <View style={styles.row}>
            <Action label={scheduled(t) ? 'On schedule ✓' : 'Add to schedule'} grow onPress={() => addToSchedule([t])} testID={`team-schedule-${t.id}`} />
            {client!.canMarkDone ? <Action label="Mark done" grow onPress={() => done(t)} testID={`team-done-${t.id}`} /> : null}
          </View>
        </Task>
      ))}

      <SectionTitle>Dispatch</SectionTitle>
      <Text style={styles.note}>Give unassigned jobs to a tech. They see them when they open Team on their phone.</Text>
      {open && open.length === 0 ? <Text style={styles.note}>No unassigned jobs.</Text> : null}
      {(open ?? []).map((t) => (
        <Task key={t.id} t={t} now={now()}>
          <Text style={styles.label}>Give to</Text>
          <View style={styles.wrap}>
            {techs.map((u) => (
              <Action key={u.id} label={u.id === s.me ? `${u.name} (me)` : u.name} onPress={() => assign(t, u.id)} testID={`team-assign-${t.id}-${u.id}`} />
            ))}
          </View>
        </Task>
      ))}

      {techs.length > 1 ? (
        <>
          <SectionTitle>A tech's jobs</SectionTitle>
          <ChipRow options={techs.map((u) => ({ label: u.id === s.me ? 'Me' : u.name, value: u.id }))} value={tech} onChange={setTech} scroll testID="team-techs" />
          {theirs && theirs.length === 0 ? <Text style={styles.note}>Nothing assigned.</Text> : null}
          {(theirs ?? []).map((t) => (
            <Task key={t.id} t={t} now={now()}>
              <Text style={styles.label}>Move to</Text>
              <View style={styles.wrap}>
                {techs
                  .filter((u) => u.id !== tech)
                  .map((u) => (
                    <Action key={u.id} label={u.id === s.me ? 'Me' : u.name} onPress={() => assign(t, u.id)} testID={`team-move-${t.id}-${u.id}`} />
                  ))}
              </View>
            </Task>
          ))}
        </>
      ) : null}
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
      {t.notes ? <Text style={styles.meta} numberOfLines={4}>{t.notes}</Text> : null}
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

function Field({ label, hint, value, onChange, placeholder, keyboard, secure, testID }: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder: string; keyboard?: 'url' | 'email-address'; secure?: boolean; testID: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.meta}>{hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        accessibilityLabel={label}
        testID={testID}
        style={styles.input}
      />
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
  name: { fontSize: type.body, fontWeight: '900', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  item: { padding: 12, gap: 6, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
});
