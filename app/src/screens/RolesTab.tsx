import { useCallback, useEffect, useState } from 'react';
import { useBackStep } from '../lib/backStep';
import { Pressable, Switch, TextInput, View } from 'react-native';
import { Text } from '../components/AppText';
import type { OdooClient } from '../lib/odoo';
import { canChangeRoles, createPerson, LinkState, Links, linkEmployee, linkStatus, linkWorker, listPeople, looksLikeEmail, Person, ROLE_INFO, RoleId, saveRoles, sendInvite } from '../lib/odooRoles';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

/**
 * Management > Team roles: who is an owner, dispatcher, office, sales, warehouse manager or buyer. Each
 * role is an Odoo group on the person's user, so this reads and writes Odoo
 * and nothing is kept on the phone. Only an Odoo administrator can change
 * roles; everyone else sees the list.
 */
export function RolesTab({ client }: { client: OdooClient }) {
  const styles = useStyles();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<Person | null>(null);
  const [want, setWant] = useState<Record<RoleId, boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [links, setLinks] = useState<Links | null>(null);
  const [linkMsg, setLinkMsg] = useState('');
  const [adding, setAdding] = useState(false);
  useBackStep(() => { setAdding(false); setOpen(null); setMsg(''); setJustMade(false); }, adding || open !== null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [justMade, setJustMade] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');

  const load = useCallback(() => {
    listPeople(client).then((p) => setPeople(p), (e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [client]);
  useEffect(() => {
    load();
    canChangeRoles(client).then(setAdmin, () => setAdmin(false));
  }, [client, load]);

  useEffect(() => {
    setLinks(null);
    setLinkMsg('');
    if (!open) return;
    let alive = true;
    linkStatus(client, open.id).then((l) => alive && setLinks(l), () => alive && setLinks(null));
    return () => {
      alive = false;
    };
  }, [open, client]);

  const fixLink = async (what: 'employee' | 'worker') => {
    if (!open) return;
    setBusy(true);
    setLinkMsg('');
    try {
      const r = await (what === 'employee' ? linkEmployee(client, open.id) : linkWorker(client, open.id));
      setLinkMsg(r === 'created' ? `Made the ${what === 'employee' ? 'employee' : 'Field Service worker'} in Odoo.` : `Linked the ${what === 'employee' ? 'employee' : 'Field Service worker'}.`);
      setLinks(await linkStatus(client, open.id));
    } catch (e) {
      setLinkMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const makePerson = async () => {
    if (!want) return;
    setBusy(true);
    setMsg('');
    try {
      const p = await createPerson(client, { name: newName, email: newEmail, roles: want });
      setAdding(false);
      setNewName('');
      setNewEmail('');
      setJustMade(true);
      setInviteMsg('');
      setOpen(p);
      setWant({ ...p.roles });
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      load();
    }
    setBusy(false);
  };

  const invite = async () => {
    if (!open) return;
    setBusy(true);
    setInviteMsg('');
    try {
      await sendInvite(client, open.id);
      setInviteMsg(`Odoo sent ${open.login} an email with a link to set a password.`);
    } catch (e) {
      setInviteMsg(`Not sent: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  const save = async () => {
    if (!open || !want) return;
    setBusy(true);
    setMsg('');
    try {
      await saveRoles(client, open.id, want);
      setOpen(null);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  if (adding && want) {
    const ready = newName.trim() !== '' && looksLikeEmail(newEmail);
    return (
      <View style={styles.stack} testID="roles-add">
        <Text style={styles.title}>Add a person</Text>
        <Text style={styles.note}>Makes a new user in Odoo. Their email is their login.</Text>
        <TextInput value={newName} onChangeText={setNewName} placeholder="Full name" placeholderTextColor={colors.muted} accessibilityLabel="Full name" testID="roles-add-name" style={styles.input} />
        <TextInput value={newEmail} onChangeText={setNewEmail} placeholder="Email (their login)" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" accessibilityLabel="Email" testID="roles-add-email" style={styles.input} />
        {ROLE_INFO.map((r) => (
          <View key={r.id} style={styles.switchRow}>
            <View style={styles.grow}>
              <Text style={styles.label}>{r.label}</Text>
              <Text style={styles.note}>{r.detail}</Text>
            </View>
            <Switch value={want[r.id]} disabled={busy} onValueChange={(on) => setWant({ ...want, [r.id]: on })} accessibilityLabel={r.label} testID={`roles-add-switch-${r.id}`} trackColor={{ true: colors.selected, false: colors.info }} thumbColor={colors.bg} />
          </View>
        ))}
        <Text style={styles.note}>Leave them all off for a tech. Nothing is emailed yet; you can send Odoo's invitation next.</Text>
        <Pressable onPress={makePerson} disabled={busy || !ready} accessibilityRole="button" accessibilityState={{ disabled: busy || !ready }} testID="roles-add-save" style={[styles.primary, (busy || !ready) && styles.off]}>
          <Text style={styles.primaryText}>{busy ? 'Making...' : 'Make in Odoo'}</Text>
        </Pressable>
        {msg ? <Text style={styles.warn} testID="roles-add-msg">Not made: {msg}</Text> : null}
      </View>
    );
  }

  if (open && want) {
    return (
      <View style={styles.stack} testID="roles-edit">
        <Text style={styles.title}>{open.name}</Text>
        {justMade ? (
          <>
            <Text style={styles.note} testID="roles-made">Made in Odoo. They can't sign in until they have a password: send Odoo's invitation below, or set one in Odoo's Settings, Users. Then link their employee and Field Service worker here.</Text>
            {admin ? (
              <Pressable onPress={invite} disabled={busy} accessibilityRole="button" testID="roles-invite" style={styles.small}>
                <Text style={styles.buttonText}>{busy ? 'Sending...' : `Email Odoo's invitation to ${open.login}`}</Text>
              </Pressable>
            ) : null}
            {inviteMsg ? <Text style={styles.note} testID="roles-invite-msg">{inviteMsg}</Text> : null}
          </>
        ) : null}
        {open.admin ? <Text style={styles.note}>An Odoo administrator, so already an owner. Odoo's Settings, Users changes that.</Text> : null}
        {ROLE_INFO.map((r) => (
          <View key={r.id} style={styles.switchRow}>
            <View style={styles.grow}>
              <Text style={styles.label}>{r.label}</Text>
              <Text style={styles.note}>{r.detail}</Text>
            </View>
            <Switch value={want[r.id]} disabled={!admin || busy} onValueChange={(on) => setWant({ ...want, [r.id]: on })} accessibilityLabel={r.label} testID={`roles-switch-${r.id}`} trackColor={{ true: colors.selected, false: colors.info }} thumbColor={colors.bg} />
          </View>
        ))}
        {links ? (
          <>
            <LinkRow label="Employee" what="time clock and profile" state={links.employee} canFix={admin && !busy} onFix={() => fixLink('employee')} testID="roles-link-employee" />
            <LinkRow label="Field Service worker" what="jobs can be given to them" state={links.worker} canFix={admin && !busy} onFix={() => fixLink('worker')} testID="roles-link-worker" />
          </>
        ) : null}
        {linkMsg ? <Text style={styles.note} testID="roles-link-msg">{linkMsg}</Text> : null}
        <Text style={styles.note}>Anyone not marked is a tech. The change is made in Odoo, and the person gets it the next time they open the app.</Text>
        {admin ? (
          <Pressable onPress={save} disabled={busy} accessibilityRole="button" testID="roles-save" style={styles.primary}>
            <Text style={styles.primaryText}>{busy ? 'Saving...' : 'Save to Odoo'}</Text>
          </Pressable>
        ) : null}
        {msg ? <Text style={styles.warn} testID="roles-msg">Not saved: {msg}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.stack} testID="roles-list">
      {admin ? (
        <Pressable onPress={() => { setAdding(true); setWant({ owner: false, dispatch: false, office: false, sales: false, warehouse: false, buyer: false }); setMsg(''); }} accessibilityRole="button" testID="roles-add-person" style={styles.primary}>
          <Text style={styles.primaryText}>Add person</Text>
        </Pressable>
      ) : null}
      <Text style={styles.note}>{admin ? 'Tap a person to change their roles.' : 'Only an Odoo administrator can change roles. You can see who has which.'}</Text>
      {err ? <Text style={styles.warn}>{err}</Text> : null}
      {people === null && !err ? <Text style={styles.note}>Reading Odoo...</Text> : null}
      {people?.map((p) => {
        const names = [p.admin ? 'Odoo admin' : '', ...ROLE_INFO.filter((r) => p.roles[r.id] && !(p.admin && r.id === 'owner')).map((r) => r.label)].filter(Boolean);
        return (
          <Pressable key={p.id} onPress={() => { setOpen(p); setWant({ ...p.roles }); setMsg(''); }} accessibilityRole="button" testID={`roles-person-${p.id}`} style={styles.row}>
            <Text style={styles.label}>{p.name}</Text>
            <Text style={styles.note}>{names.length ? names.join(' · ') : 'Tech'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LinkRow({ label, what, state, canFix, onFix, testID }: { label: string; what: string; state: LinkState; canFix: boolean; onFix: () => void; testID: string }) {
  const styles = useStyles();
  if (state === 'unavailable') return null;
  return (
    <View style={styles.switchRow} testID={testID}>
      <View style={styles.grow}>
        <Text style={styles.label}>{label}: {state === 'linked' ? 'linked' : 'missing'}</Text>
        <Text style={styles.note}>{state === 'linked' ? what : `No ${label.toLowerCase()} for this login yet (${what}).`}</Text>
      </View>
      {state === 'missing' && canFix ? (
        <Pressable onPress={onFix} accessibilityRole="button" testID={`${testID}-fix`} style={styles.small}>
          <Text style={styles.buttonText}>Link or make</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  off: { opacity: 0.5 },
  input: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: sp(12), fontSize: type.body, color: colors.text },
  small: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(12) },
  stack: { gap: sp(10) },
  grow: { flex: 1 },
  row: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card, padding: sp(12), gap: sp(2) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: sp(10) },
  title: { fontSize: type.body, fontWeight: '800', color: colors.text },
  label: { fontSize: type.body, fontWeight: '800', color: colors.text },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
  warn: { fontSize: fs(16), fontWeight: '700', color: colors.text },
  back: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  primary: { minHeight: touch.min, borderRadius: rad(14), backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
}));
