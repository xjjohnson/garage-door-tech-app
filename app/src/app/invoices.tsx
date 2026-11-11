import { Page } from '../components/Page';
import { InvoicesScreen } from '../screens/InvoicesScreen';

export default function PageRoute() {
  return (
    <Page title="Invoices" testID="invoices-page">
      <InvoicesScreen />
    </Page>
  );
}
