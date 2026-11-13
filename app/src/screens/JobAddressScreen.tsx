/**
 * Which of the customer's addresses a job is at, opened from the job's page
 * under Customer: their main address or one of the addresses under their Odoo
 * contact (the house, when a property manager is the customer). The pick is
 * the job's delivery address (partner_shipping_id) on its quotation and
 * invoice in Odoo; the ticket only shows it. A different customer in Odoo
 * can be searched for and used as the delivery address instead, while the
 * job's own customer stays the one billed.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AddressPicker } from '../components/AddressPicker';
import { NavRow } from '../components/Buttons';
import { invoiceStatus } from '../lib/invoices';
import { Job } from '../lib/jobs';
import { FoundContact, searchContacts } from '../lib/odooContacts';
import { useCustomersIfAny } from '../lib/useCustomers';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

/** The address a job is at: the one picked for it, else the job's own. */
export const jobAddress = (job: Job) => job.ticket?.shipTo?.address || job.address;

/** The customer's Odoo contact id for a job, when the customer is in Odoo. */
export function useJobPartnerId(job: Job | undefined): number | undefined {
  const customers = useCustomersIfAny();
  return job?.customerId ? customers?.customers.find((c) => c.id === job.customerId)?.odooId : undefined;
}

export function JobAddressScreen({ job }: { job: Job }) {
  const { setTicket } = useJobs();
  const { invoices } = useInvoices();
  const partnerId = useJobPartnerId(job);
  const invoice = invoices.find((i) => i.jobId === job.id && invoiceStatus(i) !== 'void');
  // A new address makes Odoo's totals stale, so the quotation is sent again with it.
  const pick = (id: number, address: string) => {
    setTicket(job.id, (t) => ({ ...t, shipTo: { id, address }, totals: undefined }));
    if (router.canGoBack()) router.back();
  };

  if (!partnerId) {
    return (
      <Text style={styles.note} testID="job-address-none">
        This customer isn&apos;t in Odoo yet, so the job uses the address typed on it: {job.address || 'none'}.
      </Text>
    );
  }
  return (
    <View style={styles.stack} testID="job-address">
      <Text style={styles.now} testID="job-address-now">
        {jobAddress(job) || 'No address'}
      </Text>
      {invoice ? (
        <Text style={styles.note} testID="job-address-locked">
          The invoice is made, so it keeps this address.
        </Text>
      ) : (
        <>
          <Text style={styles.note}>Pick the address this job is at. It goes on the estimate and the invoice in Odoo.</Text>
          <AddressPicker
            partnerId={partnerId}
            mainAddress={job.address}
            value={job.ticket?.shipTo?.id}
            onChange={pick}
            testID="job-address"
          />
          <OtherCustomer partnerId={partnerId} onPick={pick} />
        </>
      )}
      {job.customerId ? <NavRow label="Add or change addresses" detail="On the customer's page" href={{ pathname: '/customer/[id]', params: { id: job.customerId } }} testID="job-address-customer" /> : null}
    </View>
  );
}

/** Search Odoo for another customer and use their address for the job. */
function OtherCustomer({ partnerId, onPick }: { partnerId: number; onPick: (id: number, address: string) => void }) {
  const { client } = useOdoo();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!client || q.trim().length < 2) {
      setFound([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      searchContacts(client, q, partnerId)
        .then((r) => live && (setFound(r), setError(null)))
        .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [client, q, partnerId]);
  if (!client) return null;
  return (
    <View style={styles.stack} testID="job-address-other">
      <Text style={styles.label}>A different customer</Text>
      <Text style={styles.note}>The job's customer is still billed. The other customer's address goes on as the delivery address.</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Search Odoo by name or street" placeholderTextColor={colors.muted} style={styles.input} autoCorrect={false} testID="job-address-search" />
      {error ? <Text style={styles.error}>Couldn&apos;t search Odoo: {error}</Text> : null}
      {found.map((c) => (
        <Pressable key={c.id} onPress={() => onPick(c.id, c.address)} accessibilityRole="button" testID={`job-address-found-${c.id}`} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <Text style={styles.title}>{[c.parentName, c.name].filter(Boolean).join(', ') || 'No name'}</Text>
          <Text style={styles.line}>{c.address || 'No address in Odoo'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: type.value, fontWeight: '900', color: colors.text, marginTop: 8 },
  input: { minHeight: touch.min, borderWidth: 2, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: type.body, color: colors.text, backgroundColor: colors.bg },
  option: { minHeight: touch.min, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg, gap: 2 },
  pressed: { backgroundColor: colors.safety },
  title: { fontSize: 16, fontWeight: '800', color: colors.muted },
  line: { fontSize: type.body, fontWeight: '800', color: colors.text },
  error: { fontSize: 16, fontWeight: '700', color: colors.stop },
  stack: { gap: 12 },
  now: { fontSize: type.value, fontWeight: '900', color: colors.text },
  note: { fontSize: type.body, fontWeight: '600', color: colors.muted },
});
