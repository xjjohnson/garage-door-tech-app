import { Page } from '../components/Page';
import { CustomersScreen } from '../screens/CustomersScreen';

export default function CustomersRoute() {
  return (
    <Page title="Customers" testID="customers-page">
      <CustomersScreen />
    </Page>
  );
}
