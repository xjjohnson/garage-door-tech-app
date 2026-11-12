import { useLocalSearchParams } from 'expo-router';
import { Page } from '../../../components/Page';
import { OdooRecordScreen } from '../../../screens/OdooRecordScreen';

/** /odoo-record/<quotations|invoices>/<Odoo id>: one quotation or invoice from Odoo. */
export default function OdooRecordRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const k = kind === 'invoices' ? 'invoices' : 'quotations';
  return (
    <Page title={k === 'invoices' ? 'Invoice' : 'Quotation'} testID="odoo-record-page">
      <OdooRecordScreen kind={k} id={Number(id)} />
    </Page>
  );
}
