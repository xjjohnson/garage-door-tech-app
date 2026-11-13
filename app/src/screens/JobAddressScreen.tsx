/**
 * Where a job is, opened from the Address row under Customer on the job's
 * page. It starts on the job's customer and every address they have in Odoo
 * (their own main address first, then each address under them, like the
 * house when a property manager is the customer). Change customer searches
 * Odoo for another customer by name and lists all of theirs. The pick is the
 * job's delivery address (partner_shipping_id) on its quotation and invoice;
 * the job's own customer is still the one billed, and the ticket only shows it.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, NavRow } from '../components/Buttons';
import { Customer } from '../lib/customers';
import { invoiceStatus } from '../lib/invoices';
import { Job } from '../lib/jobs';
import { addressChoices, fetchCustomer, FoundCustomer, searchCustomers } from '../lib/odooContacts';
import { useContactAddresses } from '../lib/useContactAddresses';
import { useCustomersIfAny } from '../lib/useCustomers';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The address a job is at: the one picked for it, else the job's own, else its customer's main address. */
export const jobAddress = (job: Job, customer?: Customer) => job.ticket?.shipTo?.address || job.address || customer?.address || '';

/** The job's customer on this phone, if it has one. */
export function useJobCustomer(job: Job | undefined): Customer | undefined {
  const customers = useCustomersIfAny();
  return job?.customerId ? customers?.customers.find((c) => c.id === job.customerId) : undefined;
}

export function JobAddressScreen({ job }: { job: Job }) {
  const { setTicket } = useJobs();
  const { invoices } = useInvoices();
  const { client } = useOdoo();
  const customer = useJobCustomer(job);
  const partnerId = customer?.odooId;
  const invoice = invoices.find((i) => i.jobId === job.id && invoiceStatus(i) !== 'void');
  // The customer whose addresses are listed: the job's own until Change customer picks another.
  const [other, setOther] = useState<FoundCustomer | null>(null);
  const [changing, setChanging] = useState(false);
  const viewId = other?.id ?? partnerId;
  const { addresses } = useContactAddresses(viewId);
  const [main, setMain] = useState<FoundCustomer | null>(null);

  useEffect(() => {
    setMain(null);
    if (!client || !viewId) return;
    let live = true;
    fetchCustomer(client, viewId)
      .then((c) => live && c && setMain(c))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, viewId]);

  // A new address makes Odoo's totals stale, so the quotation is sent again with it.
  const pick = (id: number, address: string) => {
    setTicket(job.id, (t) => ({ ...t, shipTo: { id, address }, totals: undefined }));
    if (router.canGoBack()) router.back();
  };

  if (!partnerId || !viewId) {
    return (
      <Text style={styles.note} testID="job-address-none">
        This customer isn&apos;t in Odoo yet, so the job uses the address typed on it: {jobAddress(job, customer) || 'none'}.
      </Text>
    );
  }

  const ownMain = main?.address || (other ? other.address : customer?.address || job.address);
  const choices = addressChoices({ id: viewId, address: ownMain }, addresses);
  const chosen = job.ticket?.shipTo?.id ?? partnerId;
  const name = other ? other.name : main?.name || customer?.name || job.customer;

  return (
    <View style={styles.stack} testID="job-address">
      <Text style={styles.label}>Job is at</Text>
      <Text style={styles.now} testID="job-address-now">
        {jobAddress(job, customer) || 'No address'}
      </Text>
      {invoice ? (
        <Text style={styles.note} testID="job-address-locked">
          The invoice is made, so it keeps this address.
        </Text>
      ) : (
        <>
          <View style={styles.head}>
            <Text style={styles.label} testID="job-address-customer-name">
              {name || 'Customer'}
            </Text>
            {other ? <Action label={`Back to ${customer?.name || 'the job’s customer'}`} onPress={() => setOther(null)} testID="job-address-back" /> : null}
          </View>
          {other ? <Text style={styles.note}>The job&apos;s customer is still billed. This address goes on as the delivery address.</Text> : null}
          <View style={styles.stack} accessibilityRole="radiogroup">
            {choices.map((o) => {
              const on = o.id === chosen;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => pick(o.id, o.address)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  testID={`job-address-${o.id}`}
                  style={({ pressed }) => [styles.option, on && styles.on, pressed && styles.pressed]}
                >
                  <Text style={[styles.title, on && styles.onText]}>{o.title}</Text>
                  <Text style={[styles.line, on && styles.onText]}>{o.line}</Text>
                </Pressable>
              );
            })}
          </View>
          {changing ? (
            <CustomerSearch
              onPick={(c) => {
                setOther(c.id === partnerId ? null : c);
                setChanging(false);
              }}
            />
          ) : client ? (
            <Action label="Change customer" onPress={() => setChanging(true)} testID="job-address-change" />
          ) : null}
        </>
      )}
      {job.customerId ? <NavRow label="Add or change addresses" detail="On the customer's page" href={{ pathname: '/customer/[id]', params: { id: job.customerId } }} testID="job-address-customer" /> : null}
    </View>
  );
}

/** Searches Odoo's customers by name or street; picking one lists their addresses. */
function CustomerSearch({ onPick }: { onPick: (c: FoundCustomer) => void }) {
  const { client } = useOdoo();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundCustomer[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!client || q.trim().length < 2) {
      setFound([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      searchCustomers(client, q)
        .then((r) => live && (setFound(r), setError(null)))
        .catch((e: unknown) => live && setError(message(e)));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [client, q]);
  return (
    <View style={styles.stack} testID="job-address-search-box">
      <TextInput value={q} onChangeText={setQ} placeholder="Search customers by name or street" placeholderTextColor={colors.muted} style={styles.input} autoCorrect={false} autoFocus testID="job-address-search" />
      {error ? <Text style={styles.error}>Couldn&apos;t search Odoo: {error}</Text> : null}
      {found.map((c) => (
        <Pressable key={c.id} onPress={() => onPick(c)} accessibilityRole="button" testID={`job-address-found-${c.id}`} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <Text style={styles.line}>{c.name || 'No name'}</Text>
          <Text style={styles.title}>{c.address || 'No address in Odoo'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  now: { fontSize: type.value, fontWeight: '900', color: colors.text },
  label: { fontSize: type.value, fontWeight: '900', color: colors.text },
  note: { fontSize: type.body, fontWeight: '600', color: colors.muted },
  input: { minHeight: touch.min, borderWidth: 2, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: type.body, color: colors.text, backgroundColor: colors.bg },
  option: { minHeight: touch.min, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg, gap: 2 },
  on: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.safety },
  title: { fontSize: 16, fontWeight: '800', color: colors.muted },
  line: { fontSize: type.body, fontWeight: '800', color: colors.text },
  onText: { color: colors.onSelected },
  error: { fontSize: 16, fontWeight: '700', color: colors.stop },
});
