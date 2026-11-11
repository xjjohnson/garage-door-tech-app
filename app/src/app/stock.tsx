import { Page } from '../components/Page';
import { StockScreen } from '../screens/StockScreen';

/** /stock: what's on the truck and orders for each supplier. */
export default function StockRoute() {
  return (
    <Page title="Truck stock" testID="stock-page">
      <StockScreen />
    </Page>
  );
}
