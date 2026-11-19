import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useMaintenancePlans } from '../lib/useMaintenancePlans';
import { toTicketPlan } from '../components/PlanRow';
import { setPlan } from '../lib/ticket';
import { useOdoo } from '../lib/useOdoo';
import { fetchOpenOrders, OpenOrder, ticketFromOrder } from '../lib/odooOpenOrders';
import { formatMoney } from '../lib/prices';
import { colors, touch, type, bw, fs, rad } from '../theme';

type When = 'now' | 'later';

/**
 * A new job in three answers: who, what's wrong, and whether it's now. "Now"
 * opens the job hub straight away; "Later" saves it and opens the schedule
 * to book a time.
 */
export function NewJobScreen() {
  const { customers } = useCustomers();
  const { add, setTicket, setOdooOrder } = useJobs();
  const { client } = useOdoo();
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
  // Work waiting on approval, or approved and not invoiced: this job can pick up that order instead of starting a new ticket.
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [orderPick, setOrderPick] = useState<OpenOrder | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const partnerId = picked?.odooId;
  useEffect(() => {
    setOrderPick(null);
    setOrders([]);
    if (!client || !partnerId) return;
    let live = true;
    fetchOpenOrders(client, partnerId)
      .then((r) => live && setOrders(r))
      .catch((e) => log.warn('job', `couldn't list open orders: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      live = false;
    };
  }, [client, partnerId]);
  const canStart = name.trim() !== '' || address.trim() !== '';

  const pick = (c: Customer) => {
    setPicked(c);
    setName(c.name);
    setAddress(c.address);
    setPhone(c.phone);
  };
  // Opened from a customer's page ("New job for ..."): start with them picked.
  const { customer: fromCustomer, plan: planParam } = useLocalSearchParams<{ customer?: string; plan?: string }>();
  // Opened to renew or add a maintenance plan: the new ticket starts with that plan on it.
  const plans = useMaintenancePlans();
  const startPlan = planParam ? plans.find((p) => String(p.id) === planParam) : undefined;
  useEffect(() => {
    const c = fromCustomer ? customers.find((x) => x.id === fromCustomer) : undefined;
    if (c && !picked) pick(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCustomer, customers]);

  const pickPlace = (a: AddressSuggestion) => {
    const c = a.customerId ? customers.find((x) => x.id === a.customerId) : undefined;
    if (c && !name.trim()) pick(c);
    // A house under a customer: their details, at this house.
    if (a.addressId || !c || name.trim()) setAddress(a.address);
    if (a.addressId && !c && !name.trim() && a.customerName) setName(a.customerName);
    if (a.point) rememberPoint(a.address, a.point);
    setAddressPicked(true);
  };

  const start = async () => {
    // Read the linked order first, so a failure leaves the screen as it is and nothing half-made.
    let linked: Awaited<ReturnType<typeof ticketFromOrder>> | undefined;
    if (orderPick && client) {
      setLinking(true);
      setLinkError(null);
      try {
        linked = await ticketFromOrder(client, orderPick, Date.now());
      } catch (e) {
        setLinkError(`${e instanceof Error ? e.message : String(e)} Pick "No, new ticket" to start without it.`);
        setLinking(false);
        return;
      }
      setLinking(false);
    }
    const job = add({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: name, address, phone, notes: '' }, { title: '' }, { what, customerId: picked?.id });
    if (linked) {
      const t = linked;
      setOdooOrder(job.id, t.order!);
      setTicket(job.id, () => t);
    }
    if (startPlan) setTicket(job.id, (t) => setPlan(t, toTicketPlan(startPlan)));
    log.info('job', `new job ${job.id} (${what}, ${when}${linked ? `, order ${linked.order?.name}` : ''})`);
    if (startPlan) router.replace({ pathname: '/ticket/[id]', params: { id: job.id } });
    else if (when === 'now') router.replace({ pathname: '/job/[id]', params: { id: job.id } });
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
      {orders.length ? (
        <>
          <Text style={styles.label}>Sales order</Text>
          <Pressable onPress={() => setOrderPick(null)} accessibilityRole="radio" accessibilityState={{ selected: !orderPick }} testID="new-job-order-none" style={({ pressed }) => [styles.suggestion, !orderPick && styles.picked, pressed && styles.pressed]}>
            <Text style={styles.suggestName}>No, new ticket</Text>
            <Text style={styles.suggestSub}>Start the usual way</Text>
          </Pressable>
          {orders.map((o) => (
            <Pressable key={o.id} onPress={() => setOrderPick(o)} accessibilityRole="radio" accessibilityState={{ selected: orderPick?.id === o.id }} testID={`new-job-order-${o.id}`} style={({ pressed }) => [styles.suggestion, orderPick?.id === o.id && styles.picked, pressed && styles.pressed]}>
              <Text style={styles.suggestName}>
                Link {o.name} · {formatMoney(o.total)}
              </Text>
              <Text style={styles.suggestSub}>{[o.status, o.ref].filter(Boolean).join(' · ')}</Text>
            </Pressable>
          ))}
          {orderPick ? <Text style={styles.meta}>The order's items become this job's ticket. Create invoice ties the invoice to {orderPick.name}.</Text> : null}
          {linkError ? <Text style={styles.meta} testID="new-job-order-error">{linkError}</Text> : null}
        </>
      ) : null}
      <Action label={linking ? 'Reading the order...' : when === 'now' ? 'Start job' : 'Save and book'} primary disabled={!canStart || linking} onPress={start} testID="new-job-start" />
      {!canStart ? <Text style={styles.meta}>Add a name or an address first.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  label: { fontSize: fs(15), fontWeight: '800', letterSpacing: 0.5, color: colors.muted, marginTop: 6 },
  input: { minHeight: touch.min, borderRadius: rad(12), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  suggestion: { minHeight: touch.min, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 6 },
  suggestName: { fontSize: fs(17), fontWeight: '800', color: colors.text },
  suggestSub: { fontSize: fs(15), fontWeight: '600', color: colors.muted },
  pressed: { backgroundColor: colors.info },
  picked: { backgroundColor: colors.info, borderRadius: rad(12), paddingHorizontal: 10 },
  meta: { fontSize: fs(15), fontWeight: '600', color: colors.muted },
});
