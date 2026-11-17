import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action, QuickAction } from '../components/Buttons';
import { Caption, IconRow, RowGroup } from '../components/ToolRows';
import { formatMoney } from '../lib/prices';
import { loadProfile, Profile, saveContact, teamHours, TeamHours } from '../lib/odooProfile';
import { toOdooTime } from '../lib/odoo';
import { isOwner } from '../lib/scorecard';
import { useOdoo } from '../lib/useOdoo';
import { useWorkLog } from '../lib/useWorkLog';
import { formatHours, inPeriod, totals, weekOf } from '../lib/worklog';
import { colors, radius, shadow, touch, type } from '../theme';

type Tab = 'details' | 'certificates' | 'badges' | 'payroll';
const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'certificates', label: 'Certificates' },
  { id: 'badges', label: 'Badges' },
  { id: 'payroll', label: 'Payroll' },
];

/**
 * Your own employee record from Odoo, as a profile: photo, name, presence,
 * tags, Call, Text and Email, then Details, Certificates (the buttons
 * customers see on their quote page), Badges and Payroll. Payroll shows your
 * own hours; the owner also sees everyone's. Contact details can be edited
 * and save to Odoo.
 */
export function ProfileScreen() {
  const odoo = useOdoo();
  const client = odoo.status === 'signedIn' ? odoo.client : null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');
  const [tab, setTab] = useState<Tab>('details');
  const [owner, setOwner] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    setState('loading');
    try {
      const p = await loadProfile(client);
      setProfile(p);
      setState(p ? 'ready' : 'none');
    } catch {
      setState('error');
    }
  }, [client]);
  useEffect(() => {
    load();
    if (client) isOwner(client).then(setOwner);
  }, [client, load]);

  if (odoo.status === 'loading' || odoo.status === 'signingIn') return <Text style={styles.note}>Checking your sign-in...</Text>;
  if (!client) {
    return (
      <View style={styles.stack} testID="profile">
        <Text style={styles.note}>Sign in to Odoo to see your profile.</Text>
        <Action primary label="Sign in to Odoo" onPress={() => router.push('/team')} testID="profile-sign-in" />
      </View>
    );
  }
  if (state === 'loading') return <Text style={styles.note}>Loading your profile...</Text>;
  if (state === 'error') {
    return (
      <View style={styles.stack} testID="profile">
        <Text style={styles.note}>Couldn't reach Odoo. Check your signal and try again.</Text>
        <Action label="Try again" onPress={load} testID="profile-retry" />
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={styles.stack} testID="profile">
        <Text style={styles.note}>Odoo has no employee record for {client.session.name || client.session.login}. Add one in the Employees app.</Text>
      </View>
    );
  }

  return (
    <View style={styles.stack} testID="profile">
      <View style={styles.card}>
        {profile.photo ? (
          <Image source={{ uri: `data:image/png;base64,${profile.photo}` }} style={styles.photo} accessibilityLabel={`Photo of ${profile.name}`} />
        ) : (
          <View style={[styles.photo, styles.initials]}>
            <Text style={styles.initialsText}>{initials(profile.name)}</Text>
          </View>
        )}
        <Text style={styles.name} testID="profile-name">
          {profile.name}
        </Text>
        {profile.job ? <Text style={styles.sub}>{profile.job}</Text> : null}
        <View style={styles.chips}>
          {profile.present !== null ? <Text style={[styles.chip, !profile.present && styles.chipOff]}>{profile.present ? '● Present' : 'Not clocked in'}</Text> : null}
          {profile.tags.map((t) => (
            <Text key={t} style={styles.chip}>
              {t}
            </Text>
          ))}
        </View>
        <View style={styles.actions}>
          <QuickAction icon="phone" label="Call" onPress={() => open(`tel:${digits(profile.mobile || profile.phone)}`)} testID="profile-call" />
          <QuickAction icon="chat" label="Text" onPress={() => open(`sms:${digits(profile.mobile || profile.phone)}`)} testID="profile-text" />
          <QuickAction icon="mail" label="Email" onPress={() => open(`mailto:${profile.email}`)} testID="profile-email" />
        </View>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} testID={`profile-tab-${t.id}`} style={[styles.tab, tab === t.id && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'details' ? <Details profile={profile} onSaved={load} /> : null}
      {tab === 'certificates' ? (
        <View style={styles.stack}>
          <Caption>Shown to customers as buttons on their quote page</Caption>
          {profile.certificates.length ? (
            <RowGroup>
              {profile.certificates.map((c, i) => (
                <IconRow key={c.id} icon="shield" label={c.label} noChevron last={i === profile.certificates.length - 1} testID={`profile-cert-${c.id}`} />
              ))}
            </RowGroup>
          ) : (
            <Text style={styles.note}>No certificates on your record. Add them on your employee record in Odoo, under Portal Certificates.</Text>
          )}
        </View>
      ) : null}
      {tab === 'badges' ? (
        profile.badges.length ? (
          <RowGroup>
            {profile.badges.map((b, i) => (
              <IconRow key={`${b}${i}`} icon="star" label={b} noChevron last={i === profile.badges.length - 1} />
            ))}
          </RowGroup>
        ) : (
          <Text style={styles.note}>No badges yet.</Text>
        )
      ) : null}
      {tab === 'payroll' ? <Payroll owner={owner} /> : null}

    </View>
  );
}

