import { ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DAY } from '../lib/followups';
import type { AgreementRow, FrequencySet, RepeatRow } from '../lib/odooRecurring';
import { useKeyboardHeight } from '../lib/useKeyboardHeight';
import { colors, touch, type } from '../theme';
import { ChipRow } from './controls';

/** A bottom sheet with a title, Cancel, the fields, an error line and one save button. */
function Sheet({ visible, title, children, canSave, busy, error, saveLabel, onSave, onCancel, testID }: { visible: boolean; title: string; children: ReactNode; canSave: boolean; busy?: boolean; error?: string | null; saveLabel: string; onSave: () => void; onCancel: () => void; testID: string }) {
  const kb = useKeyboardHeight();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={[styles.backdrop, Platform.OS !== 'ios' && kb > 0 && { paddingBottom: kb }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onCancel} accessibilityLabel="Cancel" />
        <View style={styles.sheet} testID={testID}>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID={`${testID}-cancel`}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
            {children}
          </ScrollView>
          {error ? (
            <Text style={styles.error} testID={`${testID}-error`}>
              {error}
            </Text>
          ) : null}
          <Pressable onPress={() => canSave && !busy && onSave()} disabled={!canSave || busy} accessibilityRole="button" accessibilityState={{ disabled: !canSave || !!busy }} testID={`${testID}-save`} style={({ pressed }) => [styles.save, (!canSave || busy) && styles.saveOff, pressed && styles.pressed]}>
            <Text style={styles.saveText}>{busy ? 'Saving to Odoo...' : saveLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** When something is due, as a few taps from today. */
export const WHEN: { label: string; value: number }[] = [
  { label: '1 week', value: 7 },
  { label: '1 month', value: 30 },
  { label: '3 months', value: 91 },
  { label: '6 months', value: 182 },
  { label: '1 year', value: 365 },
];
export const dayAhead = (days: number, now: number) => now + days * DAY;

export interface RepeatChoice {
  every: number | 'yearly';
  /** Days from today to the first visit. */
  days: number;
  what: string;
}

/** Makes a repeating visit for a customer: the yearly tune-up, or one of Odoo's frequencies. */
export function RepeatSheet({ visible, customer, sets, busy, error, onSave, onCancel }: { visible: boolean; customer: string; sets: FrequencySet[]; busy?: boolean; error?: string | null; onSave: (c: RepeatChoice) => void; onCancel: () => void }) {
  const [every, setEvery] = useState<number | 'yearly'>('yearly');
  const [days, setDays] = useState(365);
  useEffect(() => {
    if (visible) {
      setEvery('yearly');
      setDays(365);
    }
  }, [visible]);
  const options = [{ label: 'Yearly tune-up', value: 'yearly' as number | 'yearly' }, ...sets.map((s) => ({ label: s.name, value: s.id as number | 'yearly' }))];
  const what = every === 'yearly' ? 'Annual tune-up' : (sets.find((s) => s.id === every)?.name ?? 'Repeat visit');
  return (
    <Sheet visible={visible} title={`Repeat visits for ${customer}`} canSave saveLabel="Create in Odoo" busy={busy} error={error} onSave={() => onSave({ every, days, what })} onCancel={onCancel} testID="repeat-sheet">
      <Text style={styles.label}>How often</Text>
      <ChipRow options={options} value={every} onChange={setEvery} testID="repeat-every" />
      <Text style={styles.label}>First visit in</Text>
      <ChipRow options={WHEN.map((w) => ({ label: w.label, value: w.value }))} value={days} onChange={setDays} testID="repeat-when" />
      <Text style={styles.note}>Odoo makes each visit as a job on its own, about 30 days before it is due for the tune-up. Nothing is texted to the customer.</Text>
    </Sheet>
  );
}

export interface NewFollowUp {
  customerId?: number;
  title: string;
  note: string;
  days: number;
}

/** A follow-up added by hand: becomes a to-do on the customer in Odoo. With no customer given, the tech picks one. */
export function NewFollowUpSheet({ visible, customer, customers, busy, error, onSave, onCancel }: { visible: boolean; customer?: string; customers?: { id: number; name: string }[]; busy?: boolean; error?: string | null; onSave: (f: NewFollowUp) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<number | undefined>();
  useEffect(() => {
    if (visible) {
      setTitle('');
      setNote('');
      setDays(7);
      setSearch('');
      setPicked(undefined);
    }
  }, [visible]);
  const q = search.trim().toLowerCase();
  const matches = (customers ?? []).filter((c) => q && c.name.toLowerCase().includes(q)).slice(0, 5);
  const who = customer ?? customers?.find((c) => c.id === picked)?.name;
  const canSave = title.trim() !== '' && (!!customer || picked !== undefined);
  return (
    <Sheet visible={visible} title={customer ? `New follow-up for ${customer}` : 'New follow-up'} canSave={canSave} saveLabel="Add to Odoo" busy={busy} error={error} onSave={() => onSave({ customerId: picked, title, note, days })} onCancel={onCancel} testID="followup-sheet">
      {!customer ? (
        <View style={styles.field}>
          <Text style={styles.label}>Customer</Text>
          {picked !== undefined ? <Text style={styles.value}>{who}</Text> : null}
          <TextInput value={search} onChangeText={setSearch} placeholder="Type a name" placeholderTextColor={colors.muted} accessibilityLabel="Customer" testID="followup-customer-search" style={styles.input} />
          {matches.map((c) => (
            <Pressable key={c.id} onPress={() => { setPicked(c.id); setSearch(''); }} accessibilityRole="button" testID={`followup-pick-${c.id}`} style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
              <Text style={styles.value}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.field}>
        <Text style={styles.label}>What to follow up on</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Call about the opener quote" placeholderTextColor={colors.muted} accessibilityLabel="What to follow up on" testID="followup-title" style={styles.input} />
      </View>
      <Text style={styles.label}>Due in</Text>
      <ChipRow options={WHEN.map((w) => ({ label: w.label, value: w.value }))} value={days} onChange={setDays} testID="followup-when" />
      <View style={styles.field}>
        <Text style={styles.label}>Note (optional)</Text>
        <TextInput value={note} onChangeText={setNote} multiline placeholder="Anything to remember" placeholderTextColor={colors.muted} accessibilityLabel="Note" testID="followup-note" style={[styles.input, styles.multi]} />
      </View>
    </Sheet>
  );
}

export interface AgreementChoice {
  name: string;
  notes: string;
  /** Years the agreement runs from today; 0 for no end. */
  years: number;
  repeatId?: number;
}

const TERMS = [
  { label: '1 year', value: 1 },
  { label: '2 years', value: 2 },
  { label: '3 years', value: 3 },
  { label: 'No end', value: 0 },
];

/** Makes (or, with `editing`, renames) a service agreement: a record of the plan, with no billing. */
export function AgreementSheet({ visible, customer, editing, repeats, busy, error, onSave, onCancel }: { visible: boolean; customer: string; editing?: AgreementRow; repeats: RepeatRow[]; busy?: boolean; error?: string | null; onSave: (c: AgreementChoice) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [years, setYears] = useState(1);
  const [repeatId, setRepeatId] = useState(0);
  useEffect(() => {
    if (visible) {
      setName(editing?.name ?? 'Yearly service plan');
      setNotes(editing?.notes ?? '');
      setYears(1);
      setRepeatId(0);
    }
  }, [visible, editing]);
  const open = repeats.filter((r) => r.status === 'Active' || r.status === 'Draft' || r.status === 'Paused');
  return (
    <Sheet visible={visible} title={editing ? 'Edit agreement' : `New agreement for ${customer}`} canSave={name.trim() !== ''} saveLabel={editing ? 'Save to Odoo' : 'Create in Odoo'} busy={busy} error={error} onSave={() => onSave({ name, notes, years, repeatId: repeatId || undefined })} onCancel={onCancel} testID="agreement-sheet">
      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Yearly service plan" placeholderTextColor={colors.muted} accessibilityLabel="Name" testID="agreement-name" style={styles.input} />
      </View>
      {!editing ? (
        <>
          <Text style={styles.label}>Runs for</Text>
          <ChipRow options={TERMS} value={years} onChange={setYears} testID="agreement-term" />
          {open.length ? (
            <>
              <Text style={styles.label}>Covers this repeating visit</Text>
              <ChipRow options={[{ label: 'None', value: 0 }, ...open.map((r) => ({ label: r.every ? `${r.every} (${r.name})` : r.name, value: r.id }))]} value={repeatId} onChange={setRepeatId} testID="agreement-repeat" />
            </>
          ) : null}
        </>
      ) : null}
      <View style={styles.field}>
        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput value={notes} onChangeText={setNotes} multiline placeholder="What it covers" placeholderTextColor={colors.muted} accessibilityLabel="Notes" testID="agreement-notes" style={[styles.input, styles.multi]} />
      </View>
      {!editing ? <Text style={styles.note}>This only records the plan. It does not bill anything.</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '90%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: type.value, fontWeight: '900', color: colors.text },
  cancel: { minHeight: touch.min, paddingHorizontal: 12, justifyContent: 'center' },
  cancelText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  fields: { gap: 12, paddingBottom: 4 },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  value: { fontSize: type.body, fontWeight: '800', color: colors.text },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  pick: { minHeight: touch.min, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  error: { fontSize: 16, fontWeight: '700', color: colors.stop },
  save: { minHeight: touch.bar, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  saveOff: { backgroundColor: colors.muted },
  pressed: { backgroundColor: colors.safety },
  saveText: { fontSize: type.value, fontWeight: '900', color: colors.onSelected },
});
