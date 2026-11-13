import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Page } from '../../components/Page';
import { useInvoices } from '../../lib/useInvoices';
import { InvoiceScreen } from '../../screens/InvoiceScreen';
import { colors, type } from '../../theme';

/** /invoice/<id>: one invoice, its payments, and the QR codes to pay it. */
export default function InvoiceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { invoices, loaded } = useInvoices();
  const invoice = invoices.find((i) => i.id === id);
  return (
    <Page title="Invoice" testID="invoice-page">
      {invoice ? (
        <InvoiceScreen invoice={invoice} />
      ) : loaded ? (
        <Text style={{ fontSize: type.body, color: colors.text }}>That invoice isn't saved on this phone any more.</Text>
      ) : null}
    </Page>
  );
}
