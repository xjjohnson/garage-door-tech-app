import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../components/AppText';
import type { OdooClient } from '../lib/odoo';
import { canChangeRoles, listPeople, Person, ROLE_INFO, RoleId, saveRoles } from '../lib/odooRoles';
import { colors, touch, type } from '../theme';

/**
 * Management > Team roles: who is an owner, warehouse manager or buyer. Each
 * role is an Odoo group on the person's user, so this reads and writes Odoo
 * and nothing is kept on the phone. Only an Odoo administrator can change
 * roles; everyone else sees the list.
 */
export function RolesTab({ client }: { client: OdooClient }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<Person | null>(null);
  const [want, setWant] = useState<Record<RoleId, boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    listPeople(client).then((p) => setPeople(p), (e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [client]);
  useEffect(() => {
    load();
    canChangeRoles(client).then(setAdmin, () => setAdmin(false));
  }, [client, load]);

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

  if (open && want) {
    return (
      <View style={styles.stack} testID="roles-edit">
        <Pressable onPress={() => { setOpen(null); setMsg(''); }} accessibilityRole="button" testID="roles-back" style={styles.back}>
          <Text style={styles.buttonText}>‹ Back to the list</Text>
        </Pressable>
        <Text style={styles.title}>{open.name}</Text>
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

const styles = StyleSheet.create({
  stack: { gap: 10 },
  grow: { flex: 1 },
  row: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: type.body, fontWeight: '800', color: colors.text },
  label: { fontSize: type.body, fontWeight: '800', color: colors.text },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  warn: { fontSize: 16, fontWeight: '700', color: colors.text },
  back: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  primary: { minHeight: touch.min, borderRadius: 14, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
});
