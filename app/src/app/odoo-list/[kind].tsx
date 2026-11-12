import { useLocalSearchParams } from 'expo-router';
import { Page } from '../../components/Page';
import { OdooListScreen } from '../../screens/OdooListScreen';

/** /odoo-list/quotations and /odoo-list/invoices: Odoo's own lists. */
export default function OdooListRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const k = kind === 'invoices' ? 'invoices' : 'quotations';
  return (
    <Page title={k === 'invoices' ? 'Odoo invoices' : 'Odoo quotations'} testID="odoo-list-page">
      <OdooListScreen key={k} kind={k} />
    </Page>
  );
}
