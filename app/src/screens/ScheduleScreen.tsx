import { router } from 'expo-router';
import { AddressSuggestions } from '../components/AddressSuggestions';
import { KeyboardBackdrop } from '../components/KeyboardBackdrop';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipOption, ChipRow, SectionTitle } from '../components/controls';
import { suggestCustomers } from '../lib/customers';
import { textLink } from '../lib/followups';
import { phoneLink } from '../lib/jobs';
import { addDays, Appointment, dayLabel, formatTime, mapsLink, onDay, onMyWayText, overlaps, reminderText, slotsFor, startOfDay, upcoming } from '../lib/schedule';
import { useCustomers } from '../lib/useCustomers';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { NewAppointment, useSchedule } from '../lib/useSchedule';
import { colors, touch, type } from '../theme';

const WHAT = ['Broken spring', 'Tune-up', 'Opener', 'Off track', 'Cables', 'Estimate', 'Other'];
const LENGTHS: ChipOption<number>[] = [30, 60, 90, 120].map((m) => ({ label: m < 60 ? `${m} min` : `${m / 60} hr`.replace('1.5 hr', '1½ hr'), value: m }));
const ETAS = [15, 30, 45, 60];

/** The next booked visit or two, at the top of Jobs. */
export function NextVisits({ now = Date.now }: { now?: () => number }) {
  const { appointments } = useSchedule();
  const t = now();
  const next = upcoming(appointments, t, 2);
  return (
    <Pressable onPress={() => router.push('/schedule')} accessibilityRole="button" testID="open-schedule" style={({ pressed }) => [styles.button, styles.left, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>Schedule</Text>
      {next.map((a) => (
        <Text key={a.id} style={styles.meta} numberOfLines={1}>
          {dayLabel(a.start, t)} {formatTime(a.start)} · {a.name || a.address}
        </Text>
      ))}
      {next.length === 0 ? <Text style={styles.meta}>Nothing booked</Text> : null}
    </Pressable>
  );
}

/**
 * Visits by day. Book one with big buttons for the day and time, then on the
 * day: directions, an "on my way" text, call, and mark done.
 */
export function ScheduleScreen({ now = Date.now, bookFor, forJob }: { now?: () => number; bookFor?: string; forJob?: string }) {
  const { appointments, add, setStatus, update } = useSchedule();
  const { jobs, loaded: jobsLoaded } = useJobs();
  /** The visit being moved, when booking for a job that already has one. */
  const [editing, setEditing] = useState<string | null>(null);
  const { customers } = useCustomers();
  const { business } = useInvoices();
  const today = startOfDay(now());
  const [day, setDay] = useState(today);
  const [booking, setBooking] = useState<NewAppointment | null>(null);
  const days = useMemo(() => Array.from({ length: 15 }, (_, i) => addDays(today, i - 1)), [today]);
  const list = onDay(appointments, day);

  useEffect(() => {
    if (!bookFor) return;
    const c = customers.find((x) => x.id === bookFor);
    if (c) setBooking(blank(today, { customerId: c.id, name: c.name, address: c.address, phone: c.phone }));
  }, [bookFor, customers, today]);

  useEffect(() => {
    if (!forJob) return;
    const j = jobs.find((x) => x.id === forJob);
    if (!j) return;
    const v = appointments.find((a) => a.jobId === j.id && a.status === 'booked');
    if (v) {
      setEditing(v.id);
      setDay(startOfDay(v.start));
      setBooking({ start: v.start, minutes: v.minutes, name: v.name, address: v.address, phone: v.phone, what: v.what, jobId: v.jobId, ...(v.customerId ? { customerId: v.customerId } : {}) });
    } else {
      setBooking(blank(today, { jobId: j.id, name: j.customer, address: j.address, phone: j.phone, what: j.what ?? '', ...(j.customerId ? { customerId: j.customerId } : {}) }));
    }
    // Once, when the job is found; later changes to the schedule mustn't reopen the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forJob, jobsLoaded]);

  return (
    <View style={styles.stack} testID="schedule">
      <ChipRow options={days.map((d) => ({ label: dayLabel(d, today), value: d }))} value={day} onChange={setDay} scroll testID="schedule-days" />
      <Text style={styles.dayTitle} testID="schedule-day">
        {dayLabel(day, today)}: {list.filter((a) => a.status === 'booked').length} booked
      </Text>
      {list.length === 0 ? <Text style={styles.meta}>Nothing on this day.</Text> : null}
      {list.map((a) => (
        <Visit key={a.id} a={a} now={now()} businessName={business.name} onStatus={(s) => setStatus(a.id, s)} onMove={(start) => update(a.id, { start })} clash={a.status === 'booked' && overlaps(appointments, a).length > 0} />
      ))}
      <Action label="Book a visit" primary onPress={() => setBooking(blank(day))} testID="schedule-book" />

      <BookSheet
        value={booking}
        today={today}
        customers={customers}
        editing={!!editing}
        onCancel={() => {
          setBooking(null);
          setEditing(null);
        }}
        onSave={(a) => {
          if (editing) update(editing, a);
          else add(a);
          setDay(startOfDay(a.start));
          setBooking(null);
          setEditing(null);
        }}
        appointments={appointments}
      />
    </View>
  );
}

function blank(day: number, who: Partial<NewAppointment> = {}): NewAppointment {
  return { start: slotsFor(day)[4], minutes: 60, name: '', address: '', phone: '', what: '', ...who };
}

function Visit({ a, now, businessName, onStatus, onMove, clash }: { a: Appointment; now: number; businessName: string; onStatus: (s: Appointment['status']) => void; onMove: (start: number) => void; clash: boolean }) {
  const [eta, setEta] = useState(false);
  const maps = mapsLink(a.address);
  const tel = phoneLink(a.phone);
  const off = a.status !== 'booked';
  return (
    <View style={[styles.item, off && styles.itemOff, clash && styles.clash]} testID={`visit-${a.id}`}>
      <Text style={styles.time}>
        {formatTime(a.start)} · {a.minutes} min{a.status === 'done' ? ' · DONE' : a.status === 'cancelled' ? ' · CANCELLED' : ''}
      </Text>
      <Text style={styles.name}>{a.name || 'Customer'}</Text>
      {a.what ? <Text style={styles.detail}>{a.what}</Text> : null}
      {a.address ? <Text style={styles.detail}>{a.address}</Text> : null}
      {clash ? <Text style={styles.warn}>Overlaps another visit</Text> : null}
      {!off ? (
        <>
          <View style={styles.row}>
            {maps ? <Action label="Directions" grow onPress={() => Linking.openURL(maps).catch(() => undefined)} testID={`visit-maps-${a.id}`} /> : null}
            {tel ? <Action label="Call" grow onPress={() => Linking.openURL(tel).catch(() => undefined)} testID={`visit-call-${a.id}`} /> : null}
          </View>
          {textLink(a.phone, '') ? (
            eta ? (
              <View style={styles.row}>
                {ETAS.map((m) => (
                  <Action
                    key={m}
                    label={`${m} min`}
                    grow
                    onPress={() => {
                      setEta(false);
                      Linking.openURL(textLink(a.phone, onMyWayText(a, businessName, m))!).catch(() => undefined);
                    }}
                    testID={`visit-eta-${m}-${a.id}`}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.row}>
                <Action label="On my way" grow primary onPress={() => setEta(true)} testID={`visit-omw-${a.id}`} />
                <Action label="Remind" grow onPress={() => Linking.openURL(textLink(a.phone, reminderText(a, businessName, now))!).catch(() => undefined)} testID={`visit-remind-${a.id}`} />
              </View>
            )
          ) : null}
          <View style={styles.row}>
            <Action label="Done" grow onPress={() => onStatus('done')} testID={`visit-done-${a.id}`} />
            <Action label="Next day" grow onPress={() => onMove(addDays(a.start, 1))} testID={`visit-move-${a.id}`} />
            <Action label="Cancel" grow onPress={() => onStatus('cancelled')} testID={`visit-cancel-${a.id}`} />
          </View>
          {a.customerId ? <Action label="Customer history" onPress={() => router.push({ pathname: '/customer/[id]', params: { id: a.customerId! } })} testID={`visit-customer-${a.id}`} /> : null}
        </>
      ) : (
        <Action label="Book again" onPress={() => onStatus('booked')} testID={`visit-rebook-${a.id}`} />
      )}
    </View>
  );
}

function BookSheet({
  value,
  today,
  customers,
  appointments,
  onSave,
  onCancel,
  editing,
}: {
  editing?: boolean;
  value: NewAppointment | null;
  today: number;
  customers: ReturnType<typeof useCustomers>['customers'];
  appointments: Appointment[];
  onSave: (a: NewAppointment) => void;
  onCancel: () => void;
}) {
  const [a, setA] = useState<NewAppointment | null>(value);
  useEffect(() => setA(value), [value]);
  if (!a) return null;
  const set = (patch: Partial<NewAppointment>) => setA((p) => (p ? { ...p, ...patch } : p));
  const day = startOfDay(a.start);
  const minutesIntoDay = a.start - day;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const suggestions = a.customerId ? [] : suggestCustomers(customers, a.name);
  const clashes = overlaps(
    appointments.filter((x) => !(editing && x.jobId && x.jobId === a.jobId)),
    { id: '', start: a.start, minutes: a.minutes },
  );
  const canSave = a.name.trim() !== '' || a.address.trim() !== '';
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardBackdrop style={styles.backdrop}>
        <View style={styles.sheet} testID="book-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.sheetTitle}>{editing ? 'Change the visit' : 'Book a visit'}</Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="book-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
            <Field label="Customer" value={a.name} onChange={(name) => set({ name, customerId: undefined })} placeholder="Name" testID="book-name" />
            {suggestions.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => set({ customerId: c.id, name: c.name, phone: c.phone || a.phone, address: a.address || c.address })}
                accessibilityRole="button"
                testID={`book-suggest-${c.id}`}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              >
                <Text style={styles.detail}>{[c.name, c.phone, c.address].filter(Boolean).join(' · ')}</Text>
              </Pressable>
            ))}
            <Field label="Address" value={a.address} onChange={(address) => set({ address })} placeholder="Street and town" autofill testID="book-address" />
            <Field label="Phone" value={a.phone} onChange={(phone) => set({ phone })} placeholder="For texts on the day" phone testID="book-phone" />
            <SectionTitle>What for</SectionTitle>
            <ChipRow options={WHAT.map((w) => ({ label: w, value: w }))} value={a.what} onChange={(what) => set({ what })} scroll testID="book-what" />
            <SectionTitle>Day</SectionTitle>
            <ChipRow options={days.map((d) => ({ label: dayLabel(d, today), value: d }))} value={day} onChange={(d) => set({ start: d + minutesIntoDay })} scroll testID="book-day" />
            <SectionTitle>Time</SectionTitle>
            <View style={styles.slots} testID="book-time">
              {slotsFor(day).map((s) => {
                const on = s === a.start;
                return (
                  <Pressable key={s} onPress={() => set({ start: s })} accessibilityRole="radio" accessibilityState={{ selected: on }} style={({ pressed }) => [styles.slot, on && styles.slotOn, pressed && !on && styles.pressed]}>
                    <Text style={[styles.slotText, on && styles.slotTextOn]}>{formatTime(s)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <SectionTitle>How long</SectionTitle>
            <ChipRow options={LENGTHS} value={a.minutes} onChange={(minutes) => set({ minutes })} testID="book-length" />
            {clashes.length > 0 ? (
              <Text style={styles.warn} testID="book-clash">
                Overlaps {clashes.map((c) => `${formatTime(c.start)} ${c.name}`).join(', ')}
              </Text>
            ) : null}
          </ScrollView>
          <Pressable
            onPress={() => canSave && onSave(a)}
            disabled={!canSave}
            accessibilityRole="button"
            testID="book-save"
            style={({ pressed }) => [styles.save, !canSave && styles.saveOff, pressed && styles.pressed]}
          >
            <Text style={styles.saveText}>
              {editing ? 'Move to' : 'Book'} {dayLabel(a.start, today)} {formatTime(a.start)}
            </Text>
          </Pressable>
        </View>
      </KeyboardBackdrop>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, phone, autofill, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; phone?: boolean; autofill?: boolean; testID: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={phone ? 'phone-pad' : 'default'}
        accessibilityLabel={label}
        testID={testID}
        style={styles.input}
      />
      {autofill ? <AddressSuggestions typed={value} focused={focused} onPick={(a) => onChange(a.address)} testID={`${testID}-place`} /> : null}
    </View>
  );
}

function Action({ label, onPress, primary, grow, testID }: { label: string; onPress: () => void; primary?: boolean; grow?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, grow && styles.grow, primary && styles.primary, pressed && styles.pressed]}>
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  dayTitle: { fontSize: type.value, fontWeight: '900', color: colors.text },
  item: { padding: 12, gap: 6, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  itemOff: { backgroundColor: colors.card },
  clash: { borderWidth: 4, borderColor: colors.caution },
  time: { fontSize: type.body, fontWeight: '900', color: colors.text },
  name: { fontSize: type.value, fontWeight: '900', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  warn: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  left: { alignItems: 'flex-start', paddingVertical: 8 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '94%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetTitle: { flex: 1, fontSize: type.value, fontWeight: '900', color: colors.text },
  cancel: { minHeight: touch.min, paddingHorizontal: 12, justifyContent: 'center' },
  cancelText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  fields: { gap: 10, paddingBottom: 4 },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  input: {
    minHeight: touch.min,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  suggestion: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.card },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slot: { minHeight: touch.min, minWidth: 96, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  slotOn: { backgroundColor: colors.selected },
  slotText: { fontSize: 17, fontWeight: '800', color: colors.text },
  slotTextOn: { color: colors.onSelected },
  save: { minHeight: touch.bar, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  saveOff: { backgroundColor: colors.muted },
  saveText: { fontSize: type.value, fontWeight: '900', color: colors.onSelected },
});
