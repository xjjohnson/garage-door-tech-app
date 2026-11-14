import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Action } from '../components/Buttons';
import { ChipRow } from '../components/controls';
import type { AddressSuggestion } from '../lib/addressSuggest';
import { Customer, suggestCustomers } from '../lib/customers';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { DEFAULT_JOB_TYPES } from '../lib/jobTypes';
import { useFsmTemplates } from '../lib/useFsmTemplates';
import { log } from '../lib/log';
import { useAddressSuggestions } from '../lib/useAddressSuggestions';
import { useCustomers } from '../lib/useCustomers';
import { rememberPoint } from '../lib/useGeocode';
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
  const templates = useFsmTemplates();
  // Odoo's Field Service templates when it has some, otherwise the built-in kinds of job.
  const kinds = templates.length ? templates.map((t) => t.name) : [...DEFAULT_JOB_TYPES];
  const [chosen, setWhat] = useState<string | null>(null);
  const what = chosen && kinds.includes(chosen) ? chosen : kinds[0];
  const [when, setWhen] = useState<When>('now');
  const suggestions = picked ? [] : suggestCustomers(customers, name);
  // After a pick (a customer or a suggested address) the address list stays closed until it's edited.
  const [addressPicked, setAddressPicked] = useState(false);
  const places = useAddressSuggestions(address, addressPicked || !!picked);
  const canStart = name.trim() !== '' || address.trim() !== '';

  const pick = (c: Customer) => {
    setPicked(c);
    setName(c.name);
    setAddress(c.address);
    setPhone(c.phone);
  };

  const pickPlace = (a: AddressSuggestion) => {
    const c = a.customerId ? customers.find((x) => x.id === a.customerId) : undefined;
    if (c && !name.trim()) pick(c);
    // A house under a customer: their details, at this house.
    if (a.addressId || !c || name.trim()) setAddress(a.address);
    if (a.addressId && !c && !name.trim() && a.customerName) setName(a.customerName);
    if (a.point) rememberPoint(a.address, a.point);
    setAddressPicked(true);
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
      <TextInput
        value={address}
        onChangeText={(v) => {
          setAddress(v);
          setAddressPicked(false);
        }}
        placeholder="Address"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        textContentType="fullStreetAddress"
        autoComplete="street-address"
        accessibilityLabel="Address"
        testID="new-job-address"
        style={styles.input}
      />
      {places.map((a, i) => (
        <Pressable key={`${a.customerId ?? 'map'}-${a.address}`} onPress={() => pickPlace(a)} accessibilityRole="button" testID={`new-job-place-${i}`} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
          <Text style={styles.suggestName}>{a.name ? a.name : a.street || a.address}</Text>
          <Text style={styles.suggestSub}>{a.name ? `${a.address} · ${a.addressId ? 'House in Odoo' : 'Saved customer'}` : [a.city, a.zip].filter(Boolean).join(' ')}</Text>
        </Pressable>
      ))}
      <TextInput value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor={colors.muted} keyboardType="phone-pad" accessibilityLabel="Phone" testID="new-job-phone" style={styles.input} />

      <Text style={styles.label}>What's wrong</Text>
      <ChipRow options={kinds.map((t) => ({ label: t, value: t }))} value={what} onChange={setWhat} testID="new-job-what" />

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
  pressed: { backgroundColor: colors.info },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
});
