import { useLocalSearchParams } from 'expo-router';
import { Page } from '../components/Page';
import { OdooProductScreen } from '../screens/OdooProductScreen';

/** /odoo-product?line=…: pick the Odoo product a price-sheet line follows ("new" adds an add-on). */
export default function OdooProductRoute() {
  const { line } = useLocalSearchParams<{ line?: string }>();
  return (
    <Page title="Odoo products" testID="odoo-product-page">
      <OdooProductScreen line={typeof line === 'string' ? line : 'new'} />
    </Page>
  );
}
