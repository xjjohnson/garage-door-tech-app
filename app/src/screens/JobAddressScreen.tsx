/**
 * Which of the customer's addresses a job is at, opened from the job's page
 * under Customer: their main address or one of the addresses under their Odoo
 * contact (the house, when a property manager is the customer). The pick is
 * the job's delivery address (partner_shipping_id) on its quotation and
 * invoice in Odoo; the ticket only shows it.
 */
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AddressPicker } from '../components/AddressPicker';
import { NavRow } from '../components/Buttons';
import { invoiceStatus } from '../lib/invoices';
import { Job } from '../lib/jobs';
import { useCustomersIfAny } from '../lib/useCustomers';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { colors, type } from '../theme';

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
            // A new address makes Odoo's totals stale, so the quotation is sent again with it.
            onChange={(id, address) => {
              setTicket(job.id, (t) => ({ ...t, shipTo: { id, address }, totals: undefined }));
              if (router.canGoBack()) router.back();
            }}
            testID="job-address"
          />
        </>
      )}
      {job.customerId ? <NavRow label="Add or change addresses" detail="On the customer's page" href={{ pathname: '/customer/[id]', params: { id: job.customerId } }} testID="job-address-customer" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  now: { fontSize: type.value, fontWeight: '900', color: colors.text },
  note: { fontSize: type.body, fontWeight: '600', color: colors.muted },
});
