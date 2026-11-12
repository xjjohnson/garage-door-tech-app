import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action } from '../components/Buttons';
import { ChipRow } from '../components/controls';
import { Customer, suggestCustomers } from '../lib/customers';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { DEFAULT_JOB_TYPES } from '../lib/jobTypes';
import { log } from '../lib/log';
import { useCustomers } from '../lib/useCustomers';
import { useJobs } from '../lib/useJobs';
import { colors, touch, type } from '../theme';

type When = 'now' | 'later';

/**
 * A new job in three answers: who, what's wrong, and whether it's now. "Now"
 * opens the job hub straight away; "Later" saves it and opens the schedule
 * to book a time.
 */
export function NewJobScreen() {
  const { customers } = useCustomers();
  const { add } = useJobs();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [picked, setPicked] = useState<Customer | null>(null);
  const [what, setWhat] = useState<string>(DEFAULT_JOB_TYPES[0]);
  const [when, setWhen] = useState<When>('now');
  const suggestions = picked ? [] : suggestCustomers(customers, name);
  const canStart = name.trim() !== '' || address.trim() !== '';

  const pick = (c: Customer) => {
    setPicked(c);
    setName(c.name);
    setAddress(c.address);
    setPhone(c.phone);
  };

  const start = () => {
    const job = add({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: name, address, phone, notes: '' }, { title: '' }, { what, customerId: picked?.id });
    log.info('job', `new job ${job.id} (${what}, ${when})`);
    if (when === 'now') router.replace({ pathname: '/job/[id]', params: { id: job.id } });
    else router.replace({ pathname: '/schedule', params: { job: job.id } });
  };

  return (
    <View style={styles.stack} testID="new-job">
      <Text style={styles.label}>Customer</Text>
      <TextInput
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (picked && v !== picked.name) setPicked(null);
        }}
        placeholder="Name or phone"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        accessibilityLabel="Customer"
        testID="new-job-name"
        style={styles.input}
      />
      {suggestions.map((c) => (
        <Pressable key={c.id} onPress={() => pick(c)} accessibilityRole="button" testID={`new-job-pick-${c.id}`} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
          <Text style={styles.suggestName}>{c.name}</Text>
          <Text style={styles.suggestSub}>{[c.address, c.phone].filter(Boolean).join(' · ') || 'Saved customer'}</Text>
        </Pressable>
      ))}
      {picked ? <Text style={styles.meta}>Saved customer{picked.odooId ? ', in Odoo' : ''}.</Text> : null}
      <TextInput value={address} onChangeText={setAddress} placeholder="Address" placeholderTextColor={colors.muted} accessibilityLabel="Address" testID="new-job-address" style={styles.input} />
      <TextInput value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor={colors.muted} keyboardType="phone-pad" accessibilityLabel="Phone" testID="new-job-phone" style={styles.input} />

      <Text style={styles.label}>What's wrong</Text>
      <ChipRow options={DEFAULT_JOB_TYPES.map((t) => ({ label: t, value: t }))} value={what} onChange={setWhat} testID="new-job-what" />

      <Text style={styles.label}>When</Text>
      <ChipRow
        options={[
          { label: "Now, I'm here", value: 'now' as const },
          { label: 'Book a time', value: 'later' as const },
        ]}
        value={when}
        onChange={setWhen}
        testID="new-job-when"
      />
      <Action label={when === 'now' ? 'Start job' : 'Save and book'} primary disabled={!canStart} onPress={start} testID="new-job-start" />
      {!canStart ? <Text style={styles.meta}>Add a name or an address first.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  label: { fontSize: 15, fontWeight: '900', letterSpacing: 0.5, color: colors.muted, marginTop: 6 },
  input: { minHeight: touch.min, borderRadius: 12, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  suggestion: { minHeight: touch.min, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: colors.info, paddingVertical: 6 },
  suggestName: { fontSize: 17, fontWeight: '800', color: colors.text },
  suggestSub: { fontSize: 15, fontWeight: '600', color: colors.muted },
  pressed: { backgroundColor: colors.safety },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
});
