import { Page } from '../components/Page';
import { WarehouseScreen } from '../screens/WarehouseScreen';

/** /warehouse: the warehouse manager's area. */
export default function WarehouseRoute() {
  return (
    <Page title="Warehouse" testID="warehouse-page">
      <WarehouseScreen />
    </Page>
  );
}
