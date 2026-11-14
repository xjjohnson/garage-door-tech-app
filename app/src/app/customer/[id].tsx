import { useLocalSearchParams } from 'expo-router';
import { Text } from '../../components/AppText';
import { Page } from '../../components/Page';
import { useCustomers } from '../../lib/useCustomers';
import { CustomerScreen } from '../../screens/CustomerScreen';
import { colors, type } from '../../theme';

/** /customer/<id>: one customer and their jobs. */
export default function CustomerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { customers, loaded } = useCustomers();
  const customer = customers.find((c) => c.id === id);
  return (
    <Page title="Customer" testID="customer-page">
      {customer ? (
        <CustomerScreen customer={customer} />
      ) : loaded ? (
        <Text style={{ fontSize: type.body, color: colors.text }}>That customer isn't saved on this phone any more.</Text>
      ) : null}
    </Page>
  );
}