function Details({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const odoo = useOdoo();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [mobile, setMobile] = useState(profile.mobile);
  const save = async () => {
    if (!odoo.client) return;
    setSaving(true);
    setError('');
    try {
      await saveContact(odoo.client, profile.id, { email: email.trim(), phone: phone.trim(), mobile: mobile.trim() });
      setEditing(false);
      onSaved();
    } catch {
      setError("Couldn't save to Odoo. Your edits are still here; try again.");
    }
    setSaving(false);
  };
  if (!editing) {
    return (
      <View style={styles.stack}>
        <Caption>Contact</Caption>
        <RowGroup>
          <Line label="Email" value={profile.email} />
          <Line label="Phone" value={profile.phone} />
          <Line label="Work mobile" value={profile.mobile} last />
        </RowGroup>
        <Action label="Edit contact details" onPress={() => setEditing(true)} testID="profile-edit" />
      </View>
    );
  }
  return (
    <View style={styles.stack}>
      <Caption>Contact</Caption>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email" testID="profile-input-email" />
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor={colors.muted} keyboardType="phone-pad" accessibilityLabel="Phone" testID="profile-input-phone" />
      <TextInput style={styles.input} value={mobile} onChangeText={setMobile} placeholder="Work mobile" placeholderTextColor={colors.muted} keyboardType="phone-pad" accessibilityLabel="Work mobile" testID="profile-input-mobile" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Action primary label={saving ? 'Saving...' : 'Save to Odoo'} disabled={saving} onPress={save} testID="profile-save" />
      <Action label="Cancel" onPress={() => setEditing(false)} testID="profile-cancel" />
    </View>
  );
}

function Line({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.line, !last && styles.lineRule]}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value || 'Not set'}</Text>
    </View>
  );
}

/** Your own week from the time clock; the owner also sees each person's hours this week from Odoo. */
function Payroll({ owner }: { owner: boolean }) {
  const odoo = useOdoo();
  const { shifts, centsPerMile } = useWorkLog();
  const [team, setTeam] = useState<TeamHours[]>([]);
  const week = weekOf(Date.now());
  const mine = totals(inPeriod(shifts, week), centsPerMile, Date.now());
  useEffect(() => {
    if (owner && odoo.client) teamHours(odoo.client, toOdooTime(week.start)).then(setTeam);
    // The week start only changes on Monday.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, odoo.client]);
  return (
    <View style={styles.stack} testID="profile-payroll">
      <Caption>Your week</Caption>
      <RowGroup>
        <Line label="Days worked" value={String(mine.days)} />
        <Line label="Hours" value={formatHours(mine.ms)} />
        <Line label="Miles" value={`${Math.round(mine.miles)} mi`} />
        <Line label="Mileage deduction" value={formatMoney(mine.deductionCents)} last />
      </RowGroup>
      <Text style={styles.note}>From the Time and miles clock on this phone. Pay stubs and rates stay in Odoo.</Text>
      {owner ? (
        <>
          <Caption>Everyone this week (owner)</Caption>
          {team.length ? (
            <RowGroup>
              {team.map((t, i) => (
                <Line key={t.name} label={t.name} value={`${t.hours.toFixed(1)} h`} last={i === team.length - 1} />
              ))}
            </RowGroup>
          ) : (
            <Text style={styles.note}>No attendance recorded in Odoo this week.</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
const digits = (n: string) => n.replace(/[^\d+]/g, '');
const open = (url: string) => {
  Linking.openURL(url).catch(() => undefined);
};

const styles = StyleSheet.create({
  stack: { gap: 12 },
  note: { fontSize: 16, fontWeight: '600', color: colors.muted, textAlign: 'left' },
  error: { fontSize: type.body, fontWeight: '700', color: colors.stop },
  card: { alignItems: 'center', gap: 6, padding: 16, borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, ...shadow },
  photo: { width: 88, height: 88, borderRadius: 22 },
  initials: { backgroundColor: colors.info, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 30, fontWeight: '800', color: colors.selected },
  name: { fontSize: type.value + 2, fontWeight: '800', color: colors.text, marginTop: 4 },
  sub: { fontSize: 16, fontWeight: '600', color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 2 },
  chip: { fontSize: 14, fontWeight: '800', color: colors.selected, backgroundColor: colors.info, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' },
  chipOff: { color: colors.muted },
  actions: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 8 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  tabText: { fontSize: 16, fontWeight: '800', color: colors.muted },
  tabTextOn: { color: colors.onSelected },
  line: { minHeight: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  lineRule: { borderBottomWidth: 1, borderBottomColor: colors.line },
  lineLabel: { fontSize: 16, fontWeight: '600', color: colors.muted },
  lineValue: { flexShrink: 1, fontSize: type.body, fontWeight: '700', color: colors.text, textAlign: 'right' },
  input: { minHeight: touch.min, borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 14, fontSize: type.body, color: colors.text },
});
